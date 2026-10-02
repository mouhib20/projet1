import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminAccessoriesAnalyticsService } from './admin-accessories-analytics.service';
import { CaisseService } from '../caisse/caisse.service';

describe('AdminAccessoriesAnalyticsService', () => {
    let service: AdminAccessoriesAnalyticsService;
    let dataSource: { query: jest.Mock; transaction: jest.Mock };
    let caisseService: { acteurRequis: jest.Mock };

    beforeEach(async () => {
        dataSource = { query: jest.fn().mockResolvedValue([]), transaction: jest.fn() };
        caisseService = { acteurRequis: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AdminAccessoriesAnalyticsService,
                { provide: DataSource, useValue: dataSource },
                { provide: CaisseService, useValue: caisseService },
            ],
        }).compile();

        service = module.get(AdminAccessoriesAnalyticsService);
    });

    describe('super_admin only', () => {
        it('rejects a regular store admin from every read endpoint', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'X', role: 'admin' });
            await expect(service.resume({ periode: 'month' }, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.topProduits({ periode: 'month' }, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.fournisseurs({ periode: 'month' }, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.recommandationsGros({ periode: 'month' }, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.nonLies('Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.lierArticle(1, undefined, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.recalculerResumeQuotidien('Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('allows super_admin', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            dataSource.query.mockResolvedValue([]);
            await expect(service.topProduits({ periode: 'month' }, 'Bearer x')).resolves.toEqual([]);
        });
    });

    describe('recalculerResumeQuotidien() — links unlinked articles then rebuilds the rolling window', () => {
        beforeEach(() => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
        });

        it('allows the nightly cron to call it without an authorization header (no role check)', async () => {
            dataSource.query.mockResolvedValue([]);
            dataSource.transaction.mockImplementation(async (cb) => cb({ query: jest.fn().mockResolvedValue([]) }));
            await expect(service.recalculNocturne()).resolves.toBeUndefined();
            expect(caisseService.acteurRequis).not.toHaveBeenCalled();
        });

        it('deletes the window then re-inserts from ventes, mouvement_achat and the rupture snapshot, in one transaction', async () => {
            dataSource.query.mockResolvedValue([]); // no unlinked articles to match this run
            const txQueries: string[] = [];
            dataSource.transaction.mockImplementation(async (cb) => cb({
                query: jest.fn().mockImplementation((sql: string) => { txQueries.push(sql); return Promise.resolve([]); }),
            }));
            const result = await service.recalculerResumeQuotidien('Bearer x');
            expect(result.fenetreJours).toBeGreaterThan(0);
            expect(txQueries.some(q => q.includes('DELETE FROM accessoire_resume_quotidien'))).toBe(true);
            expect(txQueries.some(q => q.includes('FROM vente'))).toBe(true);
            expect(txQueries.some(q => q.includes('FROM mouvement_achat'))).toBe(true);
            expect(txQueries.some(q => q.includes('en_rupture'))).toBe(true);
        });

        it('links unlinked articles by barcode, reusing an existing product when one already has that barcode', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('SELECT DISTINCT barcode')) return Promise.resolve([{ barcode: '12345' }]);
                if (sql.includes('SELECT id FROM accessoire_produit WHERE barcode')) return Promise.resolve([{ id: 7 }]);
                if (sql.startsWith('UPDATE article SET accessoire_produit_id')) return Promise.resolve([]);
                if (sql.includes('GROUP BY sous_categorie')) return Promise.resolve([]); // no name-based groups left
                return Promise.resolve([]);
            });
            dataSource.transaction.mockImplementation(async (cb) => cb({ query: jest.fn().mockResolvedValue([]) }));
            await service.recalculerResumeQuotidien('Bearer x');
            const updateCall = dataSource.query.mock.calls.find(([sql]: [string]) => sql.startsWith('UPDATE article SET accessoire_produit_id') && sql.includes('barcode = $2'));
            expect(updateCall[1]).toEqual([7, '12345']);
        });

        it('creates a new product when no barcode match exists, seeded from the matching article', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('SELECT DISTINCT barcode')) return Promise.resolve([{ barcode: '99999' }]);
                if (sql.includes('SELECT id FROM accessoire_produit WHERE barcode')) return Promise.resolve([]); // no existing product
                if (sql.includes("SELECT designation, marque, sous_categorie, image FROM article WHERE barcode")) {
                    return Promise.resolve([{ designation: 'Chargeur rapide', marque: 'Anker', sous_categorie: 'Chargeur', image: null }]);
                }
                if (sql.startsWith('INSERT INTO accessoire_produit')) return Promise.resolve([{ id: 42 }]);
                if (sql.startsWith('UPDATE article SET accessoire_produit_id')) return Promise.resolve([]);
                if (sql.includes('GROUP BY sous_categorie')) return Promise.resolve([]);
                return Promise.resolve([]);
            });
            dataSource.transaction.mockImplementation(async (cb) => cb({ query: jest.fn().mockResolvedValue([]) }));
            await service.recalculerResumeQuotidien('Bearer x');
            const insertCall = dataSource.query.mock.calls.find(([sql]: [string]) => sql.startsWith('INSERT INTO accessoire_produit'));
            expect(insertCall[1]).toEqual(['Chargeur', 'Anker', 'Chargeur rapide', '99999', null]);
        });
    });

    describe('fournisseurs() — flags the cheapest supplier per product', () => {
        it('marks only the lowest-price row per id_produit as moins_cher', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            dataSource.query.mockResolvedValue([
                { telephone: '0600000001', nom: 'Fournisseur A', id_produit: 1, prix_moyen: 50 },
                { telephone: '0600000002', nom: 'Fournisseur B', id_produit: 1, prix_moyen: 40 },
            ]);
            const result = await service.fournisseurs({ periode: 'month' }, 'Bearer x');
            expect(result.find((r: any) => r.telephone === '0600000002').moins_cher).toBe(true);
            expect(result.find((r: any) => r.telephone === '0600000001').moins_cher).toBe(false);
        });
    });

    describe('lierArticle() — manual link, not revisited by the nightly auto-link pass', () => {
        beforeEach(() => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
        });

        it('throws NotFoundException for a missing/non-accessory article', async () => {
            dataSource.query.mockResolvedValueOnce([]); // article lookup empty
            await expect(service.lierArticle(999, undefined, 'Bearer x')).rejects.toBeInstanceOf(NotFoundException);
        });

        it('links to an existing product when id_produit is given', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('SELECT designation, marque, sous_categorie, barcode, image FROM article')) return Promise.resolve([{ designation: 'X', marque: 'Y', sous_categorie: 'Glace', barcode: null, image: null }]);
                if (sql.includes('SELECT id FROM accessoire_produit WHERE id')) return Promise.resolve([{ id: 5 }]);
                if (sql.startsWith('UPDATE article SET accessoire_produit_id')) return Promise.resolve([]);
                return Promise.resolve([]);
            });
            await expect(service.lierArticle(10, 5, 'Bearer x')).resolves.toEqual({ id_produit: 5 });
        });

        it('rejects linking to a nonexistent product id', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('SELECT designation, marque, sous_categorie, barcode, image FROM article')) return Promise.resolve([{ designation: 'X', marque: 'Y', sous_categorie: 'Glace', barcode: null, image: null }]);
                if (sql.includes('SELECT id FROM accessoire_produit WHERE id')) return Promise.resolve([]);
                return Promise.resolve([]);
            });
            await expect(service.lierArticle(10, 999, 'Bearer x')).rejects.toBeInstanceOf(NotFoundException);
        });

        it('creates a brand-new product from the article when no id_produit is given', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('SELECT designation, marque, sous_categorie, barcode, image FROM article')) return Promise.resolve([{ designation: 'Coque transparente', marque: 'Generic', sous_categorie: 'Coque Téléphone', barcode: null, image: null }]);
                if (sql.startsWith('INSERT INTO accessoire_produit')) return Promise.resolve([{ id: 77 }]);
                if (sql.startsWith('UPDATE article SET accessoire_produit_id')) return Promise.resolve([]);
                return Promise.resolve([]);
            });
            await expect(service.lierArticle(10, undefined, 'Bearer x')).resolves.toEqual({ id_produit: 77 });
        });

        it('rejects creating a product from an article with no name', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('SELECT designation, marque, sous_categorie, barcode, image FROM article')) return Promise.resolve([{ designation: '  ', marque: null, sous_categorie: 'Glace', barcode: null, image: null }]);
                return Promise.resolve([]);
            });
            await expect(service.lierArticle(10, undefined, 'Bearer x')).rejects.toBeInstanceOf(BadRequestException);
        });
    });

    describe('recommandationsGros() — returns an empty list with no products (no crash on empty ids array)', () => {
        it('handles an empty product list', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            dataSource.query.mockResolvedValue([]);
            await expect(service.recommandationsGros({ periode: 'month' }, 'Bearer x')).resolves.toEqual([]);
        });
    });
});
