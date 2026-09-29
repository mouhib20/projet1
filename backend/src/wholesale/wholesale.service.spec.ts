import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { WholesaleService } from './wholesale.service';
import { Utilisateur } from '../users/user.entity';
import { CaisseService } from '../caisse/caisse.service';
import { StoreContextService } from '../store-context/store-context.service';

describe('WholesaleService', () => {
    let service: WholesaleService;
    let dataSource: { query: jest.Mock; transaction: jest.Mock };
    let caisseService: { acteurRequis: jest.Mock };
    let storeContext: { requireMagasinId: jest.Mock; getMagasinId: jest.Mock };
    let usersRepo: any;

    beforeEach(async () => {
        dataSource = { query: jest.fn(), transaction: jest.fn() };
        caisseService = { acteurRequis: jest.fn().mockResolvedValue({ id: 1, nom: 'X', role: 'admin' }) };
        storeContext = { requireMagasinId: jest.fn().mockReturnValue(1), getMagasinId: jest.fn().mockReturnValue(1) };
        usersRepo = { findOne: jest.fn(), find: jest.fn(), save: jest.fn(), create: jest.fn((v) => v), update: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WholesaleService,
                { provide: getRepositoryToken(Utilisateur), useValue: usersRepo },
                { provide: DataSource, useValue: dataSource },
                { provide: CaisseService, useValue: caisseService },
                { provide: StoreContextService, useValue: storeContext },
            ],
        }).compile();

        service = module.get<WholesaleService>(WholesaleService);
    });

    describe('getCatalogue() — shared, standalone (no store owns the products)', () => {
        it('subtracts the reserved quantity from stock to compute quantite_disponible', async () => {
            dataSource.query.mockResolvedValueOnce([{ id_listing: 1, prix_gros: '10.00', qte_min: 1, quantite_totale: 20, reserve: 8 }]);
            const result = await service.getCatalogue('ecran');
            expect(result).toEqual([expect.objectContaining({ quantite_disponible: 12 })]);
        });

        it('never lets availability go negative', async () => {
            dataSource.query.mockResolvedValueOnce([{ id_listing: 1, prix_gros: '10.00', qte_min: 1, quantite_totale: 3, reserve: 9 }]);
            const result = await service.getCatalogue();
            expect(result[0].quantite_disponible).toBe(0);
        });
    });

    describe('listerCommandes() — isolation: only wholesale_editor / super_admin see every order', () => {
        it('a regular store only sees its own orders (id_magasin_demandeur filter applied)', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 2, nom: 'Employe', role: 'admin' });
            storeContext.getMagasinId.mockReturnValue(1);
            dataSource.query.mockResolvedValueOnce([]); // orders query
            await service.listerCommandes('Bearer x');
            const [sql, params] = dataSource.query.mock.calls[0];
            expect(sql).toMatch(/WHERE o\.id_magasin_demandeur = \$1/);
            expect(params).toEqual([1]);
        });

        it('wholesale_editor sees every order (no WHERE filter), even with no store of its own', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'wholesale_editor' });
            storeContext.getMagasinId.mockReturnValue(null);
            dataSource.query.mockResolvedValueOnce([]);
            await service.listerCommandes('Bearer x');
            const [sql, params] = dataSource.query.mock.calls[0];
            expect(sql).not.toMatch(/WHERE o\.id_magasin_demandeur/);
            expect(params).toEqual([]);
        });

        it('super_admin also sees every order', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            storeContext.getMagasinId.mockReturnValue(null);
            dataSource.query.mockResolvedValueOnce([]);
            await service.listerCommandes('Bearer x');
            const [sql] = dataSource.query.mock.calls[0];
            expect(sql).not.toMatch(/WHERE o\.id_magasin_demandeur/);
        });
    });

    describe('editeurRequis (via listerOffres) — wholesale_editor / super_admin only, store permission never suffices', () => {
        it('rejects a regular store admin even with wholesale permission', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'X', role: 'admin' });
            await expect(service.listerOffres('Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('allows wholesale_editor', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'wholesale_editor' });
            dataSource.query.mockResolvedValueOnce([]);
            await expect(service.listerOffres('Bearer x')).resolves.toEqual([]);
        });

        it('allows super_admin', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            dataSource.query.mockResolvedValueOnce([]);
            await expect(service.listerOffres('Bearer x')).resolves.toEqual([]);
        });
    });

    describe('superAdminRequis (via creerEditeur) — super_admin only, not wholesale_editor itself', () => {
        it('rejects wholesale_editor from creating another editor account', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'wholesale_editor' });
            await expect(
                service.creerEditeur({ nom: 'X', username: 'x', password: 'password123' }, 'Bearer x'),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('allows super_admin to create a wholesale_editor account with no store', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            usersRepo.findOne.mockResolvedValue(null);
            usersRepo.save.mockImplementation((v: any) => Promise.resolve({ ...v, id: 5, password: 'hashed' }));
            const result = await service.creerEditeur({ nom: 'Nouveau', username: 'nouveau', password: 'password123' }, 'Bearer x');
            expect(result).not.toHaveProperty('password');
            expect(usersRepo.save).toHaveBeenCalledWith(expect.objectContaining({ role: 'wholesale_editor', id_magasin: null }));
        });

        it('rejects a duplicate username', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            usersRepo.findOne.mockResolvedValue({ id: 2, username: 'nouveau' });
            await expect(
                service.creerEditeur({ nom: 'Nouveau', username: 'nouveau', password: 'password123' }, 'Bearer x'),
            ).rejects.toBeInstanceOf(BadRequestException);
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
