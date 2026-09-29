import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Client } from './client.entity';
import { ClientDepot } from './client-depot.entity';
import { CaisseService } from '../caisse/caisse.service';
import { StoreContextService } from '../store-context/store-context.service';

@Injectable()
export class ClientsService {
    constructor(
        @InjectRepository(Client)
        private readonly repo: Repository<Client>,
        @InjectRepository(ClientDepot)
        private readonly depotRepo: Repository<ClientDepot>,
        private readonly dataSource: DataSource,
        private readonly caisseService: CaisseService,
        private readonly storeContext: StoreContextService,
    ) { }

    findAll(): Promise<Client[]> {
        return this.repo.find({ where: { id_magasin: this.storeContext.requireMagasinId() }, order: { id_client: 'DESC' } });
    }

    async findOne(id: number): Promise<Client> {
        const client = await this.repo.findOne({
            where: { id_client: id, id_magasin: this.storeContext.requireMagasinId() },
            relations: ['ventes', 'reparations'],
        });
        if (!client) throw new NotFoundException(`Client #${id} introuvable`);
        return client;
    }

    /**
     * Creates a client, unless the same person (same name and phone, ignoring case and spaces)
     * already exists *in this store* — then that client is returned. A repeated click or request
     * therefore never makes a duplicate, even when two identical requests arrive at the same time.
     * (Two different stores may each have their own client with the same name/phone — never merged.)
     */
    async create(dto: Partial<Client>): Promise<Client> {
        const id_magasin = this.storeContext.requireMagasinId();
        const nom = String(dto.nom ?? '').trim();
        if (!nom) throw new BadRequestException('Le nom est obligatoire.');
        const telephone = String(dto.telephone ?? '').trim();
        // id_magasin is never taken from the request body — always the caller's own store
        const { id_magasin: _ignore, ...safeDto } = dto as any;

        return this.dataSource.transaction(async (m) => {
            // Identical requests wait for each other, so the second one finds the first one's client
            await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`client:${id_magasin}:${nom.toLowerCase()}|${telephone}`]);
            const existant = await m.getRepository(Client)
                .createQueryBuilder('c')
                .where('c.id_magasin = :id_magasin', { id_magasin })
                .andWhere('lower(trim(c.nom)) = :nom', { nom: nom.toLowerCase() })
                .andWhere("coalesce(trim(c.telephone), '') = :tel", { tel: telephone })
                .orderBy('c.id_client', 'ASC')
                .getOne();
            if (existant) return existant;
            return m.save(m.create(Client, { ...safeDto, nom, telephone: telephone || (undefined as any), id_magasin }));
        });
    }

    /**
     * Merges clients that are the same person (same name and phone) *within this store only*:
     * the oldest record is kept, tickets, sales, deposits and balance usage move to it, balances
     * are added up, the others are deleted.
     */
    async fusionnerDoublons(): Promise<{ groupes: number; supprimes: number }> {
        const id_magasin = this.storeContext.requireMagasinId();
        return this.dataSource.transaction(async (m) => {
            const groupes: { ids: number[] }[] = await m.query(
                `SELECT array_agg(id_client ORDER BY id_client) AS ids
                 FROM client
                 WHERE id_magasin = $1
                 GROUP BY lower(trim(nom)), coalesce(trim(telephone), '')
                 HAVING count(*) > 1`,
                [id_magasin],
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
        await this.findOne(id); // throws if not found or belongs to another store
        const { id_magasin: _ignore, ...safeDto } = dto as any; // never reassign a client to another store
        await this.repo.update(id, safeDto);
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
        const id_magasin = this.storeContext.requireMagasinId();

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const client = await queryRunner.manager.findOne(Client, { where: { id_client: clientId, id_magasin } });
            if (!client) throw new NotFoundException(`Client #${clientId} introuvable`);

            const depot = queryRunner.manager.create(ClientDepot, {
                montant,
                date: date || new Date().toISOString().split('T')[0],
                note: note || null,
                client: { id_client: clientId },
                id_magasin,
            } as any);
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

    async getDepots(clientId: number): Promise<ClientDepot[]> {
        await this.findOne(clientId); // throws if not found or belongs to another store
        return this.depotRepo.find({
            where: { client: { id_client: clientId } },
            order: { id_depot: 'DESC' },
        });
    }

    async getDepotsSummary(): Promise<{ id_client: number; nom: string; totalDepose: number; solde: number }[]> {
        const id_magasin = this.storeContext.requireMagasinId();
        const clients = await this.repo.find({ where: { id_magasin } });
        const totals = await this.depotRepo
            .createQueryBuilder('d')
            .select('d.id_client', 'id_client')
            .addSelect('COALESCE(SUM(d.montant), 0)', 'total')
            .where('d.id_magasin = :id_magasin', { id_magasin })
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
        const client = await this.repo.findOne({ where: { id_client: clientId, id_magasin: this.storeContext.requireMagasinId() } });
        if (!client) throw new NotFoundException(`Client #${clientId} introuvable`);
        if (Number(client.solde || 0) < montant) {
            throw new BadRequestException(
                `Solde insuffisant pour "${client.nom}". Disponible: ${client.solde}, demandé: ${montant}`
            );
        }
        client.solde = Number(client.solde) - montant;
        await this.repo.save(client);
    }

    /**
     * Records a credit sale: the client took the goods without paying this part now, so it becomes
     * a debt (the balance can go negative — unlike utiliserSolde, there is no "enough balance" check,
     * since going into debt is exactly the point).
     */
    async ajouterDette(clientId: number, montant: number): Promise<void> {
        if (!montant || montant <= 0) return;
        const client = await this.repo.findOne({ where: { id_client: clientId, id_magasin: this.storeContext.requireMagasinId() } });
        if (!client) throw new NotFoundException(`Client #${clientId} introuvable`);
        client.solde = Number(client.solde || 0) - montant;
        await this.repo.save(client);
    }

    /** Every sale line that left this client with a debt, most recent first — what they took unpaid. */
    async getCredits(clientId: number): Promise<{ id_vente: number; date: string; designation: string; qte: number; prix: number; credit: number }[]> {
        await this.findOne(clientId); // throws if not found or belongs to another store
        const rows = await this.dataSource.query(
            `SELECT v.id_vente, v.date::text AS date, COALESCE(a.designation, v.designation) AS designation,
                    v.qte, v.prix, v.credit
               FROM vente v
               LEFT JOIN article a ON a.id_article = v.id_article
              WHERE v.id_client = $1 AND v.credit IS NOT NULL AND v.credit > 0
              ORDER BY v.date DESC, v.id_vente DESC`,
            [clientId],
        );
        return rows.map((r: any) => ({
            id_vente: r.id_vente,
            date: r.date,
            designation: r.designation,
            qte: Number(r.qte) || 1,
            prix: Number(r.prix) || 0,
            credit: Number(r.credit) || 0,
        }));
    }
}
