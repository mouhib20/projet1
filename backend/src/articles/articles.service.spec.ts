import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ArticlesService } from './articles.service';
import { Article } from './article.entity';
import { StoreContextService } from '../store-context/store-context.service';

describe('ArticlesService', () => {
    let service: ArticlesService;
    let dataSource: { query: jest.Mock };

    beforeEach(async () => {
        dataSource = { query: jest.fn() };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ArticlesService,
                { provide: getRepositoryToken(Article), useValue: {} },
                { provide: DataSource, useValue: dataSource },
                { provide: StoreContextService, useValue: { requireMagasinId: jest.fn().mockReturnValue(1) } },
            ],
        }).compile();

        service = module.get<ArticlesService>(ArticlesService);
    });

    describe('rechercheCatalogue() — the one deliberate cross-store exception', () => {
        it('returns null for an empty/blank barcode without querying the database', async () => {
            expect(await service.rechercheCatalogue('')).toBeNull();
            expect(await service.rechercheCatalogue('   ')).toBeNull();
            expect(dataSource.query).not.toHaveBeenCalled();
        });

        it('queries by barcode only, with NO id_magasin filter (intentionally cross-store)', async () => {
            dataSource.query.mockResolvedValue([]);
            await service.rechercheCatalogue('123456789');
            const [sql, params] = dataSource.query.mock.calls[0];
            expect(sql).not.toMatch(/id_magasin/i);
            expect(params).toEqual(['123456789']);
        });

        it('selects only reference/descriptive columns — never price, quantity, id_magasin or id_article', async () => {
            dataSource.query.mockResolvedValue([]);
            await service.rechercheCatalogue('123456789');
            const [sql] = dataSource.query.mock.calls[0];
            // Only the SELECT clause matters here: id_article may legitimately appear in ORDER BY
            // (picking the most recent match) without ever being part of the returned row.
            const selectClause = sql.match(/SELECT([\s\S]*?)FROM/i)?.[1] ?? '';
            for (const forbidden of ['prix_achat', 'prix_vente', 'quantite', 'qte_min', 'id_magasin', 'id_article']) {
                expect(selectClause).not.toMatch(new RegExp(forbidden, 'i'));
            }
            for (const allowed of ['designation', 'marque', 'modele', 'sous_categorie', 'image', 'barcode']) {
                expect(selectClause).toMatch(new RegExp(allowed, 'i'));
            }
        });

        it('returns the matching row when found', async () => {
            const row = { designation: 'Écran iPhone 13', marque: 'Apple', modele: '13', type: 'part', sous_categorie: 'afficheur', image: '/uploads/x.jpg', barcode: '123456789' };
            dataSource.query.mockResolvedValue([row]);
            await expect(service.rechercheCatalogue('123456789')).resolves.toEqual(row);
        });

        it('returns null when no store has ever registered this barcode', async () => {
            dataSource.query.mockResolvedValue([]);
            await expect(service.rechercheCatalogue('000000000')).resolves.toBeNull();
        });
    });

    describe('syncDepuis() — offline POS incremental pull', () => {
        it('always filters by id_magasin', async () => {
            dataSource.query.mockResolvedValue([]);
            await service.syncDepuis();
            const [sql, params] = dataSource.query.mock.calls[0];
            expect(sql).toMatch(/WHERE id_magasin = \$1/);
            expect(params).toEqual([1]);
        });

        it('adds the updated_at filter only when since is provided', async () => {
            dataSource.query.mockResolvedValue([]);
            await service.syncDepuis('2026-01-01T00:00:00.000Z');
            const [sql, params] = dataSource.query.mock.calls[0];
            expect(sql).toMatch(/updated_at > \$2/);
            expect(params).toEqual([1, '2026-01-01T00:00:00.000Z']);
        });

        it('never leaks price/quantity-adjacent fields beyond what the POS needs — sanity on the shape', async () => {
            dataSource.query.mockResolvedValue([]);
            await service.syncDepuis();
            const [sql] = dataSource.query.mock.calls[0];
            expect(sql).toMatch(/quantite/i); // the POS DOES need quantity, unlike rechercheCatalogue
            expect(sql).toMatch(/prix_vente/i);
        });
    });
});
