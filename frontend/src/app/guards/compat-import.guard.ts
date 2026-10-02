import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Exclusive to compatibility_employee - modeled on superAdminGuard's single-role check (no OR),
 *  not compatEditorGuard's "OR super_admin" pattern, since super_admin must never reach this screen. */
export const compatImportGuard: CanActivateFn = () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isLoggedIn()) {
        router.navigate(['/login']);
        return false;
    }
    if (auth.isCompatImportEmployee()) return true;
    router.navigate(['/vente/accueil']);
    return false;
};
