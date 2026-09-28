import { SetMetadata } from '@nestjs/common';
import { Departement } from './permission.entity';

export const PERMISSION_KEY = 'permission';

export type PermissionAction = 'voir' | 'ajouter' | 'modifier' | 'supprimer';

export interface PermissionRequirement {
    departement: Departement;
    action: PermissionAction;
}

/** Marks a route as requiring a specific department permission (checked by PermissionsGuard). */
export const RequirePermission = (departement: Departement, action: PermissionAction) =>
    SetMetadata(PERMISSION_KEY, { departement, action } as PermissionRequirement);
