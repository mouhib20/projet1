import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DashboardService } from './dashboard.service';
import { Article } from '../articles/article.entity';
import { Fournisseur } from '../fournisseurs/fournisseur.entity';
import { FactureAchat } from '../factures-achat/facture-achat.entity';
import { StoreContextService } from '../store-context/store-context.service';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createMockQueryBuilder = (result: any) => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(result),
    getMany: jest.fn().mockResolvedValue(result),
});

describe('DashboardService', () => {
    let service: DashboardService;
    let articleRepo: MockRepo<Article>;
    let fournisseurRepo: MockRepo<Fournisseur>;
    let factureRepo: MockRepo<FactureAchat>;
    let storeContext: Partial<StoreContextService>;

    beforeEach(async () => {
        articleRepo = { count: jest.fn().mockResolvedValue(0), createQueryBuilder: jest.fn() };
        fournisseurRepo = { count: jest.fn().mockResolvedValue(0) };
        factureRepo = { count: jest.fn().mockResolvedValue(0), find: jest.fn().mockResolvedValue([]) };
        storeContext = { requireMagasinId: jest.fn().mockReturnValue(1) };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DashboardService,
                { provide: getRepositoryToken(Article), useValue: articleRepo },
                { provide: getRepositoryToken(Fournisseur), useValue: fournisseurRepo },
                { provide: getRepositoryToken(FactureAchat), useValue: factureRepo },
                { provide: StoreContextService, useValue: storeContext },
            ],
        }).compile();

        service = module.get<DashboardService>(DashboardService);
    });

    describe('getStats() — every query is scoped to the caller\'s store', () => {
        it('counts articles, fournisseurs and factures filtered by id_magasin', async () => {
            (articleRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder({ total: '0' }));
            await service.getStats();
            expect(articleRepo.count).toHaveBeenCalledWith({ where: { id_magasin: 1 } });
            expect(fournisseurRepo.count).toHaveBeenCalledWith({ where: { id_magasin: 1 } });
            expect(factureRepo.count).toHaveBeenCalledWith({ where: { id_magasin: 1 } });
        });

        it('fetches recent invoices filtered by id_magasin, never across every store', async () => {
            (articleRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder({ total: '0' }));
            await service.getStats();
            expect(factureRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id_magasin: 1 } }),
            );
        });

        it('filters the stock-value sum and the low-stock list by id_magasin in the query builder', async () => {
            const stockValueQb = createMockQueryBuilder({ total: '500' });
            const lowStockQb = createMockQueryBuilder([{ id_article: 1, quantite: 0 }]);
            (articleRepo.createQueryBuilder as jest.Mock)
                .mockReturnValueOnce(stockValueQb)
                .mockReturnValueOnce(lowStockQb);

            const stats = await service.getStats();

            expect(stockValueQb.where).toHaveBeenCalledWith('a.id_magasin = :id_magasin', { id_magasin: 1 });
            expect(lowStockQb.where).toHaveBeenCalledWith(
                'a.id_magasin = :id_magasin AND a.qte_min > 0 AND a.quantite <= a.qte_min',
                { id_magasin: 1 },
            );
            expect(stats.totalStockValue).toBe(500);
            expect(stats.lowStockArticles).toEqual([{ id_article: 1, quantite: 0 }]);
        });

        it('throws when called with no store in context (super_admin never calls this)', async () => {
            (storeContext.requireMagasinId as jest.Mock).mockImplementation(() => {
                throw new Error('Aucun magasin associé à ce compte.');
            });
            await expect(service.getStats()).rejects.toThrow();
        });
    });
});
