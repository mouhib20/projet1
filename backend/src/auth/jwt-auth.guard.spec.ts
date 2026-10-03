import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { StoreContextService } from '../store-context/store-context.service';

function makeContext(req: any): ExecutionContext {
    return {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
}

function makeRequest(overrides: Partial<{ method: string; url: string; token: string }> = {}) {
    return {
        method: overrides.method ?? 'POST',
        url: overrides.url ?? '/api/ventes',
        originalUrl: overrides.url ?? '/api/ventes',
        headers: { authorization: `Bearer ${overrides.token ?? 'tok'}` },
    };
}

describe('JwtAuthGuard', () => {
    let reflector: { getAllAndOverride: jest.Mock };
    let jwt: { verify: jest.Mock };
    let usersService: { findById: jest.Mock };
    let storeContext: { definir: jest.Mock };
    let dataSource: { query: jest.Mock };
    let guard: JwtAuthGuard;

    beforeEach(() => {
        reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
        jwt = { verify: jest.fn().mockReturnValue({ sub: 1, role: 'admin' }) };
        usersService = { findById: jest.fn().mockResolvedValue({ id: 1, actif: true, id_magasin: 1, role: 'admin' }) };
        storeContext = { definir: jest.fn() };
        dataSource = { query: jest.fn().mockResolvedValue([{ actif: true, abonnement_statut: 'active' }]) };
        guard = new JwtAuthGuard(
            jwt as unknown as JwtService,
            reflector as unknown as Reflector,
            usersService as unknown as UsersService,
            storeContext as unknown as StoreContextService,
            dataSource as unknown as DataSource,
        );
    });

    it('allows a write when the subscription is active', async () => {
        await expect(guard.canActivate(makeContext(makeRequest({ method: 'POST' })))).resolves.toBe(true);
    });

    it('allows a write when the subscription is trial or grace', async () => {
        dataSource.query.mockResolvedValue([{ actif: true, abonnement_statut: 'trial' }]);
        await expect(guard.canActivate(makeContext(makeRequest({ method: 'POST' })))).resolves.toBe(true);
        dataSource.query.mockResolvedValue([{ actif: true, abonnement_statut: 'grace' }]);
        await expect(guard.canActivate(makeContext(makeRequest({ method: 'POST' })))).resolves.toBe(true);
    });

    it('blocks a write (POST/PUT/PATCH/DELETE) once the subscription is suspended', async () => {
        dataSource.query.mockResolvedValue([{ actif: true, abonnement_statut: 'suspended' }]);
        await expect(guard.canActivate(makeContext(makeRequest({ method: 'POST' })))).rejects.toBeInstanceOf(ForbiddenException);
        await expect(guard.canActivate(makeContext(makeRequest({ method: 'PUT' })))).rejects.toBeInstanceOf(ForbiddenException);
        await expect(guard.canActivate(makeContext(makeRequest({ method: 'PATCH' })))).rejects.toBeInstanceOf(ForbiddenException);
        await expect(guard.canActivate(makeContext(makeRequest({ method: 'DELETE' })))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('still allows reads (GET/HEAD) once the subscription is suspended - data stays visible/exportable', async () => {
        dataSource.query.mockResolvedValue([{ actif: true, abonnement_statut: 'suspended' }]);
        await expect(guard.canActivate(makeContext(makeRequest({ method: 'GET' })))).resolves.toBe(true);
        await expect(guard.canActivate(makeContext(makeRequest({ method: 'HEAD' })))).resolves.toBe(true);
    });

    it('still blocks a fully-suspended store (magasin.actif=false) regardless of subscription status, even for reads', async () => {
        dataSource.query.mockResolvedValue([{ actif: false, abonnement_statut: 'active' }]);
        await expect(guard.canActivate(makeContext(makeRequest({ method: 'GET' })))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('skips the subscription check entirely for super_admin (id_magasin is null)', async () => {
        usersService.findById.mockResolvedValue({ id: 1, actif: true, id_magasin: null, role: 'super_admin' });
        jwt.verify.mockReturnValue({ sub: 1, role: 'super_admin' });
        await expect(guard.canActivate(makeContext(makeRequest({ method: 'POST' })))).resolves.toBe(true);
        expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('skips the subscription check for store-agnostic roles like compat_editor (id_magasin is null)', async () => {
        usersService.findById.mockResolvedValue({ id: 1, actif: true, id_magasin: null, role: 'compat_editor' });
        jwt.verify.mockReturnValue({ sub: 1, role: 'compat_editor' });
        await expect(guard.canActivate(makeContext(makeRequest({ method: 'POST' })))).resolves.toBe(true);
        expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('treats a store with no abonnement row yet as unrestricted (LEFT JOIN gives a null statut)', async () => {
        dataSource.query.mockResolvedValue([{ actif: true, abonnement_statut: null }]);
        await expect(guard.canActivate(makeContext(makeRequest({ method: 'POST' })))).resolves.toBe(true);
    });

    it('rejects with no token', async () => {
        const req = makeRequest();
        req.headers = {} as any;
        await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(UnauthorizedException);
    });
});
