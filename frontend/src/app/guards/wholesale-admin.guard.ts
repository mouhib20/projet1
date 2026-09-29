import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * The wholesale store's own admin screens (listings, all-orders) — reachable only by an
 * employee with 'wholesale' access whose store is the ONE flagged as the wholesale supplier.
 * Mirrors estMagasinGrossisteRequis() on the backend (store identity, not a separate role).
 */
export const wholesaleAdminGuard: CanActivateFn = () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isLoggedIn()) {
        router.navigate(['/login']);
        return false;
    }
    if (auth.hasAnyPermission('wholesale') && auth.isMagasinGrossiste()) return true;
    router.navigate(['/vente/accueil']);
    return false;
};
