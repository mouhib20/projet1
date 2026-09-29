import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, Departement } from '../services/auth.service';

/**
 * A route reachable as soon as the employee has been granted at least one action (view, add,
 * edit or delete) on that department — e.g. an employee who can only add expenses, without
 * being able to browse the existing list, still needs to reach the Charges page to do it.
 * The page itself is responsible for hiding its "view" content when 'voir' is not granted.
 */
export const permissionGuard = (dept: Departement): CanActivateFn => () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isLoggedIn()) {
        router.navigate(['/login']);
        return false;
    }
    if (auth.hasAnyPermission(dept)) return true;
    router.navigate(['/vente/accueil']);
    return false;
};
