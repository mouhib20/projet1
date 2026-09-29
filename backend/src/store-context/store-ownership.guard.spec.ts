import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StoreOwnershipGuard } from './store-ownership.guard';
import { StoreContextService } from './store-context.service';
import { SCOPED_BY_STORE_KEY } from './scoped-by-store.decorator';

function makeContext(params: Record<string, string>): ExecutionContext {
    return {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => ({ params }) }),
    } as unknown as ExecutionContext;
}

describe('StoreOwnershipGuard', () => {
    let reflector: { getAllAndOverride: jest.Mock };
    let storeContext: Partial<StoreContextService>;
    let dataSource: { query: jest.Mock };
    let guard: StoreOwnershipGuard;

    beforeEach(() => {
        reflector = { getAllAndOverride: jest.fn() };
        storeContext = {
            isSuperAdmin: jest.fn().mockReturnValue(false),
            requireMagasinId: jest.fn().mockReturnValue(1),
        };
        dataSource = { query: jest.fn() };
        guard = new StoreOwnershipGuard(reflector as unknown as Reflector, storeContext as StoreContextService, dataSource as any);
    });

    it('allows any route with no @ScopedByStore() metadata', async () => {
        reflector.getAllAndOverride.mockReturnValue(undefined);
        await expect(guard.canActivate(makeContext({ id: '99' }))).resolves.toBe(true);
        expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('lets super_admin through unconditionally, even for a scoped route', async () => {
        reflector.getAllAndOverride.mockReturnValue({ table: 'client', pkColumn: 'id_client', paramName: 'id' });
        (storeContext.isSuperAdmin as jest.Mock).mockReturnValue(true);
        await expect(guard.canActivate(makeContext({ id: '5' }))).resolves.toBe(true);
        expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('allows access when the target row belongs to the caller\'s store', async () => {
        reflector.getAllAndOverride.mockReturnValue({ table: 'client', pkColumn: 'id_client', paramName: 'id' });
        dataSource.query.mockResolvedValue([{ id_magasin: 1 }]);
        await expect(guard.canActivate(makeContext({ id: '5' }))).resolves.toBe(true);
    });

    it('rejects with 403 when the target row belongs to a different store', async () => {
        reflector.getAllAndOverride.mockReturnValue({ table: 'client', pkColumn: 'id_client', paramName: 'id' });
        dataSource.query.mockResolvedValue([{ id_magasin: 2 }]);
        await expect(guard.canActivate(makeContext({ id: '5' }))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects with 404 when the target row does not exist at all', async () => {
        reflector.getAllAndOverride.mockReturnValue({ table: 'client', pkColumn: 'id_client', paramName: 'id' });
        dataSource.query.mockResolvedValue([]);
        await expect(guard.canActivate(makeContext({ id: '999' }))).rejects.toBeInstanceOf(NotFoundException);
    });

    it('skips the check when the route has no matching :id param despite the decorator', async () => {
        reflector.getAllAndOverride.mockReturnValue({ table: 'client', pkColumn: 'id_client', paramName: 'id' });
        await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);
        expect(dataSource.query).not.toHaveBeenCalled();
    });
});
