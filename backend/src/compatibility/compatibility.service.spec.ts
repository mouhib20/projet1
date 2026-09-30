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

    describe('reference-data endpoints (brands/models/part-types) — editor-only reads and writes', () => {
        it('listerMarques rejects a regular store admin', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'X', role: 'admin' });
            await expect(service.listerMarques('Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('listerMarques allows compat_editor and returns the query result', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query.mockResolvedValue([{ id: 1, nom: 'Samsung', logo: null }]);
            await expect(service.listerMarques('Bearer x')).resolves.toEqual([{ id: 1, nom: 'Samsung', logo: null }]);
        });

        it('creerModele rejects a store admin', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'X', role: 'admin' });
            await expect(
                service.creerModele({ id_brand: 1, nom: 'A03s' }, 'Bearer x'),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('creerTypePiece requires all three language names', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            await expect(
                service.creerTypePiece({ nom_fr: 'Écran', nom_en: '', nom_ar: 'شاشة' }, 'Bearer x'),
            ).rejects.toThrow();
        });

        it('modifierModele rejects a store admin', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'X', role: 'admin' });
            await expect(service.modifierModele(1, { image: '/x.png' }, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('modifierModele allows compat_editor and updates only the image', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query.mockResolvedValue(undefined);
            await service.modifierModele(7, { image: '/uploads/compat-models/x.png' }, 'Bearer x');
            const [sql, params] = dataSource.query.mock.calls[0];
            expect(sql).toMatch(/UPDATE device_model SET image = COALESCE\(\$2, image\) WHERE id = \$1/);
            expect(params).toEqual([7, '/uploads/compat-models/x.png']);
        });
    });

    describe('modelesPourGroupe() — the "confirmed compatible devices" list, no editor check (matches piecesPourModele)', () => {
        it('joins compat_group_model/device_model/brand filtered by the group id', async () => {
            dataSource.query.mockResolvedValue([]);
            await service.modelesPourGroupe(10);
            const [sql, params] = dataSource.query.mock.calls[0];
            expect(sql).toMatch(/WHERE cgm\.id_group = \$1/);
            expect(params).toEqual([10]);
            expect(caisseService.acteurRequis).not.toHaveBeenCalled();
        });
    });

    describe('obtenirGroupe() — editor-only, 404 when missing', () => {
        it('rejects a store admin', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'X', role: 'admin' });
            await expect(service.obtenirGroupe(1, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('throws NotFoundException when the group does not exist', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query.mockResolvedValue([]);
            await expect(service.obtenirGroupe(999, 'Bearer x')).rejects.toBeInstanceOf(NotFoundException);
        });

        it('returns the group with its linked model ids', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query
                .mockResolvedValueOnce([{ id: 1, note: null, image: null, id_part_type: 2 }])
                .mockResolvedValueOnce([{ id_model: 10 }, { id_model: 11 }]);
            await expect(service.obtenirGroupe(1, 'Bearer x')).resolves.toEqual({
                id: 1, note: null, image: null, id_part_type: 2, modeleIds: [10, 11],
            });
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
