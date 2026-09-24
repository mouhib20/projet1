import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Client } from './client.entity';
import { ClientDepot } from './client-depot.entity';
import { CaisseService } from '../caisse/caisse.service';

@Injectable()
export class ClientsService {
    constructor(
        @InjectRepository(Client)
        private readonly repo: Repository<Client>,
        @InjectRepository(ClientDepot)
        private readonly depotRepo: Repository<ClientDepot>,
        private readonly dataSource: DataSource,
        private readonly caisseService: CaisseService,
    ) { }

    findAll(): Promise<Client[]> {
        return this.repo.find({ order: { id_client: 'DESC' } });
    }

    async findOne(id: number): Promise<Client> {
        const client = await this.repo.findOne({
            where: { id_client: id },
            relations: ['ventes', 'reparations'],
        });
        if (!client) throw new NotFoundException(`Client #${id} introuvable`);
        return client;
    }

    /**
     * Creates a client, unless the same person (same name and phone, ignoring case and spaces)
     * already exists: then that client is returned. A repeated click or request therefore never
     * makes a duplicate, even when two identical requests arrive at the same time.
     */
    async create(dto: Partial<Client>): Promise<Client> {
        const nom = String(dto.nom ?? '').trim();
        if (!nom) throw new BadRequestException('Le nom est obligatoire.');
        const telephone = String(dto.telephone ?? '').trim();

        return this.dataSource.transaction(async (m) => {
            // Identical requests wait for each other, so the second one finds the first one's client
            await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`client:${nom.toLowerCase()}|${telephone}`]);
            const existant = await m.getRepository(Client)
                .createQueryBuilder('c')
                .where('lower(trim(c.nom)) = :nom', { nom: nom.toLowerCase() })
                .andWhere("coalesce(trim(c.telephone), '') = :tel", { tel: telephone })
                .orderBy('c.id_client', 'ASC')
                .getOne();
            if (existant) return existant;
            return m.save(m.create(Client, { ...dto, nom, telephone: telephone || (undefined as any) }));
        });
    }

    /**
     * Merges clients that are the same person (same name and phone): the oldest record is kept,
     * tickets, sales, deposits and balance usage move to it, balances are added up, the others are deleted.
     */
    async fusionnerDoublons(): Promise<{ groupes: number; supprimes: number }> {
        return this.dataSource.transaction(async (m) => {
            const groupes: { ids: number[] }[] = await m.query(
                `SELECT array_agg(id_client ORDER BY id_client) AS ids
                 FROM client
                 GROUP BY lower(trim(nom)), coalesce(trim(telephone), '')
                 HAVING count(*) > 1`,
            );
            let supprimes = 0;
            for (const g of groupes) {
                const [garde, ...autres] = g.ids;
                for (const table of ['reparation', 'vente', 'client_depot', 'client_solde_usage']) {
                    await m.query(`UPDATE ${table} SET id_client = $1 WHERE id_client = ANY($2)`, [garde, autres]);
                }
                await m.query(
                    `UPDATE client SET solde = (SELECT COALESCE(SUM(solde), 0) FROM client WHERE id_client = ANY($2)) WHERE id_client = $1`,
                    [garde, g.ids],
                );
                await m.query(`DELETE FROM client WHERE id_client = ANY($1)`, [autres]);
                supprimes += autres.length;
            }
            return { groupes: groupes.length, supprimes };
        });
    }

    async update(id: number, dto: Partial<Client>): Promise<Client> {
        await this.findOne(id);
        await this.repo.update(id, dto);
        return this.findOne(id);
    }

    async remove(id: number): Promise<void> {
        await this.findOne(id);
        await this.repo.delete(id);
    }

    /** Records a deposit and credits the client's balance (solde) accordingly. */
    async deposer(clientId: number, montant: number, note?: string, date?: string, authorization?: string): Promise<Client> {
        if (!montant || montant <= 0) {
            throw new BadRequestException('Le montant du dépôt doit être positif.');
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const client = await queryRunner.manager.findOne(Client, { where: { id_client: clientId } });
            if (!client) throw new NotFoundException(`Client #${clientId} introuvable`);

            const depot = queryRunner.manager.create(ClientDepot, {
                montant,
                date: date || new Date().toISOString().split('T')[0],
                note: note || null,
                client: { id_client: clientId },
            });
            await queryRunner.manager.save(depot);

            client.solde = Number(client.solde || 0) + Number(montant);
            await queryRunner.manager.save(client);

            await queryRunner.commitTransaction();

            const acteur = await this.caisseService.acteurOuSysteme(authorization);
            await this.caisseService.enregistrerAuto(acteur, {
                type: 'entree',
                source: 'depot_client',
                montant: Number(montant),
                motif: `Dépôt client ${client.nom}`,
                reference: 'depot-client:' + clientId,
            });
            return this.findOne(clientId);
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    getDepots(clientId: number): Promise<ClientDepot[]> {
        return this.depotRepo.find({
            where: { client: { id_client: clientId } },
            order: { id_depot: 'DESC' },
        });
    }

    async getDepotsSummary(): Promise<{ id_client: number; nom: string; totalDepose: number; solde: number }[]> {
        const clients = await this.repo.find();
        const totals = await this.depotRepo
            .createQueryBuilder('d')
            .select('d.id_client', 'id_client')
            .addSelect('COALESCE(SUM(d.montant), 0)', 'total')
            .groupBy('d.id_client')
            .getRawMany();

        const totalsMap = new Map<number, number>(
            totals.map((t: any) => [Number(t.id_client), Number(t.total)])
        );

        return clients
            .filter(c => totalsMap.has(c.id_client) || Number(c.solde) > 0)
            .map(c => ({
                id_client: c.id_client,
                nom: c.nom,
                totalDepose: totalsMap.get(c.id_client) || 0,
                solde: Number(c.solde) || 0,
            }));
    }

    /**
     * Deducts an amount from a client's balance (used when a POS sale is partly or
     * fully paid from the client's deposited credit). Throws if the balance is insufficient.
     */
    async utiliserSolde(clientId: number, montant: number): Promise<void> {
        const client = await this.repo.findOne({ where: { id_client: clientId } });
        if (!client) throw new NotFoundException(`Client #${clientId} introuvable`);
        if (Number(client.solde || 0) < montant) {
            throw new BadRequestException(
                `Solde insuffisant pour "${client.nom}". Disponible: ${client.solde}, demandé: ${montant}`
            );
        }
        client.solde = Number(client.solde) - montant;
        await this.repo.save(client);
    }
}
