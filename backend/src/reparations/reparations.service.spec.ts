import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ReparationsService } from './reparations.service';
import { Reparation } from './reparation.entity';
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
