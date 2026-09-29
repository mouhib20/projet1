import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { StoreContextService } from './store-context.service';

describe('StoreContextService', () => {
    let service: StoreContextService;
    let store: Map<string, unknown>;
    let cls: any;

    beforeEach(async () => {
        store = new Map();
        cls = {
            set: jest.fn((key: string, value: unknown) => { store.set(key, value); }),
            get: jest.fn((key: string) => store.get(key)),
        };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                StoreContextService,
                { provide: ClsService, useValue: cls },
            ],
        }).compile();
        service = module.get<StoreContextService>(StoreContextService);
    });

    it('returns null store id before definir() is called', () => {
        expect(service.getMagasinId()).toBeNull();
    });

    it('exposes the store id set by definir()', () => {
        service.definir(5, 'admin');
        expect(service.getMagasinId()).toBe(5);
    });

    it('exposes null store id for a super_admin', () => {
        service.definir(null, 'super_admin');
        expect(service.getMagasinId()).toBeNull();
        expect(service.isSuperAdmin()).toBe(true);
    });

    it('isSuperAdmin is false for every other role', () => {
        for (const role of ['admin', 'vendeur', 'vendeuse', 'visiteur']) {
            service.definir(1, role);
            expect(service.isSuperAdmin()).toBe(false);
        }
    });

    it('requireMagasinId returns the store id when set', () => {
        service.definir(7, 'admin');
        expect(service.requireMagasinId()).toBe(7);
    });

    it('requireMagasinId throws when no store is set (e.g. a super_admin request reaching a store-scoped service by mistake)', () => {
        service.definir(null, 'super_admin');
        expect(() => service.requireMagasinId()).toThrow();
    });
});
