import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MagasinModulesService } from './magasin-modules.service';
import { MagasinModule } from '../magasins/magasin-module.entity';

type MockRepo = Partial<Record<keyof Repository<MagasinModule>, jest.Mock>>;

const createMockRepo = (): MockRepo => ({
    findOne: jest.fn(),
});

describe('MagasinModulesService', () => {
    let service: MagasinModulesService;
    let repo: MockRepo;

    beforeEach(async () => {
        repo = createMockRepo();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MagasinModulesService,
                { provide: getRepositoryToken(MagasinModule), useValue: repo },
            ],
        }).compile();

        service = module.get<MagasinModulesService>(MagasinModulesService);
    });

    describe('estActif()', () => {
        it('returns true when no row exists for that (store, department) pair (never toggled = enabled)', async () => {
            (repo.findOne as jest.Mock).mockResolvedValue(null);
            await expect(service.estActif(1, 'stock')).resolves.toBe(true);
        });

        it('returns the stored value when a row exists and is disabled', async () => {
            (repo.findOne as jest.Mock).mockResolvedValue({ id_magasin: 1, departement: 'stock', actif: false });
            await expect(service.estActif(1, 'stock')).resolves.toBe(false);
        });

        it('returns the stored value when a row exists and is explicitly enabled', async () => {
            (repo.findOne as jest.Mock).mockResolvedValue({ id_magasin: 1, departement: 'stock', actif: true });
            await expect(service.estActif(1, 'stock')).resolves.toBe(true);
        });

        it('looks the row up scoped to the given store and department', async () => {
            (repo.findOne as jest.Mock).mockResolvedValue(null);
            await service.estActif(42, 'charges');
            expect(repo.findOne).toHaveBeenCalledWith({ where: { id_magasin: 42, departement: 'charges' } });
        });
    });
});
