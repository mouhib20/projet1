import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CompatibilityService } from './compatibility.service';
import { Utilisateur } from '../users/user.entity';
import { CaisseService } from '../caisse/caisse.service';
import { StoreContextService } from '../store-context/store-context.service';

describe('CompatibilityService', () => {
    let service: CompatibilityService;
    let dataSource: { query: jest.Mock; transaction: jest.Mock };
    let caisseService: { acteurRequis: jest.Mock };
    let storeContext: { requireMagasinId: jest.Mock };
    let usersRepo: any;

    beforeEach(async () => {
        dataSource = { query: jest.fn(), transaction: jest.fn() };
        caisseService = { acteurRequis: jest.fn() };
        storeContext = { requireMagasinId: jest.fn().mockReturnValue(1) };
        usersRepo = { findOne: jest.fn(), find: jest.fn(), save: jest.fn(), create: jest.fn((v) => v), update: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CompatibilityService,
                { provide: getRepositoryToken(Utilisateur), useValue: usersRepo },
                { provide: DataSource, useValue: dataSource },
                { provide: CaisseService, useValue: caisseService },
                { provide: StoreContextService, useValue: storeContext },
            ],
        }).compile();

        service = module.get<CompatibilityService>(CompatibilityService);
    });

    describe('rechercheModeles() — the shared catalogue, deliberately not store-scoped', () => {
        it('returns [] and never queries for a term shorter than 2 characters', async () => {
            expect(await service.rechercheModeles('a')).toEqual([]);
            expect(await service.rechercheModeles('')).toEqual([]);
            expect(dataSource.query).not.toHaveBeenCalled();
        });

        it('queries with NO id_magasin filter anywhere (intentionally cross-store)', async () => {
            dataSource.query.mockResolvedValue([]);
            await service.rechercheModeles('a03s');
            const [sql] = dataSource.query.mock.calls[0];
            expect(sql).not.toMatch(/id_magasin/i);
        });

        it('groups rows by model and collects their compat groups', async () => {
            dataSource.query.mockResolvedValue([
                { id_model: 1, modele: 'A03s', nom_commercial: null, code: 'SM-A037', id_brand: 1, marque: 'Samsung', id_group: 10, id_part_type: 2, nom_fr: 'Écran', nom_en: 'Screen', nom_ar: 'شاشة' },
                { id_model: 1, modele: 'A03s', nom_commercial: null, code: 'SM-A037', id_brand: 1, marque: 'Samsung', id_group: 11, id_part_type: 3, nom_fr: 'Batterie', nom_en: 'Battery', nom_ar: 'بطارية' },
                { id_model: 2, modele: 'A12', nom_commercial: null, code: null, id_brand: 1, marque: 'Samsung', id_group: null, id_part_type: null, nom_fr: null, nom_en: null, nom_ar: null },
            ]);
            const result = await service.rechercheModeles('samsung');
            expect(result).toHaveLength(2);
            expect(result[0].groupes).toHaveLength(2);
            expect(result[1].groupes).toHaveLength(0); // model with no linked group yet
        });
    });

    describe('piecesPourModele() — stock/price scoped to the caller\'s own store only', () => {
        it('filters the store inside the LEFT JOIN, not a WHERE (so a never-stocked group still appears)', async () => {
            dataSource.query.mockResolvedValue([]);
            await service.piecesPourModele(5);
            const [sql, params] = dataSource.query.mock.calls[0];
            expect(sql).toMatch(/LEFT JOIN article a ON a\.compat_group_id = cg\.id AND a\.id_magasin = \$2/i);
            expect(params).toEqual([5, 1]); // id_modele, id_magasin from StoreContextService
            expect(storeContext.requireMagasinId).toHaveBeenCalled();
        });
    });

    describe('editeurRequis (via creerGroupe) — compat_editor or super_admin only', () => {
        it('rejects a regular store admin', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'X', role: 'admin' });
            await expect(
                service.creerGroupe({ id_part_type: 1, modeleIds: [1] }, 'Bearer x'),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('allows compat_editor', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.transaction.mockImplementation(async (cb) => cb({ query: jest.fn().mockResolvedValue([{ id: 42 }]) }));
            await expect(
                service.creerGroupe({ id_part_type: 1, modeleIds: [1, 2] }, 'Bearer x'),
            ).resolves.toEqual({ id: 42 });
        });

        it('allows super_admin', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            dataSource.transaction.mockImplementation(async (cb) => cb({ query: jest.fn().mockResolvedValue([{ id: 43 }]) }));
            await expect(
                service.creerGroupe({ id_part_type: 1, modeleIds: [1] }, 'Bearer x'),
            ).resolves.toEqual({ id: 43 });
        });
    });

    describe('superAdminRequis (via supprimerGroupe/creerEditeur) — super_admin only, not compat_editor', () => {
        it('rejects compat_editor from deleting a group', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            await expect(service.supprimerGroupe(1, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('rejects compat_editor from creating another editor account', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            await expect(
                service.creerEditeur({ nom: 'X', username: 'x', password: 'password123' }, 'Bearer x'),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('allows super_admin to create a compat_editor account', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            usersRepo.findOne.mockResolvedValue(null);
            usersRepo.save.mockImplementation((v: any) => Promise.resolve({ ...v, id: 5, password: 'hashed' }));
            const result = await service.creerEditeur({ nom: 'Nouveau', username: 'nouveau', password: 'password123' }, 'Bearer x');
            expect(result).not.toHaveProperty('password');
            expect(usersRepo.save).toHaveBeenCalledWith(expect.objectContaining({ role: 'compat_editor', id_magasin: null }));
        });
    });

    describe('creerSuggestion() — any store user, scoped to their own store', () => {
        it('records the caller\'s own id_magasin, never a client-supplied one', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 2, nom: 'Employe', role: 'vendeur' });
            dataSource.query.mockResolvedValue([{ id: 7 }]);
            await service.creerSuggestion({ texte_libre: 'Écran manquant pour X' }, 'Bearer x');
            const [, params] = dataSource.query.mock.calls[0];
            expect(params[0]).toBe(1); // from StoreContextService.requireMagasinId(), not the body
        });
    });

    describe('traiterSuggestion() — 404 when the suggestion does not exist', () => {
        it('throws NotFoundException when nothing was updated', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query.mockResolvedValue([[], 0]);
            await expect(service.traiterSuggestion(999, 'acceptee', 'Bearer x')).rejects.toBeInstanceOf(NotFoundException);
        });
    });
});
