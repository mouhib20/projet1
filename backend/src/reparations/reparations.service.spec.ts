import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { ReparationsService } from './reparations.service';
import { Reparation } from './reparation.entity';
import { Client } from '../clients/client.entity';
import { Article } from '../articles/article.entity';
import { CaisseService } from '../caisse/caisse.service';
import { StoreContextService } from '../store-context/store-context.service';

describe('ReparationsService.pickupReady() — offline POS repair-pickup cache', () => {
    let service: ReparationsService;
    let dataSource: { query: jest.Mock };

    beforeEach(async () => {
        dataSource = { query: jest.fn() };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ReparationsService,
                { provide: getRepositoryToken(Reparation), useValue: {} },
                { provide: DataSource, useValue: dataSource },
                { provide: CaisseService, useValue: {} },
                { provide: StoreContextService, useValue: { requireMagasinId: jest.fn().mockReturnValue(1) } },
            ],
        }).compile();

        service = module.get<ReparationsService>(ReparationsService);
    });

    it('always filters by id_magasin and only the pickup-ready statuses', async () => {
        dataSource.query.mockResolvedValue([]);
        await service.pickupReady();
        const [sql, params] = dataSource.query.mock.calls[0];
        expect(sql).toMatch(/r\.id_magasin = \$1/);
        expect(sql).toMatch(/statut IN \('Livraison et réception', 'Terminé'\)/);
        expect(sql).not.toMatch(/updated_at >/);
        expect(params).toEqual([1]);
    });

    it('adds the updated_at filter only when since is given', async () => {
        dataSource.query.mockResolvedValue([]);
        await service.pickupReady('2026-01-01T00:00:00.000Z');
        const [sql, params] = dataSource.query.mock.calls[0];
        expect(sql).toMatch(/r\.updated_at > \$2/);
        expect(params).toEqual([1, '2026-01-01T00:00:00.000Z']);
    });
});

describe('ReparationsService.activeSync() — offline reparation-page cache', () => {
    let service: ReparationsService;
    let dataSource: { query: jest.Mock };

    beforeEach(async () => {
        dataSource = { query: jest.fn() };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ReparationsService,
                { provide: getRepositoryToken(Reparation), useValue: {} },
                { provide: DataSource, useValue: dataSource },
                { provide: CaisseService, useValue: {} },
                { provide: StoreContextService, useValue: { requireMagasinId: jest.fn().mockReturnValue(1) } },
            ],
        }).compile();

        service = module.get<ReparationsService>(ReparationsService);
    });

    it('always filters by id_magasin and only the in-progress statuses', async () => {
        dataSource.query.mockResolvedValue([]);
        await service.activeSync();
        const [sql, params] = dataSource.query.mock.calls[0];
        expect(sql).toMatch(/r\.id_magasin = \$1/);
        expect(sql).toMatch(/statut IN \('En attente', 'En cours'\)/);
        expect(sql).not.toMatch(/updated_at >/);
        expect(params).toEqual([1]);
    });

    it('adds the updated_at filter only when since is given', async () => {
        dataSource.query.mockResolvedValue([]);
        await service.activeSync('2026-01-01T00:00:00.000Z');
        const [sql, params] = dataSource.query.mock.calls[0];
        expect(sql).toMatch(/r\.updated_at > \$2/);
        expect(params).toEqual([1, '2026-01-01T00:00:00.000Z']);
    });
});

