import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from './permissions.service';
import { PERMISSION_KEY, PermissionRequirement } from './require-permission.decorator';
import { MagasinModulesService } from '../magasin-modules/magasin-modules.service';

/**
 * Global guard, runs after JwtAuthGuard (which populates req.user).
 * A route with no @RequirePermission() is left untouched (today's behavior stays exactly as-is).
 * A route with @RequirePermission() first checks the store's own module switch (a department
 * Super Admin disabled for this store blocks everyone in it, including its own admin — this
 * check is skipped for super_admin, who has no store and isn't subject to any store's switches),
 * then lets admins through unconditionally, and checks the caller's granted matrix (with
 * backward-compatible fallback) for anyone else.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly permissionsService: PermissionsService,
        private readonly magasinModulesService: MagasinModulesService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(PERMISSION_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requirement) return true;

        const req = context.switchToHttp().getRequest();
        const user = req.user;
        if (!user) return true; // JwtAuthGuard already ran and would have rejected an anonymous call

        if (user.role === 'super_admin') return true; // no store of their own, not subject to any store's switches

        if (user.id_magasin != null) {
            const actif = await this.magasinModulesService.estActif(user.id_magasin, requirement.departement);
            if (!actif) throw new ForbiddenException("Ce module n'est pas activé pour votre magasin.");
        }

        if (user.role === 'admin') return true;

        const permis = await this.permissionsService.can(user.sub, user.role, requirement.departement, requirement.action);
        if (!permis) throw new ForbiddenException("Vous n'avez pas la permission pour cette action.");
        return true;
    }
}
