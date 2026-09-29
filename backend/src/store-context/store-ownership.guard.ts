import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { StoreContextService } from './store-context.service';
import { SCOPED_BY_STORE_KEY, ScopedByStoreMeta } from './scoped-by-store.decorator';

/** Table/column names come only from our own @ScopedByStore() call sites (never from user input),
 * so building this identifier list is safe despite not being parameterizable in SQL. */
const identifiant = (s: string) => `"${s.replace(/[^a-zA-Z0-9_]/g, '')}"`;

/**
 * Global guard, runs after JwtAuthGuard/PermissionsGuard. A route with no @ScopedByStore() is
 * left untouched. A route with @ScopedByStore(table, pkColumn) has its target row's id_magasin
 * checked against the caller's store before the handler runs — independent of whatever the
 * service itself does, so a forgotten filter inside the service doesn't turn into an IDOR.
 */
@Injectable()
export class StoreOwnershipGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly storeContext: StoreContextService,
        private readonly dataSource: DataSource,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const meta = this.reflector.getAllAndOverride<ScopedByStoreMeta>(SCOPED_BY_STORE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!meta) return true;
        if (this.storeContext.isSuperAdmin()) return true;

        const req = context.switchToHttp().getRequest();
        const rawId = req.params?.[meta.paramName];
        const id = Number(rawId);
        if (!rawId || Number.isNaN(id)) return true; // not an :id route despite the decorator — nothing to check

        const magasinAppelant = this.storeContext.requireMagasinId();
        const rows = await this.dataSource.query(
            `SELECT id_magasin FROM ${identifiant(meta.table)} WHERE ${identifiant(meta.pkColumn)} = $1`,
            [id],
        );
        if (rows.length === 0) throw new NotFoundException();
        if (rows[0].id_magasin !== magasinAppelant) {
            throw new ForbiddenException("Cette ressource n'appartient pas à votre magasin.");
        }
        return true;
    }
}