describe('ReparationsService.create() — offline sync (idempotency + negative stock)', () => {
    let service: ReparationsService;
    let reparationRepo: any;
    let dataSource: { query: jest.Mock; createQueryRunner: jest.Mock };
    let caisseService: { acteurOuSysteme: jest.Mock; enregistrerAuto: jest.Mock };

    /** A manager whose findOne() resolves Client/Article lookups, and whose save() distinguishes
     *  an Article save (has id_article) from the final Reparation save - same technique as
     *  ventes.service.spec.ts's makeManager(). */
    function makeManager(opts: { client?: any; article?: { id_article: number; quantite: number; prix_vente: number; designation: string } | null }) {
        let nextRepId = 1;
        return {
            findOne: jest.fn().mockImplementation((entity) => {
                if (entity === Client) return Promise.resolve(opts.client ?? { id_client: 1, nom: 'Client Test' });
                if (entity === Article) return Promise.resolve(opts.article === undefined ? null : opts.article ? { ...opts.article } : null);
                return Promise.resolve(null);
            }),
            create: jest.fn().mockImplementation((_entity, data) => ({ ...data })),
            save: jest.fn().mockImplementation((entity) => {
                if (entity && 'id_article' in entity) return Promise.resolve(entity); // article save
                return Promise.resolve({ ...entity, id_reparation: nextRepId++ }); // reparation save
            }),
            query: jest.fn().mockResolvedValue(undefined),
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
        reparationRepo = {
            findOne: jest.fn().mockImplementation(({ where }) => Promise.resolve({ id_reparation: where.id_reparation, appareil: 'iPhone', statut: 'En attente' })),
        };
        dataSource = { query: jest.fn(), createQueryRunner: jest.fn() };
        caisseService = {
            acteurOuSysteme: jest.fn().mockResolvedValue({ id: 1, nom: 'Caissier', role: 'admin' }),
            enregistrerAuto: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ReparationsService,
                { provide: getRepositoryToken(Reparation), useValue: reparationRepo },
                { provide: DataSource, useValue: dataSource },
                { provide: CaisseService, useValue: caisseService },
                { provide: StoreContextService, useValue: { requireMagasinId: jest.fn().mockReturnValue(1) } },
            ],
        }).compile();

        service = module.get<ReparationsService>(ReparationsService);
    });

    describe('idempotency', () => {
        it('returns the cached result on a retried client_id, without touching the query runner', async () => {
            dataSource.query.mockResolvedValueOnce([
                { resultat: { id_reparation: 42, avertissements: [] } },
            ]);
            const result = await service.create({ id_client: 1, items: [], client_id: 'abc-123' } as any, 'Bearer x');
            expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
            expect(result.id_reparation).toBe(42);
            expect(result.avertissements).toEqual([]);
        });

        it('records a fresh client_id and creates the ticket normally', async () => {
            dataSource.query.mockResolvedValueOnce([]); // no existing sync_operation_log row
            const manager = makeManager({ article: { id_article: 5, quantite: 10, prix_vente: 20, designation: 'Écran' } });
            const queryRunner = makeQueryRunner(manager);
            dataSource.createQueryRunner.mockReturnValue(queryRunner);

            const result = await service.create(
                { id_client: 1, items: [{ id_article: 5, qte: 1 }], client_id: 'new-client-id' } as any,
                'Bearer x',
            );

            expect(queryRunner.commitTransaction).toHaveBeenCalled();
            const logInsert = queryRunner.query.mock.calls.find(([sql]) => sql.includes('sync_operation_log'));
            expect(logInsert).toBeTruthy();
            expect(logInsert[1][0]).toBe('new-client-id');
            expect(result.id_reparation).toBeDefined();
        });
    });

    describe('stock going negative', () => {
        it('rejects insufficient stock for a normal, non-offline create (no client_id)', async () => {
            const manager = makeManager({ article: { id_article: 5, quantite: 1, prix_vente: 20, designation: 'Écran' } });
            const queryRunner = makeQueryRunner(manager);
            dataSource.createQueryRunner.mockReturnValue(queryRunner);

            await expect(
                service.create({ id_client: 1, items: [{ id_article: 5, qte: 3 }] } as any, 'Bearer x'),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('accepts insufficient stock for an offline-replayed create (client_id present) and warns', async () => {
            dataSource.query.mockResolvedValueOnce([]); // no existing log row
            const manager = makeManager({ article: { id_article: 5, quantite: 1, prix_vente: 20, designation: 'Écran' } });
            const queryRunner = makeQueryRunner(manager);
            dataSource.createQueryRunner.mockReturnValue(queryRunner);

            const result = await service.create(
                { id_client: 1, items: [{ id_article: 5, qte: 3 }], client_id: 'offline-1' } as any,
                'Bearer x',
            );
            expect(queryRunner.commitTransaction).toHaveBeenCalled();
            expect(result.avertissements).toHaveLength(1);
            expect(result.avertissements![0]).toMatch(/négatif/);
        });
    });

    describe('duplicate client_id race (concurrent sync retries)', () => {
        it("falls back to the winning transaction's result on a unique-constraint violation", async () => {
            dataSource.query
                .mockResolvedValueOnce([]) // first idempotency check: nothing yet
                .mockResolvedValueOnce([{ resultat: { id_reparation: 99, avertissements: [] } }]); // after losing the race
            const manager = makeManager({ article: { id_article: 5, quantite: 10, prix_vente: 20, designation: 'Écran' } });
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

            const result = await service.create(
                { id_client: 1, items: [{ id_article: 5, qte: 1 }], client_id: 'racy-id' } as any,
                'Bearer x',
            );
            expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(result.id_reparation).toBe(99);
        });
    });
});
