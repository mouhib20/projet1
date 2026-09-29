import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsService } from './permissions.service';
import { MagasinModulesService } from '../magasin-modules/magasin-modules.service';

function makeContext(user: any): ExecutionContext {
    return {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
    let reflector: { getAllAndOverride: jest.Mock };
    let permissionsService: { can: jest.Mock };
    let magasinModulesService: { estActif: jest.Mock };
    let guard: PermissionsGuard;

    beforeEach(() => {
        reflector = { getAllAndOverride: jest.fn() };
        permissionsService = { can: jest.fn() };
        magasinModulesService = { estActif: jest.fn().mockResolvedValue(true) };
        guard = new PermissionsGuard(
            reflector as unknown as Reflector,
            permissionsService as unknown as PermissionsService,
            magasinModulesService as unknown as MagasinModulesService,
        );
    });

    it('allows any route with no @RequirePermission() metadata, without checking the store module', async () => {
        reflector.getAllAndOverride.mockReturnValue(undefined);
        await expect(guard.canActivate(makeContext({ sub: 1, role: 'admin', id_magasin: 1 }))).resolves.toBe(true);
        expect(magasinModulesService.estActif).not.toHaveBeenCalled();
    });

    it('blocks a store\'s own admin when the department is disabled for that store', async () => {
        reflector.getAllAndOverride.mockReturnValue({ departement: 'stock', action: 'voir' });
        magasinModulesService.estActif.mockResolvedValue(false);
        await expect(
            guard.canActivate(makeContext({ sub: 1, role: 'admin', id_magasin: 1 })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(permissionsService.can).not.toHaveBeenCalled();
    });

    it('blocks a regular employee the same way when the department is disabled for their store', async () => {
        reflector.getAllAndOverride.mockReturnValue({ departement: 'stock', action: 'voir' });
        magasinModulesService.estActif.mockResolvedValue(false);
        await expect(
            guard.canActivate(makeContext({ sub: 2, role: 'vendeur', id_magasin: 1 })),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('skips the module check entirely for super_admin (id_magasin is null)', async () => {
        reflector.getAllAndOverride.mockReturnValue({ departement: 'stock', action: 'voir' });
        await expect(
            guard.canActivate(makeContext({ sub: 1, role: 'super_admin', id_magasin: null })),
        ).resolves.toBe(true);
        expect(magasinModulesService.estActif).not.toHaveBeenCalled();
    });

    it('lets a store admin through once the module is enabled, without checking the granted matrix', async () => {
        reflector.getAllAndOverride.mockReturnValue({ departement: 'stock', action: 'voir' });
        magasinModulesService.estActif.mockResolvedValue(true);
        await expect(guard.canActivate(makeContext({ sub: 1, role: 'admin', id_magasin: 1 }))).resolves.toBe(true);
        expect(permissionsService.can).not.toHaveBeenCalled();
    });

    it('still checks the granted matrix for a non-admin once the module is enabled', async () => {
        reflector.getAllAndOverride.mockReturnValue({ departement: 'stock', action: 'voir' });
        magasinModulesService.estActif.mockResolvedValue(true);
        permissionsService.can.mockResolvedValue(false);
        await expect(
            guard.canActivate(makeContext({ sub: 2, role: 'vendeur', id_magasin: 1 })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(permissionsService.can).toHaveBeenCalledWith(2, 'vendeur', 'stock', 'voir');
    });
});
