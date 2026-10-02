import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** compatibility_employee or compat_editor - super_admin and every store role still blocked (not
 *  compatEditorGuard's "OR super_admin" pattern), by explicit request. */
export const compatImportGuard: CanActivateFn = () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isLoggedIn()) {
        router.navigate(['/login']);
        return false;
    }
    if (auth.isCompatImportEmployee() || auth.isCompatEditor()) return true;
    router.navigate(['/vente/accueil']);
    return false;
};
