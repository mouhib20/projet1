import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionsService } from './permissions.service';
import { Permission } from './permission.entity';

type MockRepo = Partial<Record<keyof Repository<Permission>, jest.Mock>>;

const createMockRepo = (): MockRepo => ({
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn((v) => v),
    save: jest.fn(),
});

describe('PermissionsService', () => {
    let service: PermissionsService;
    let repo: MockRepo;

    beforeEach(async () => {
        repo = createMockRepo();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PermissionsService,
                { provide: getRepositoryToken(Permission), useValue: repo },
            ],
        }).compile();

        service = module.get<PermissionsService>(PermissionsService);
    });

    describe('can() — backward compatibility for accounts with no permission rows', () => {
        // These are exactly the accounts that existed before this feature: the seeded admin,
        // or any vendeur/vendeuse/visiteur account. Their behavior must not change.
        it('allows reading (voir) for any role, including visiteur', async () => {
            (repo.find as jest.Mock).mockResolvedValue([]);
            await expect(service.can(1, 'visiteur', 'clients', 'voir')).resolves.toBe(true);
            await expect(service.can(1, 'vendeur', 'clients', 'voir')).resolves.toBe(true);
            await expect(service.can(1, 'admin', 'clients', 'voir')).resolves.toBe(true);
        });

        it('blocks writes for visiteur', async () => {
            (repo.find as jest.Mock).mockResolvedValue([]);
            await expect(service.can(1, 'visiteur', 'charges', 'ajouter')).resolves.toBe(false);
            await expect(service.can(1, 'visiteur', 'charges', 'modifier')).resolves.toBe(false);
            await expect(service.can(1, 'visiteur', 'charges', 'supprimer')).resolves.toBe(false);
        });

        it('allows writes for vendeur/vendeuse/admin', async () => {
            (repo.find as jest.Mock).mockResolvedValue([]);
            await expect(service.can(1, 'vendeur', 'charges', 'ajouter')).resolves.toBe(true);
            await expect(service.can(1, 'vendeuse', 'charges', 'supprimer')).resolves.toBe(true);
            await expect(service.can(1, 'admin', 'charges', 'modifier')).resolves.toBe(true);
        });
    });

    describe('can() — an employee with an explicit permission matrix', () => {
        it('is checked strictly against their granted row, not the legacy fallback', async () => {
            (repo.find as jest.Mock).mockResolvedValue([
                { id_utilisateur: 2, departement: 'charges', peut_voir: false, peut_ajouter: true, peut_modifier: false, peut_supprimer: false },
            ]);
            // Granted: can add an expense...
            await expect(service.can(2, 'vendeur', 'charges', 'ajouter')).resolves.toBe(true);
            // ...but NOT view, edit or delete, even though the role alone would normally allow it
            await expect(service.can(2, 'vendeur', 'charges', 'voir')).resolves.toBe(false);
            await expect(service.can(2, 'vendeur', 'charges', 'modifier')).resolves.toBe(false);
            await expect(service.can(2, 'vendeur', 'charges', 'supprimer')).resolves.toBe(false);
        });

        it('denies everything on a department with no row at all, even though other departments have rows', async () => {
            (repo.find as jest.Mock).mockResolvedValue([
                { id_utilisateur: 2, departement: 'clients', peut_voir: true, peut_ajouter: true, peut_modifier: false, peut_supprimer: false },
            ]);
            await expect(service.can(2, 'vendeur', 'stock', 'voir')).resolves.toBe(false);
        });

        it('admin role still passes even with a fully-false row (the caller enforces the admin bypass, not can() itself)', async () => {
            // can() only reflects the granted matrix; PermissionsGuard is what special-cases role==='admin'.
            (repo.find as jest.Mock).mockResolvedValue([
                { id_utilisateur: 3, departement: 'clients', peut_voir: false, peut_ajouter: false, peut_modifier: false, peut_supprimer: false },
            ]);
            await expect(service.can(3, 'admin', 'clients', 'voir')).resolves.toBe(false);
        });
    });

    describe('getMatrix() / setMatrix()', () => {
        it('getMatrix fills missing departments with all-false rather than omitting them', async () => {
            (repo.find as jest.Mock).mockResolvedValue([
                { id_utilisateur: 2, departement: 'clients', peut_voir: true, peut_ajouter: false, peut_modifier: false, peut_supprimer: false },
            ]);
            const matrix = await service.getMatrix(2);
            expect(matrix.clients).toEqual({ voir: true, ajouter: false, modifier: false, supprimer: false });
            expect(matrix.stock).toEqual({ voir: false, ajouter: false, modifier: false, supprimer: false });
            expect(Object.keys(matrix)).toHaveLength(7);
        });

        it('setMatrix updates an existing row instead of duplicating it', async () => {
            (repo.findOne as jest.Mock).mockResolvedValue({ id: 10, id_utilisateur: 2, departement: 'charges' });
            (repo.find as jest.Mock).mockResolvedValue([]);
            await service.setMatrix(2, { charges: { voir: false, ajouter: true, modifier: false, supprimer: false } });
            expect(repo.update).toHaveBeenCalledWith(10, expect.objectContaining({ departement: 'charges', peut_ajouter: true }));
            expect(repo.save).not.toHaveBeenCalled();
        });

        it('setMatrix creates a new row when none exists yet for that department', async () => {
            (repo.findOne as jest.Mock).mockResolvedValue(null);
            (repo.find as jest.Mock).mockResolvedValue([]);
            await service.setMatrix(2, { stock: { voir: true, ajouter: false, modifier: false, supprimer: false } });
            expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ departement: 'stock', peut_voir: true }));
        });
    });
});
