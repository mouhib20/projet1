import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from './permissions.service';
import { PERMISSION_KEY, PermissionRequirement } from './require-permission.decorator';

/**
 * Global guard, runs after JwtAuthGuard (which populates req.user).
 * A route with no @RequirePermission() is left untouched (today's behavior stays exactly as-is).
 * A route with @RequirePermission() lets admins through unconditionally, and checks the caller's
 * granted matrix (with backward-compatible fallback) for anyone else.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly permissionsService: PermissionsService,
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

        if (user.role === 'admin') return true;

        const permis = await this.permissionsService.can(user.sub, user.role, requirement.departement, requirement.action);
        if (!permis) throw new ForbiddenException("Vous n'avez pas la permission pour cette action.");
        return true;
    }
}
