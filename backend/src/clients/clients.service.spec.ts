import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ClientsService } from './clients.service';
import { Client } from './client.entity';
import { ClientDepot } from './client-depot.entity';
import { CaisseService } from '../caisse/caisse.service';
import { StoreContextService } from '../store-context/store-context.service';

describe('ClientsService — cross-store isolation (the pivotal test)', () => {
    let service: ClientsService;
    let clientRepo: Partial<Record<keyof Repository<Client>, jest.Mock>>;
    let storeContext: StoreContextService;

    // Two clients living in two different stores, as if both already existed in the DB.
    const clientMagasinA = { id_client: 1, nom: 'Client A', telephone: '111', solde: 0, id_magasin: 1 };
    const clientMagasinB = { id_client: 2, nom: 'Client B', telephone: '222', solde: 0, id_magasin: 2 };
    const tousLesClients = [clientMagasinA, clientMagasinB];

    beforeEach(async () => {
        clientRepo = {
            find: jest.fn((opts: any) => Promise.resolve(tousLesClients.filter((c) => c.id_magasin === opts?.where?.id_magasin))),
            findOne: jest.fn((opts: any) => Promise.resolve(
                tousLesClients.find((c) => c.id_client === opts.where.id_client && c.id_magasin === opts.where.id_magasin) ?? null,
            )),
            update: jest.fn(),
            delete: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ClientsService,
                StoreContextService,
                { provide: getRepositoryToken(Client), useValue: clientRepo },
                { provide: getRepositoryToken(ClientDepot), useValue: { find: jest.fn(), createQueryBuilder: jest.fn() } },
                { provide: DataSource, useValue: { transaction: jest.fn(), query: jest.fn() } },
                { provide: CaisseService, useValue: {} },
            ],
        })
            .overrideProvider(StoreContextService)
            .useValue(makeFakeStoreContext(1)) // acting user belongs to store A (id_magasin = 1)
            .compile();

        service = module.get<ClientsService>(ClientsService);
        storeContext = module.get<StoreContextService>(StoreContextService);
    });

    function makeFakeStoreContext(id_magasin: number | null): StoreContextService {
        const s = Object.create(StoreContextService.prototype) as StoreContextService;
        (s as any).getMagasinId = () => id_magasin;
        (s as any).requireMagasinId = () => {
            if (id_magasin == null) throw new Error('no store');
            return id_magasin;
        };
        (s as any).isSuperAdmin = () => false;
        return s;
    }

    it("findAll only returns store A's own client, never store B's", async () => {
        const result = await service.findAll();
        expect(result).toEqual([clientMagasinA]);
        expect(result.find((c) => c.id_magasin === 2)).toBeUndefined();
    });

    it("findOne on store A's own client succeeds", async () => {
        await expect(service.findOne(1)).resolves.toMatchObject({ id_client: 1 });
    });

    it("findOne on store B's client — belonging to a DIFFERENT store — throws NotFoundException, never returns it", async () => {
        await expect(service.findOne(2)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("update on store B's client throws, and never calls repo.update (no mutation happens)", async () => {
        await expect(service.update(2, { nom: 'Hacked' })).rejects.toBeInstanceOf(NotFoundException);
        expect(clientRepo.update).not.toHaveBeenCalled();
    });

    it("remove on store B's client throws, and never calls repo.delete (no deletion happens)", async () => {
        await expect(service.remove(2)).rejects.toBeInstanceOf(NotFoundException);
        expect(clientRepo.delete).not.toHaveBeenCalled();
    });

    it('a malicious id_magasin field in the update body is stripped, never lets a client be moved to another store', async () => {
        await service.update(1, { nom: 'Client A renamed', id_magasin: 2 } as any);
        expect(clientRepo.update).toHaveBeenCalledWith(1, expect.not.objectContaining({ id_magasin: 2 }));
    });

    it('utiliserSolde on a client from another store throws, balance is never touched', async () => {
        await expect(service.utiliserSolde(2, 10)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ajouterDette on a client from another store throws, no debt is recorded', async () => {
        await expect(service.ajouterDette(2, 10)).rejects.toBeInstanceOf(NotFoundException);
    });
});
