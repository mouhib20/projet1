import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
            dataSource.query.mockResolvedValue([]); // no groups found -> autoLierArticlesOrphelins is a no-op
            await service.piecesPourModele(5);
            const mainCall = dataSource.query.mock.calls.find(([sql]) => sql.includes('LEFT JOIN article'));
            expect(mainCall).toBeDefined();
            const [sql, params] = mainCall!;
            expect(sql).toMatch(/LEFT JOIN article a ON a\.compat_group_id = cg\.id AND a\.id_magasin = \$2/i);
            expect(params).toEqual([5, 1]); // id_modele, id_magasin from StoreContextService
            expect(storeContext.requireMagasinId).toHaveBeenCalled();
        });

        it('self-heals: links an unlinked article whose own text matches a group member + part type, before reading results', async () => {
            const calls: { sql: string; params: any[] }[] = [];
            dataSource.query.mockImplementation((sql: string, params: any[]) => {
                calls.push({ sql, params });
                if (sql.includes('SELECT cg.id AS id_group')) return Promise.resolve([{ id_group: 11, nom_fr: 'Vitre', nom_en: 'Glass', nom_ar: 'زجاج' }]);
                if (sql.includes('SELECT dm.nom, b.nom AS marque')) return Promise.resolve([{ nom: 'A12', marque: 'Samsung' }]);
                return Promise.resolve([]);
            });
            await service.piecesPourModele(12);
            const update = calls.find(c => c.sql.includes('UPDATE article SET compat_group_id'));
            expect(update).toBeDefined();
            expect(update!.params).toEqual([11, 1, 'samsung', 'a12', 'a12', ['vitre', 'glass', 'زجاج', 'glace']]);
            // The self-heal runs BEFORE the main read.
            const updateIdx = calls.findIndex(c => c.sql.includes('UPDATE article SET compat_group_id'));
            const mainIdx = calls.findIndex(c => c.sql.includes('LEFT JOIN article'));
            expect(updateIdx).toBeLessThan(mainIdx);
        });

        it('self-heal matching accepts "glace" for a part type literally named "glass" (and vice versa)', async () => {
            const calls: { sql: string; params: any[] }[] = [];
            dataSource.query.mockImplementation((sql: string, params: any[]) => {
                calls.push({ sql, params });
                if (sql.includes('SELECT cg.id AS id_group')) return Promise.resolve([{ id_group: 11, nom_fr: 'glass', nom_en: 'glass', nom_ar: 'GLASS' }]);
                if (sql.includes('SELECT dm.nom, b.nom AS marque')) return Promise.resolve([{ nom: 'A12', marque: 'Samsung' }]);
                return Promise.resolve([]);
            });
            await service.piecesPourModele(12);
            const update = calls.find(c => c.sql.includes('UPDATE article SET compat_group_id'));
            expect(update!.params[5]).toEqual(expect.arrayContaining(['glass', 'glace']));
        });

        it('the UPDATE also re-points an article whose current group no longer lists its own device (a stale link), not just NULL ones', async () => {
            const calls: { sql: string; params: any[] }[] = [];
            dataSource.query.mockImplementation((sql: string, params: any[]) => {
                calls.push({ sql, params });
                if (sql.includes('SELECT cg.id AS id_group')) return Promise.resolve([{ id_group: 17, nom_fr: 'Vitre', nom_en: 'Glass', nom_ar: 'زجاج' }]);
                if (sql.includes('SELECT dm.nom, b.nom AS marque')) return Promise.resolve([{ nom: 'spark 6', marque: 'ticno' }]);
                return Promise.resolve([]);
            });
            await service.piecesPourModele(99);
            const update = calls.find(c => c.sql.includes('UPDATE article SET compat_group_id'));
            expect(update!.sql).toMatch(/compat_group_id IS NULL\s*\n\s*OR NOT EXISTS/);
            expect(update!.sql).toMatch(/WHERE cgm2\.id_group = article\.compat_group_id/);
        });

        it('does nothing extra when the model belongs to no group', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('SELECT cg.id AS id_group')) return Promise.resolve([]);
                return Promise.resolve([]);
            });
            await service.piecesPourModele(999);
            const updateCalls = dataSource.query.mock.calls.filter(([sql]) => sql.includes('UPDATE article'));
            expect(updateCalls).toHaveLength(0);
        });
    });

    describe('editeurRequis (via creerGroupe) — compat_editor or super_admin only', () => {
        it('rejects a regular store admin', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'X', role: 'admin' });
            await expect(
                service.creerGroupe({ id_part_type: 1, id_base_model: 1, modeleIds: [2] }, 'Bearer x'),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('allows compat_editor', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.transaction.mockImplementation(async (cb) => cb({ query: jest.fn().mockResolvedValue([{ id: 42 }]) }));
            await expect(
                service.creerGroupe({ id_part_type: 1, id_base_model: 1, modeleIds: [2] }, 'Bearer x'),
            ).resolves.toEqual({ id: 42 });
        });

        it('allows super_admin', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            dataSource.transaction.mockImplementation(async (cb) => cb({ query: jest.fn().mockResolvedValue([{ id: 43 }]) }));
            await expect(
                service.creerGroupe({ id_part_type: 1, id_base_model: 1, modeleIds: [] }, 'Bearer x'),
            ).resolves.toEqual({ id: 43 });
        });

        it('rejects when id_base_model is missing', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            await expect(
                service.creerGroupe({ id_part_type: 1, id_base_model: 0, modeleIds: [] }, 'Bearer x'),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('always includes the base model in compat_group_model, even if omitted from modeleIds', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            const insertedModelIds: number[] = [];
            dataSource.transaction.mockImplementation(async (cb) => cb({
                query: jest.fn().mockImplementation((sql: string, params: any[]) => {
                    if (sql.includes('INSERT INTO compat_group (')) return Promise.resolve([{ id: 42 }]);
                    if (sql.includes('INSERT INTO compat_group_model')) insertedModelIds.push(params[1]);
                    return Promise.resolve(undefined);
                }),
            }));
            await service.creerGroupe({ id_part_type: 1, id_base_model: 5, modeleIds: [6, 5, 7] }, 'Bearer x');
            expect(insertedModelIds.sort()).toEqual([5, 6, 7]); // deduped, base included exactly once
        });

        it('creerGroupe defaults statut to "confirmed" when not given', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            let insertedStatut: string | undefined;
            dataSource.transaction.mockImplementation(async (cb) => cb({
                query: jest.fn().mockImplementation((sql: string, params: any[]) => {
                    if (sql.includes('INSERT INTO compat_group (')) { insertedStatut = params[4]; return Promise.resolve([{ id: 42 }]); }
                    return Promise.resolve(undefined);
                }),
            }));
            await service.creerGroupe({ id_part_type: 1, id_base_model: 5, modeleIds: [] }, 'Bearer x');
            expect(insertedStatut).toBe('confirmed');
        });

        it('creerGroupe rejects any statut value other than "needs_test" by falling back to "confirmed"', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            let insertedStatut: string | undefined;
            dataSource.transaction.mockImplementation(async (cb) => cb({
                query: jest.fn().mockImplementation((sql: string, params: any[]) => {
                    if (sql.includes('INSERT INTO compat_group (')) { insertedStatut = params[4]; return Promise.resolve([{ id: 42 }]); }
                    return Promise.resolve(undefined);
                }),
            }));
            await service.creerGroupe({ id_part_type: 1, id_base_model: 5, modeleIds: [], statut: 'bogus' as any }, 'Bearer x');
            expect(insertedStatut).toBe('confirmed');
        });

        it('creerGroupe accepts "needs_test"', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            let insertedStatut: string | undefined;
            dataSource.transaction.mockImplementation(async (cb) => cb({
                query: jest.fn().mockImplementation((sql: string, params: any[]) => {
                    if (sql.includes('INSERT INTO compat_group (')) { insertedStatut = params[4]; return Promise.resolve([{ id: 42 }]); }
                    return Promise.resolve(undefined);
                }),
            }));
            await service.creerGroupe({ id_part_type: 1, id_base_model: 5, modeleIds: [], statut: 'needs_test' }, 'Bearer x');
            expect(insertedStatut).toBe('needs_test');
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

    describe('fusionnerGroupes() — compat_editor or super_admin (consolidation, not an arbitrary delete)', () => {
        it('rejects a store admin', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'X', role: 'admin' });
            await expect(service.fusionnerGroupes(1, 2, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('allows compat_editor (unlike supprimerGroupe, which is super_admin-only)', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query
                .mockResolvedValueOnce([{ id: 1 }]) // source exists
                .mockResolvedValueOnce([{ id: 2 }]); // target exists
            dataSource.transaction.mockImplementation(async (cb) => cb({ query: jest.fn().mockResolvedValue([]) }));
            await expect(service.fusionnerGroupes(1, 2, 'Bearer x')).resolves.toBeUndefined();
        });

        it('rejects merging a group into itself', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            await expect(service.fusionnerGroupes(5, 5, 'Bearer x')).rejects.toBeInstanceOf(BadRequestException);
        });

        it('404s when the source group does not exist', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query.mockResolvedValueOnce([]); // source lookup empty
            await expect(service.fusionnerGroupes(999, 2, 'Bearer x')).rejects.toBeInstanceOf(NotFoundException);
        });

        it('404s when the target group does not exist', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query
                .mockResolvedValueOnce([{ id: 1 }]) // source exists
                .mockResolvedValueOnce([]); // target lookup empty
            await expect(service.fusionnerGroupes(1, 999, 'Bearer x')).rejects.toBeInstanceOf(NotFoundException);
        });

        it('moves every source member into the target, re-points linked articles, and deletes the source', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query
                .mockResolvedValueOnce([{ id: 1 }])
                .mockResolvedValueOnce([{ id: 2 }]);
            const calls: { sql: string; params: any[] }[] = [];
            dataSource.transaction.mockImplementation(async (cb) => cb({
                query: jest.fn().mockImplementation((sql: string, params: any[]) => {
                    calls.push({ sql, params });
                    if (sql.includes('SELECT id_model FROM compat_group_model')) return Promise.resolve([{ id_model: 10 }, { id_model: 11 }]);
                    return Promise.resolve([]);
                }),
            }));
            await service.fusionnerGroupes(1, 2, 'Bearer x');
            const inserts = calls.filter(c => c.sql.includes('INSERT INTO compat_group_model'));
            expect(inserts.map(c => c.params)).toEqual([[2, 10], [2, 11]]);
            const articleUpdate = calls.find(c => c.sql.includes('UPDATE article SET compat_group_id'));
            expect(articleUpdate?.params).toEqual([2, 1]);
            const deleteCall = calls.find(c => c.sql.includes('DELETE FROM compat_group WHERE id = $1'));
            expect(deleteCall?.params).toEqual([1]);
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

        it('creerMarque returns the existing brand instead of inserting a case/whitespace duplicate', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query.mockResolvedValueOnce([{ id: 4 }]); // existing-brand lookup finds "Samsung"
            await expect(service.creerMarque({ nom: ' SAMSUNG ' }, 'Bearer x')).resolves.toEqual({ id: 4 });
            expect(dataSource.query).toHaveBeenCalledTimes(1); // never reaches the INSERT
        });

        it('creerMarque inserts when no existing brand matches', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query
                .mockResolvedValueOnce([]) // no existing match
                .mockResolvedValueOnce([{ id: 7 }]); // INSERT ... RETURNING id
            await expect(service.creerMarque({ nom: 'NewBrand' }, 'Bearer x')).resolves.toEqual({ id: 7 });
        });

        it('creerModele returns the existing model instead of inserting a case/whitespace duplicate, scoped to the brand', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query.mockResolvedValueOnce([{ id: 11 }]); // existing-model lookup
            await expect(service.creerModele({ id_brand: 1, nom: ' a12 ' }, 'Bearer x')).resolves.toEqual({ id: 11 });
            const [sql, params] = dataSource.query.mock.calls[0];
            expect(sql).toMatch(/WHERE id_brand = \$1 AND LOWER\(TRIM\(nom\)\) = LOWER\(\$2\)/);
            expect(params).toEqual([1, 'a12']);
        });

        it('creerModele updates the existing model\'s image when re-"creating" it with a photo', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query
                .mockResolvedValueOnce([{ id: 11 }]) // existing-model lookup
                .mockResolvedValueOnce(undefined); // UPDATE image
            await expect(service.creerModele({ id_brand: 1, nom: 'A12', image: '/uploads/compat-models/x.png' }, 'Bearer x')).resolves.toEqual({ id: 11 });
            const [sql, params] = dataSource.query.mock.calls[1];
            expect(sql).toMatch(/UPDATE device_model SET image = \$2 WHERE id = \$1/);
            expect(params).toEqual([11, '/uploads/compat-models/x.png']);
        });

        it('creerTypePiece requires all three language names', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            await expect(
                service.creerTypePiece({ nom_fr: 'Écran', nom_en: '', nom_ar: 'شاشة' }, 'Bearer x'),
            ).rejects.toThrow();
        });

        it('creerTypePiece returns the existing part type instead of inserting a case/whitespace duplicate', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query.mockResolvedValueOnce([{ id: 4 }]); // existing-type lookup finds "Glass"
            await expect(
                service.creerTypePiece({ nom_fr: 'Vitre', nom_en: ' Glass ', nom_ar: 'زجاج' }, 'Bearer x'),
            ).resolves.toEqual({ id: 4 });
            expect(dataSource.query).toHaveBeenCalledTimes(1); // never reaches the INSERT
        });

        it('creerTypePiece inserts when no existing part type matches any of the three names', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query
                .mockResolvedValueOnce([]) // no existing match
                .mockResolvedValueOnce([{ id: 8 }]); // INSERT ... RETURNING id
            await expect(
                service.creerTypePiece({ nom_fr: 'Nouveau', nom_en: 'New', nom_ar: 'جديد' }, 'Bearer x'),
            ).resolves.toEqual({ id: 8 });
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

    describe('resolveGroupeRecherche() — finds the existing group for a model+part-type combo, no editor check', () => {
        it('returns the group id when one is registered', async () => {
            dataSource.query.mockResolvedValue([{ id: 10 }]);
            await expect(service.resolveGroupeRecherche(5, 2)).resolves.toEqual({ id_group: 10 });
            const [sql, params] = dataSource.query.mock.calls[0];
            expect(sql).toMatch(/WHERE cgm\.id_model = \$1 AND cg\.id_part_type = \$2/);
            expect(params).toEqual([5, 2]);
            expect(caisseService.acteurRequis).not.toHaveBeenCalled();
        });

        it('returns null when no group links that model to that part type', async () => {
            dataSource.query.mockResolvedValue([]);
            await expect(service.resolveGroupeRecherche(5, 2)).resolves.toBeNull();
        });
    });

    describe('autoResolveGroupeRecherche() — best-effort text match from the Stock form, no editor check', () => {
        it('reports which step is blank, without querying', async () => {
            expect(await service.autoResolveGroupeRecherche(['Vitre'], '', 'A12')).toEqual({ raison: 'marque' });
            expect(await service.autoResolveGroupeRecherche(['Vitre'], 'Samsung', '')).toEqual({ raison: 'modele' });
            expect(await service.autoResolveGroupeRecherche([], 'Samsung', 'A12')).toEqual({ raison: 'type' });
            expect(dataSource.query).not.toHaveBeenCalled();
        });

        it('reports raison "type" when no part_type matches any of the candidate names', async () => {
            dataSource.query.mockResolvedValueOnce([]); // part_type lookup
            await expect(service.autoResolveGroupeRecherche(['Glace', 'Glass'], 'Samsung', 'A12')).resolves.toEqual({ raison: 'type' });
            expect(dataSource.query).toHaveBeenCalledTimes(1);
        });

        it('reports raison "marque" when the brand text does not match any brand', async () => {
            dataSource.query
                .mockResolvedValueOnce([{ id: 2 }]) // part_type found
                .mockResolvedValueOnce([]); // brand not found
            await expect(service.autoResolveGroupeRecherche(['Vitre'], 'Anker', 'A12')).resolves.toEqual({ raison: 'marque' });
        });

        it('reports raison "modele" when the model text does not match any model of that brand', async () => {
            dataSource.query
                .mockResolvedValueOnce([{ id: 2 }]) // part_type found
                .mockResolvedValueOnce([{ id: 1 }]) // brand found
                .mockResolvedValueOnce([]); // model not found
            await expect(service.autoResolveGroupeRecherche(['Vitre'], 'Samsung', 'Z99')).resolves.toEqual({ raison: 'modele' });
        });

        it('reports raison "groupe" when type/brand/model all match but no group links them', async () => {
            dataSource.query
                .mockResolvedValueOnce([{ id: 2 }]) // part_type
                .mockResolvedValueOnce([{ id: 1 }]) // brand
                .mockResolvedValueOnce([{ id: 5 }]) // device_model
                .mockResolvedValueOnce([]); // resolveGroupeRecherche finds nothing
            await expect(service.autoResolveGroupeRecherche(['Vitre'], 'Samsung', 'A12')).resolves.toEqual({ raison: 'groupe' });
        });

        it('resolves the group when type/brand/model all match, case-insensitively and trimmed', async () => {
            dataSource.query
                .mockResolvedValueOnce([{ id: 2 }]) // part_type
                .mockResolvedValueOnce([{ id: 1 }]) // brand
                .mockResolvedValueOnce([{ id: 5 }]) // device_model
                .mockResolvedValueOnce([{ id: 10 }]); // resolveGroupeRecherche's own query
            await expect(service.autoResolveGroupeRecherche(['Glace', ' Vitre '], ' Samsung ', ' A12 ')).resolves.toEqual({ id_group: 10, id_part_type: 2 });
            const [, brandParams] = dataSource.query.mock.calls[1];
            expect(brandParams).toEqual(['samsung']);
        });

        it('sends a whitespace-compacted fallback term for the model (e.g. "spark 6" -> "spark6")', async () => {
            dataSource.query
                .mockResolvedValueOnce([{ id: 2 }])
                .mockResolvedValueOnce([{ id: 1 }])
                .mockResolvedValueOnce([{ id: 5 }])
                .mockResolvedValueOnce([{ id: 10 }]);
            await service.autoResolveGroupeRecherche(['Vitre'], 'ticno', 'spark 6');
            const [, modelParams] = dataSource.query.mock.calls[2];
            expect(modelParams).toEqual([1, 'spark 6', 'spark6']);
        });
    });

    describe('groupeInfoRecherche() — the group\'s part-type name, no editor check', () => {
        it('returns the part-type names for the group', async () => {
            dataSource.query.mockResolvedValue([{ id_part_type: 2, nom_fr: 'Vitre', nom_en: 'Glass', nom_ar: 'زجاج' }]);
            await expect(service.groupeInfoRecherche(10)).resolves.toEqual({ id_part_type: 2, nom_fr: 'Vitre', nom_en: 'Glass', nom_ar: 'زجاج' });
        });

        it('returns null when the group does not exist', async () => {
            dataSource.query.mockResolvedValue([]);
            await expect(service.groupeInfoRecherche(999)).resolves.toBeNull();
        });
    });

    describe('verifierChevauchementGroupe() — warns about other groups with the same model+part type', () => {
        it('rejects a store admin', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'X', role: 'admin' });
            await expect(service.verifierChevauchementGroupe(1, 2, undefined, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('excludes the group currently being edited', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query.mockResolvedValue([]);
            await service.verifierChevauchementGroupe(5, 2, 10, 'Bearer x');
            const [sql, params] = dataSource.query.mock.calls[0];
            expect(sql).toMatch(/\$3::int IS NULL OR cg\.id != \$3/);
            expect(params).toEqual([5, 2, 10]);
        });

        it('returns the other group(s) with their member names when an overlap exists', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query.mockResolvedValue([{ id_group: 7, modeles: ['Samsung A12', 'Apple iPhone 17'] }]);
            await expect(service.verifierChevauchementGroupe(1, 2, undefined, 'Bearer x')).resolves.toEqual([
                { id_group: 7, modeles: ['Samsung A12', 'Apple iPhone 17'] },
            ]);
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

        it('returns the group with its base model and linked model ids', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query
                .mockResolvedValueOnce([{ id: 1, note: null, image: null, id_part_type: 2, id_base_model: 10 }])
                .mockResolvedValueOnce([{ id_model: 10 }, { id_model: 11 }]);
            await expect(service.obtenirGroupe(1, 'Bearer x')).resolves.toEqual({
                id: 1, note: null, image: null, id_part_type: 2, id_base_model: 10, modeleIds: [10, 11],
            });
        });
    });

    describe('modifierGroupe() — keeps the base model in compat_group_model even when not resent', () => {
        it('re-inserts the existing base model when modeleIds is updated without a new id_base_model', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query.mockResolvedValueOnce([{ id: 1, id_base_model: 5 }]); // the existant-check SELECT
            const insertedModelIds: number[] = [];
            dataSource.transaction.mockImplementation(async (cb) => cb({
                query: jest.fn().mockImplementation((sql: string, params: any[]) => {
                    if (sql.includes('INSERT INTO compat_group_model')) insertedModelIds.push(params[1]);
                    return Promise.resolve(undefined);
                }),
            }));
            await service.modifierGroupe(1, { modeleIds: [6, 7] }, 'Bearer x');
            expect(insertedModelIds.sort()).toEqual([5, 6, 7]); // base (5) kept even though the caller only sent [6, 7]
        });

        it('updates statut when given, normalizing any non-"needs_test" value to "confirmed"', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query.mockResolvedValueOnce([{ id: 1, id_base_model: 5 }]);
            let updateParams: any[] | undefined;
            dataSource.transaction.mockImplementation(async (cb) => cb({
                query: jest.fn().mockImplementation((sql: string, params: any[]) => {
                    if (sql.includes('UPDATE compat_group SET')) updateParams = params;
                    return Promise.resolve(undefined);
                }),
            }));
            await service.modifierGroupe(1, { statut: 'needs_test' }, 'Bearer x');
            expect(updateParams![5]).toBe('needs_test');
        });

        it('leaves statut untouched when not provided in the update', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            dataSource.query.mockResolvedValueOnce([{ id: 1, id_base_model: 5 }]);
            let updateParams: any[] | undefined;
            dataSource.transaction.mockImplementation(async (cb) => cb({
                query: jest.fn().mockImplementation((sql: string, params: any[]) => {
                    if (sql.includes('UPDATE compat_group SET')) updateParams = params;
                    return Promise.resolve(undefined);
                }),
            }));
            await service.modifierGroupe(1, { note: 'x' }, 'Bearer x');
            expect(updateParams![5]).toBeNull(); // COALESCE($6, statut) with null $6 keeps the existing value
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
