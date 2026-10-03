import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AbonnementsService } from './abonnements.service';
import { CaisseService } from '../caisse/caisse.service';
import { MagasinsService } from '../magasins/magasins.service';

describe('AbonnementsService', () => {
    let service: AbonnementsService;
    let dataSource: { query: jest.Mock; transaction: jest.Mock };
    let caisseService: { acteurRequis: jest.Mock };
    let magasinsService: { setModules: jest.Mock };

    beforeEach(async () => {
        dataSource = { query: jest.fn().mockResolvedValue([]), transaction: jest.fn() };
        caisseService = { acteurRequis: jest.fn() };
        magasinsService = { setModules: jest.fn().mockResolvedValue(undefined) };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AbonnementsService,
                { provide: DataSource, useValue: dataSource },
                { provide: CaisseService, useValue: caisseService },
                { provide: MagasinsService, useValue: magasinsService },
            ],
        }).compile();

        service = module.get(AbonnementsService);
    });

    describe('super_admin only', () => {
        it('rejects a regular store admin from every action', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'X', role: 'admin' });
            await expect(service.obtenirParametres('Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.listerAbonnements('Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.resumeFinancier('Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.enregistrerPaiement(1, { montant: 100, methode: 'cash', date_paiement: '2026-01-01', sections: [] }, 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.suspendre(1, 'x', 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.reactiver(1, 'x', 'Bearer x')).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('allows super_admin', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            dataSource.query.mockResolvedValue([{ prix_base_annuel: 100 }]);
            await expect(service.obtenirParametres('Bearer x')).resolves.toBeDefined();
        });
    });

    describe('calculerPrixAnnuel() — base + priced sections currently enabled, minus discount', () => {
        it('adds only priced, enabled sections on top of the base price', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('FROM parametre_abonnement')) return Promise.resolve([{ prix_base_annuel: 100 }]);
                if (sql.includes('FROM parametre_prix_section pps')) return Promise.resolve([{ total_sections: 50 }]);
                if (sql.includes('FROM abonnement WHERE id_magasin')) return Promise.resolve([{ reduction_montant: null, reduction_pourcentage: null }]);
                return Promise.resolve([]);
            });
            await expect(service.calculerPrixAnnuel(1)).resolves.toBe(150);
        });

        it('applies a flat-amount discount', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('FROM parametre_abonnement')) return Promise.resolve([{ prix_base_annuel: 100 }]);
                if (sql.includes('FROM parametre_prix_section pps')) return Promise.resolve([{ total_sections: 50 }]);
                if (sql.includes('FROM abonnement WHERE id_magasin')) return Promise.resolve([{ reduction_montant: 30, reduction_pourcentage: null }]);
                return Promise.resolve([]);
            });
            await expect(service.calculerPrixAnnuel(1)).resolves.toBe(120);
        });

        it('applies a percentage discount instead when both are set (percentage takes priority)', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('FROM parametre_abonnement')) return Promise.resolve([{ prix_base_annuel: 100 }]);
                if (sql.includes('FROM parametre_prix_section pps')) return Promise.resolve([{ total_sections: 0 }]);
                if (sql.includes('FROM abonnement WHERE id_magasin')) return Promise.resolve([{ reduction_montant: 30, reduction_pourcentage: 10 }]);
                return Promise.resolve([]);
            });
            await expect(service.calculerPrixAnnuel(1)).resolves.toBe(90);
        });

        it('never goes below zero even with a discount larger than the subtotal', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('FROM parametre_abonnement')) return Promise.resolve([{ prix_base_annuel: 10 }]);
                if (sql.includes('FROM parametre_prix_section pps')) return Promise.resolve([{ total_sections: 0 }]);
                if (sql.includes('FROM abonnement WHERE id_magasin')) return Promise.resolve([{ reduction_montant: 999, reduction_pourcentage: null }]);
                return Promise.resolve([]);
            });
            await expect(service.calculerPrixAnnuel(1)).resolves.toBe(0);
        });
    });

    describe('enregistrerPaiement() — the core "pay for a year" flow', () => {
        beforeEach(() => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'SA', role: 'super_admin' });
        });

        it('rejects a non-positive amount', async () => {
            dataSource.query.mockResolvedValueOnce([{ statut: 'trial', date_fin_abonnement: null, date_fin_essai: '2026-01-01' }]);
            await expect(
                service.enregistrerPaiement(1, { montant: 0, methode: 'cash', date_paiement: '2026-01-01', sections: [] }, 'Bearer x'),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('throws NotFoundException when the store has no abonnement row', async () => {
            dataSource.query.mockResolvedValueOnce([]);
            await expect(
                service.enregistrerPaiement(999, { montant: 100, methode: 'cash', date_paiement: '2026-01-01', sections: [] }, 'Bearer x'),
            ).rejects.toBeInstanceOf(NotFoundException);
        });

        it('extends 365 days from TODAY when the current anchor date is already in the past (expired trial)', async () => {
            dataSource.query.mockResolvedValueOnce([{ statut: 'grace', date_fin_abonnement: null, date_fin_essai: '2020-01-01' }]);
            dataSource.transaction.mockImplementation(async (cb) => cb({ query: jest.fn().mockResolvedValue([]) }));
            await service.enregistrerPaiement(1, { montant: 100, methode: 'cash', date_paiement: '2026-01-01', sections: ['ventes'] }, 'Bearer x');
            const txCall = dataSource.transaction.mock.calls[0][0];
            const queries: [string, any[]][] = [];
            await txCall({ query: (sql: string, params: any[]) => { queries.push([sql, params]); return Promise.resolve([]); } });
            const updateAbonnement = queries.find(([sql]) => sql.includes('UPDATE abonnement SET'));
            const newDate = new Date(updateAbonnement![1][1]);
            const daysFromNow = Math.round((newDate.getTime() - Date.now()) / 86_400_000);
            expect(daysFromNow).toBeGreaterThanOrEqual(364);
            expect(daysFromNow).toBeLessThanOrEqual(366);
        });

        it('extends 365 days from the CURRENT anchor when it is still in the future (renewing early)', async () => {
            const futureDate = new Date(); futureDate.setDate(futureDate.getDate() + 100);
            const futureDateStr = futureDate.toISOString().slice(0, 10);
            dataSource.query.mockResolvedValueOnce([{ statut: 'active', date_fin_abonnement: futureDateStr, date_fin_essai: null }]);
            dataSource.transaction.mockImplementation(async (cb) => cb({ query: jest.fn().mockResolvedValue([]) }));
            await service.enregistrerPaiement(1, { montant: 100, methode: 'cash', date_paiement: '2026-01-01', sections: ['ventes'] }, 'Bearer x');
            const txCall = dataSource.transaction.mock.calls[0][0];
            const queries: [string, any[]][] = [];
            await txCall({ query: (sql: string, params: any[]) => { queries.push([sql, params]); return Promise.resolve([]); } });
            const updateAbonnement = queries.find(([sql]) => sql.includes('UPDATE abonnement SET'));
            const newDate = new Date(updateAbonnement![1][1]);
            const daysFromToday = Math.round((newDate.getTime() - Date.now()) / 86_400_000);
            // Should be ~465 days away (100 remaining + 365 new), not just 365 - paying early must
            // never shorten what's already owed.
            expect(daysFromToday).toBeGreaterThanOrEqual(464);
            expect(daysFromToday).toBeLessThanOrEqual(466);
        });

        it('sets magasin_module via MagasinsService with exactly the paid sections true and the rest false', async () => {
            dataSource.query.mockResolvedValueOnce([{ statut: 'trial', date_fin_abonnement: null, date_fin_essai: '2026-01-01' }]);
            dataSource.transaction.mockImplementation(async (cb) => cb({ query: jest.fn().mockResolvedValue([]) }));
            await service.enregistrerPaiement(1, { montant: 100, methode: 'cash', date_paiement: '2026-01-01', sections: ['ventes', 'stock'] }, 'Bearer x');
            expect(magasinsService.setModules).toHaveBeenCalledWith(1, expect.objectContaining({
                ventes: true, stock: true, reparation: false, fournisseurs: false, charges: false,
                clients: false, rapports: false, compatibilite: false, wholesale: false,
            }), 'Bearer x');
        });
    });

    describe('reactiver() — grants one grace period of runway so the next nightly check does not immediately re-suspend it', () => {
        it('sets date_fin_abonnement to today + duree_grace_jours', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 9, nom: 'SA', role: 'super_admin' });
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('SELECT statut, date_fin_abonnement, date_fin_essai FROM abonnement')) return Promise.resolve([{ statut: 'suspended', date_fin_abonnement: '2020-01-01', date_fin_essai: null }]);
                if (sql.includes('duree_grace_jours FROM parametre_abonnement')) return Promise.resolve([{ duree_grace_jours: 7 }]);
                return Promise.resolve([]);
            });
            await service.reactiver(1, 'goodwill', 'Bearer x');
            const updateCall = dataSource.query.mock.calls.find(([sql]: [string]) => sql.includes("UPDATE abonnement SET statut = 'active'"));
            const newDate = new Date(updateCall![1][1]);
            const daysFromNow = (newDate.getTime() - Date.now()) / 86_400_000;
            // The service truncates to a UTC date string (midnight), so "today + 7 days" is
            // slightly under 7.0 days from "right now" - never under 6, never over 7.
            expect(daysFromNow).toBeGreaterThan(6);
            expect(daysFromNow).toBeLessThanOrEqual(7);
        });
    });

    describe('recalculNocturne() — the state-machine transitions', () => {
        it('moves an overdue trial/active store to grace, and an overdue grace store to suspended, logging both', async () => {
            const historiqueInserts: any[] = [];
            dataSource.query.mockImplementation((sql: string, params: any[]) => {
                if (sql.includes('duree_grace_jours FROM parametre_abonnement')) return Promise.resolve([{ duree_grace_jours: 7 }]);
                if (sql.includes("statut IN ('trial', 'active')")) return Promise.resolve([{ id_magasin: 1, statut: 'active' }]);
                if (sql.includes("statut = 'grace' AND COALESCE")) return Promise.resolve([{ id_magasin: 2 }]);
                if (sql.startsWith('INSERT INTO abonnement_historique')) { historiqueInserts.push(params); return Promise.resolve([]); }
                return Promise.resolve([]);
            });
            await service.recalculNocturne();
            expect(historiqueInserts).toEqual(expect.arrayContaining([
                expect.arrayContaining([1, 'transition_auto', null, 'active', 'grace']),
                expect.arrayContaining([2, 'transition_auto', null, 'grace', 'suspended']),
            ]));
        });

        it('never touches an already-suspended store (not included in either transition query)', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('duree_grace_jours FROM parametre_abonnement')) return Promise.resolve([{ duree_grace_jours: 7 }]);
                if (sql.includes("statut IN ('trial', 'active')")) return Promise.resolve([]);
                if (sql.includes("statut = 'grace' AND COALESCE")) return Promise.resolve([]);
                return Promise.resolve([]);
            });
            await expect(service.recalculNocturne()).resolves.toBeUndefined();
        });
    });
});
