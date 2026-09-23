import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Client } from './client.entity';
import { ClientDepot } from './client-depot.entity';

@Injectable()
export class ClientsService {
    constructor(
        @InjectRepository(Client)
        private readonly repo: Repository<Client>,
        @InjectRepository(ClientDepot)
        private readonly depotRepo: Repository<ClientDepot>,
        private readonly dataSource: DataSource,
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

    create(dto: Partial<Client>): Promise<Client> {
        const client = this.repo.create(dto);
        return this.repo.save(client);
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
    async deposer(clientId: number, montant: number, note?: string, date?: string): Promise<Client> {
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
