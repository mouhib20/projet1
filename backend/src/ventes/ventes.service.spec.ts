import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { VentesService } from './ventes.service';
import { Vente } from './vente.entity';
import { Article } from '../articles/article.entity';
import { StocksService } from '../stocks/stocks.service';
import { ClientsService } from '../clients/clients.service';
import { CaisseService } from '../caisse/caisse.service';
import { StoreContextService } from '../store-context/store-context.service';

describe('VentesService.checkout() — offline sync (idempotency + negative stock)', () => {
    let service: VentesService;
    let venteRepo: any;
    let dataSource: { query: jest.Mock; createQueryRunner: jest.Mock };
    let storeContext: { requireMagasinId: jest.Mock };
    let caisseService: { acteurOuSysteme: jest.Mock; enregistrerAuto: jest.Mock };

    /** A fresh Article stub with a given stock level, plus a manager whose findOne() returns it. */
    function makeManager(article: { id_article: number; quantite: number; prix_vente: number; designation: string }) {
        let nextVenteId = 1;
        return {
            findOne: jest.fn().mockImplementation((entity) => {
                if (entity === Article) return Promise.resolve({ ...article });
                return Promise.resolve(null);
            }),
            create: jest.fn().mockImplementation((_entity, data) => ({ ...data })),
            save: jest.fn().mockImplementation((entity) => {
                if (entity && 'id_article' in entity) return Promise.resolve(entity); // article save
                return Promise.resolve({ ...entity, id_vente: nextVenteId++ }); // vente save
            }),
            update: jest.fn().mockResolvedValue(undefined),
            query: jest.fn().mockResolvedValue([{ cout: 0 }]),
        };
    }

    function makeQueryRunner(manager: any) {
        return {
            connect: jest.fn().mockResolvedValue(undefined),
            startTransaction: jest.fn().mockResolvedValue(undefined),
            commitTransaction: jest.fn().mockResolvedValue(undefined),
            rollbackTransaction: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined),
            query: jest.fn().mockResolvedValue(undefined),
            manager,
        };
    }

    beforeEach(async () => {
        venteRepo = {
            findOne: jest.fn().mockImplementation(({ where }) => Promise.resolve({ id_vente: where.id_vente, qte: 1, prix: 10 })),
        };
        dataSource = { query: jest.fn(), createQueryRunner: jest.fn() };
        storeContext = { requireMagasinId: jest.fn().mockReturnValue(1) };
        caisseService = {
            acteurOuSysteme: jest.fn().mockResolvedValue({ id: 1, nom: 'Caissier', role: 'admin' }),
            enregistrerAuto: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                VentesService,
                { provide: getRepositoryToken(Vente), useValue: venteRepo },
                { provide: DataSource, useValue: dataSource },
                { provide: StocksService, useValue: {} },
                { provide: ClientsService, useValue: { utiliserSolde: jest.fn(), ajouterDette: jest.fn() } },
                { provide: CaisseService, useValue: caisseService },
                { provide: StoreContextService, useValue: storeContext },
            ],
        }).compile();

        service = module.get<VentesService>(VentesService);
    });

    describe('idempotency', () => {
        it('returns the cached result on a retried client_id, without touching the query runner', async () => {
            dataSource.query.mockResolvedValueOnce([
                { resultat: { venteIds: [42], avertissements: [] } },
            ]);
            const result = await service.checkout(
                { items: [{ articleId: 5, qte: 1, prix: 10 }], client_id: 'abc-123' },
                'Bearer x',
            );
            expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
            expect(result.map((v) => v.id_vente)).toEqual([42]);
            expect(result.avertissements).toEqual([]);
        });

        it('records a fresh client_id and creates the sale normally', async () => {
            dataSource.query.mockResolvedValueOnce([]); // no existing sync_operation_log row
            const manager = makeManager({ id_article: 5, quantite: 10, prix_vente: 10, designation: 'Écran' });
            const queryRunner = makeQueryRunner(manager);
            dataSource.createQueryRunner.mockReturnValue(queryRunner);

            const result = await service.checkout(
                { items: [{ articleId: 5, qte: 2, prix: 10 }], client_id: 'new-client-id' },
                'Bearer x',
            );

            expect(queryRunner.commitTransaction).toHaveBeenCalled();
            // the log insert happened inside the same transaction (queryRunner.query), not via dataSource
            const logInsert = queryRunner.query.mock.calls.find(([sql]) => sql.includes('sync_operation_log'));
            expect(logInsert).toBeTruthy();
            expect(logInsert[1][0]).toBe('new-client-id');
            expect(result).toHaveLength(1);
        });
    });

    describe('stock going negative', () => {
        it('rejects insufficient stock for a normal, non-offline checkout (no client_id)', async () => {
            const manager = makeManager({ id_article: 5, quantite: 1, prix_vente: 10, designation: 'Écran' });
            const queryRunner = makeQueryRunner(manager);
            dataSource.createQueryRunner.mockReturnValue(queryRunner);

            await expect(
                service.checkout({ items: [{ articleId: 5, qte: 3, prix: 10 }] }, 'Bearer x'),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('accepts insufficient stock for an offline-replayed checkout (client_id present) and warns', async () => {
            dataSource.query.mockResolvedValueOnce([]); // no existing log row
            const manager = makeManager({ id_article: 5, quantite: 1, prix_vente: 10, designation: 'Écran' });
            const queryRunner = makeQueryRunner(manager);
            dataSource.createQueryRunner.mockReturnValue(queryRunner);

            const result = await service.checkout(
                { items: [{ articleId: 5, qte: 3, prix: 10 }], client_id: 'offline-1' },
                'Bearer x',
            );
            expect(queryRunner.commitTransaction).toHaveBeenCalled();
            expect(result.avertissements).toHaveLength(1);
            expect(result.avertissements![0]).toMatch(/négatif/);
        });
    });

    describe('duplicate client_id race (concurrent sync retries)', () => {
        it('falls back to the winning transaction\'s result on a unique-constraint violation', async () => {
            dataSource.query
                .mockResolvedValueOnce([]) // first idempotency check: nothing yet
                .mockResolvedValueOnce([{ resultat: { venteIds: [99], avertissements: [] } }]); // after losing the race
            const manager = makeManager({ id_article: 5, quantite: 10, prix_vente: 10, designation: 'Écran' });
            const queryRunner = makeQueryRunner(manager);
            queryRunner.query = jest.fn().mockImplementation((sql: string) => {
                if (sql.includes('sync_operation_log')) {
                    const err: any = new Error('duplicate key value violates unique constraint');
                    err.code = '23505';
                    throw err;
                }
                return Promise.resolve(undefined);
            });
            dataSource.createQueryRunner.mockReturnValue(queryRunner);

            const result = await service.checkout(
                { items: [{ articleId: 5, qte: 1, prix: 10 }], client_id: 'racy-id' },
                'Bearer x',
            );
            expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(result.map((v) => v.id_vente)).toEqual([99]);
        });
    });
});
