import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ForbiddenException } from '@nestjs/common';
import { AdminAnalyticsService } from './admin-analytics.service';
import { CaisseService } from '../caisse/caisse.service';

describe('AdminAnalyticsService', () => {
    let service: AdminAnalyticsService;
    let dataSource: { query: jest.Mock; transaction: jest.Mock };
    let caisseService: { acteurRequis: jest.Mock };

    beforeEach(async () => {
        dataSource = { query: jest.fn().mockResolvedValue([]), transaction: jest.fn() };
        caisseService = { acteurRequis: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AdminAnalyticsService,
                { provide: DataSource, useValue: dataSource },
                { provide: CaisseService, useValue: caisseService },
            ],
        }).compile();

        service = module.get(AdminAnalyticsService);
    });

    describe('super_admin only', () => {
        it('rejects a regular store admin from every read endpoint', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'X', role: 'admin' });
            await expect(service.topPieces({ periode: 'month' }, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.ecrans({ periode: 'month' }, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.fournisseurs({ periode: 'month' }, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.recommandationsGros({ periode: 'month' }, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.recalculerResumeQuotidien('Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('rejects compat_editor and compatibility_employee too (not just a non-admin role)', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'Editeur', role: 'compat_editor' });
            await expect(service.topPieces({ periode: 'month' }, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('allows super_admin', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            dataSource.query.mockResolvedValue([{ id_group: 1, qte_vendue: 5 }]);
            await expect(service.topPieces({ periode: 'month' }, 'Bearer x')).resolves.toEqual([{ id_group: 1, qte_vendue: 5 }]);
        });
    });

    describe('topPieces() — date range resolution', () => {
        beforeEach(() => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
        });

        it('rejects a custom period without explicit dates', async () => {
            await expect(service.topPieces({ periode: 'custom' }, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('passes the given custom dates straight through', async () => {
            await service.topPieces({ periode: 'custom', dateDebut: '2026-01-01', dateFin: '2026-01-31' }, 'Bearer x');
            const [, params] = dataSource.query.mock.calls[0];
            expect(params[0]).toBe('2026-01-01');
            expect(params[1]).toBe('2026-01-31');
        });

        it('passes the part-type and brand filters through as given, null when omitted', async () => {
            await service.topPieces({ periode: 'month', idPartType: 3, idBrand: 7, wilaya: 'Alger' }, 'Bearer x');
            const [, params] = dataSource.query.mock.calls[0];
            expect(params[2]).toBe(3);
            expect(params[3]).toBe(7);
            expect(params[4]).toBe('Alger');
        });

        it('defaults part-type/brand/wilaya filters to null when not given', async () => {
            await service.topPieces({ periode: 'week' }, 'Bearer x');
            const [, params] = dataSource.query.mock.calls[0];
            expect(params[2]).toBeNull();
            expect(params[3]).toBeNull();
            expect(params[4]).toBeNull();
        });
    });

    describe('recalculerResumeQuotidien() — rebuilds the rolling window from the raw tables', () => {
        it('deletes the window then re-inserts from ventes, reparation_item and mouvement_achat, in one transaction', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            const txQueries: string[] = [];
            dataSource.transaction.mockImplementation(async (cb) => cb({
                query: jest.fn().mockImplementation((sql: string) => { txQueries.push(sql); return Promise.resolve([]); }),
            }));
            const result = await service.recalculerResumeQuotidien('Bearer x');
            expect(result.fenetreJours).toBeGreaterThan(0);
            expect(txQueries.some(q => q.includes('DELETE FROM analytics_resume_quotidien'))).toBe(true);
            expect(txQueries.some(q => q.includes('FROM vente'))).toBe(true);
            expect(txQueries.some(q => q.includes('FROM reparation_item'))).toBe(true);
            expect(txQueries.some(q => q.includes('FROM mouvement_achat'))).toBe(true);
        });

        it('allows the nightly cron to call it without an authorization header (no role check)', async () => {
            dataSource.transaction.mockImplementation(async (cb) => cb({ query: jest.fn().mockResolvedValue([]) }));
            await expect(service.recalculNocturne()).resolves.toBeUndefined();
            expect(caisseService.acteurRequis).not.toHaveBeenCalled();
        });
    });

    describe('recommandationsGros() — score combines consumption with unmet-demand signals', () => {
        beforeEach(() => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
        });

        it('increases the score when there are more "not found" searches for the same part (acceptance criterion)', async () => {
            const piece = { id_group: 1, nom_fr: 'glass', nom_en: 'glass', nom_ar: 'GLASS', marque: 'Samsung', modele: 'A02s', image: null, qte_vendue: 2, qte_reparation: 0, nb_magasins: 1, prix_achat_moyen: 10, prix_achat_min: 10, prix_achat_max: 10, prix_vente_moyen: 20, prix_vente_min: 20, prix_vente_max: 20 };
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('FROM analytics_resume_quotidien')) return Promise.resolve([piece]);
                if (sql.includes('FROM recherche_sans_stock')) return Promise.resolve([{ id_group: 1, nb_recherches: 5, nb_magasins_demande: 2 }]);
                if (sql.includes('FROM compat_group_model')) return Promise.resolve([{ id_group: 1, nb_modeles_compatibles: 3 }]);
                if (sql.includes('FROM mouvement_achat')) return Promise.resolve([]);
                return Promise.resolve([]);
            });
            const withSearches = await service.recommandationsGros({ periode: 'month' }, 'Bearer x');

            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('FROM analytics_resume_quotidien')) return Promise.resolve([piece]);
                if (sql.includes('FROM recherche_sans_stock')) return Promise.resolve([]); // no unmet-demand searches this time
                if (sql.includes('FROM compat_group_model')) return Promise.resolve([{ id_group: 1, nb_modeles_compatibles: 3 }]);
                if (sql.includes('FROM mouvement_achat')) return Promise.resolve([]);
                return Promise.resolve([]);
            });
            const withoutSearches = await service.recommandationsGros({ periode: 'month' }, 'Bearer x');

            expect(withSearches[0].score).toBeGreaterThan(withoutSearches[0].score);
            expect(withSearches[0].nb_recherches_sans_stock).toBe(5);
            expect(withSearches[0].nb_magasins_demande).toBe(2);
        });

        it('returns an empty list when there are no parts for the period (no crash on empty ids array)', async () => {
            dataSource.query.mockResolvedValue([]);
            await expect(service.recommandationsGros({ periode: 'month' }, 'Bearer x')).resolves.toEqual([]);
        });
    });

    describe('fournisseurs() — flags the cheapest supplier per part', () => {
        it('marks only the lowest-price row per id_group as moins_cher', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            dataSource.query.mockResolvedValue([
                { telephone: '0600000001', nom: 'Fournisseur A', id_group: 1, prix_moyen: 50 },
                { telephone: '0600000002', nom: 'Fournisseur B', id_group: 1, prix_moyen: 40 },
                { telephone: '0600000001', nom: 'Fournisseur A', id_group: 2, prix_moyen: 30 },
            ]);
            const result = await service.fournisseurs({ periode: 'month' }, 'Bearer x');
            expect(result.find((r: any) => r.telephone === '0600000002' && r.id_group === 1).moins_cher).toBe(true);
            expect(result.find((r: any) => r.telephone === '0600000001' && r.id_group === 1).moins_cher).toBe(false);
            expect(result.find((r: any) => r.id_group === 2).moins_cher).toBe(true);
        });
    });
});
