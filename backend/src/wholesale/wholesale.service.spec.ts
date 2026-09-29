import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { WholesaleService } from './wholesale.service';
import { CaisseService } from '../caisse/caisse.service';
import { StoreContextService } from '../store-context/store-context.service';

describe('WholesaleService', () => {
    let service: WholesaleService;
    let dataSource: { query: jest.Mock; transaction: jest.Mock };
    let caisseService: { acteurRequis: jest.Mock };
    let storeContext: { requireMagasinId: jest.Mock };

    beforeEach(async () => {
        dataSource = { query: jest.fn(), transaction: jest.fn() };
        caisseService = { acteurRequis: jest.fn().mockResolvedValue({ id: 1, nom: 'X', role: 'admin' }) };
        storeContext = { requireMagasinId: jest.fn().mockReturnValue(1) };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WholesaleService,
                { provide: DataSource, useValue: dataSource },
                { provide: CaisseService, useValue: caisseService },
                { provide: StoreContextService, useValue: storeContext },
            ],
        }).compile();

        service = module.get<WholesaleService>(WholesaleService);
    });

    describe('getCatalogue() — shared across every store, availability subtracts reserved live', () => {
        it('returns [] without querying the listing table when no store is flagged wholesale', async () => {
            dataSource.query.mockResolvedValueOnce([]); // grossisteId() lookup: no row
            const result = await service.getCatalogue();
            expect(result).toEqual([]);
            expect(dataSource.query).toHaveBeenCalledTimes(1);
        });

        it('subtracts the reserved quantity from stock to compute quantite_disponible', async () => {
            dataSource.query
                .mockResolvedValueOnce([{ id_magasin: 5 }]) // grossisteId()
                .mockResolvedValueOnce([{ id_listing: 1, prix_gros: '10.00', qte_min: 1, quantite_totale: 20, reserve: 8 }]);
            const result = await service.getCatalogue('ecran');
            expect(result).toEqual([expect.objectContaining({ quantite_disponible: 12 })]);
        });

        it('never lets availability go negative', async () => {
            dataSource.query
                .mockResolvedValueOnce([{ id_magasin: 5 }])
                .mockResolvedValueOnce([{ id_listing: 1, prix_gros: '10.00', qte_min: 1, quantite_totale: 3, reserve: 9 }]);
            const result = await service.getCatalogue();
            expect(result[0].quantite_disponible).toBe(0);
        });
    });

    describe('listerCommandes() — isolation: only the wholesale store sees every order', () => {
        it('a regular store only sees its own orders (id_magasin_demandeur filter applied)', async () => {
            storeContext.requireMagasinId.mockReturnValue(1);
            dataSource.query
                .mockResolvedValueOnce([{ id_magasin: 5 }]) // grossisteId() -> store 5, caller is store 1
                .mockResolvedValueOnce([]); // orders query
            await service.listerCommandes('Bearer x');
            const [sql, params] = dataSource.query.mock.calls[1];
            expect(sql).toMatch(/WHERE o\.id_magasin_demandeur = \$1/);
            expect(params).toEqual([1]);
        });

        it('the wholesale store itself sees every order (no WHERE filter)', async () => {
            storeContext.requireMagasinId.mockReturnValue(5);
            dataSource.query
                .mockResolvedValueOnce([{ id_magasin: 5 }]) // grossisteId() -> store 5, caller IS store 5
                .mockResolvedValueOnce([]);
            await service.listerCommandes('Bearer x');
            const [sql, params] = dataSource.query.mock.calls[1];
            expect(sql).not.toMatch(/WHERE o\.id_magasin_demandeur/);
            expect(params).toEqual([]);
        });
    });

    describe('estMagasinGrossisteRequis (via listerOffres) — store-identity check, not role/permission', () => {
        it('rejects a store that is not the flagged wholesale store, even with wholesale permission', async () => {
            storeContext.requireMagasinId.mockReturnValue(1);
            dataSource.query.mockResolvedValueOnce([{ id_magasin: 5 }]); // grossisteId() -> store 5, caller is store 1
            await expect(service.listerOffres('Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('rejects every store when no wholesale store is configured at all', async () => {
            storeContext.requireMagasinId.mockReturnValue(1);
            dataSource.query.mockResolvedValueOnce([]); // grossisteId() -> none
            await expect(service.listerOffres('Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('allows the flagged wholesale store itself', async () => {
            storeContext.requireMagasinId.mockReturnValue(5);
            dataSource.query
                .mockResolvedValueOnce([{ id_magasin: 5 }]) // grossisteId()
                .mockResolvedValueOnce([]); // listerOffres query itself
            await expect(service.listerOffres('Bearer x')).resolves.toEqual([]);
        });
    });

    describe('annulerCommande() — cancellation forbidden once shipping preparation has started', () => {
        it('rejects cancelling an order already en_preparation', async () => {
            storeContext.requireMagasinId.mockReturnValue(1);
            dataSource.query.mockResolvedValueOnce([{ id: 7, id_magasin_demandeur: 1, statut: 'en_preparation' }]);
            await expect(service.annulerCommande(7, 'Bearer x')).rejects.toBeInstanceOf(BadRequestException);
        });

        it('rejects cancelling an order already envoyee', async () => {
            storeContext.requireMagasinId.mockReturnValue(1);
            dataSource.query.mockResolvedValueOnce([{ id: 7, id_magasin_demandeur: 1, statut: 'envoyee' }]);
            await expect(service.annulerCommande(7, 'Bearer x')).rejects.toBeInstanceOf(BadRequestException);
        });

        it('allows cancelling an order still en_attente', async () => {
            storeContext.requireMagasinId.mockReturnValue(1);
            dataSource.query.mockResolvedValueOnce([{ id: 7, id_magasin_demandeur: 1, statut: 'en_attente' }]);
            dataSource.transaction.mockImplementation(async (cb) =>
                cb({ query: jest.fn().mockResolvedValue([{ statut: 'en_attente' }]) }),
            );
            await expect(service.annulerCommande(7, 'Bearer x')).resolves.toBeUndefined();
        });

        it('never lets a store cancel another store\'s order', async () => {
            storeContext.requireMagasinId.mockReturnValue(1);
            dataSource.query.mockResolvedValueOnce([{ id: 7, id_magasin_demandeur: 2, statut: 'en_attente' }]);
            await expect(service.annulerCommande(7, 'Bearer x')).rejects.toBeInstanceOf(NotFoundException);
        });
    });
});
