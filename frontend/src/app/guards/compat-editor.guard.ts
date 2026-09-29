import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const compatEditorGuard: CanActivateFn = () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isLoggedIn()) {
        router.navigate(['/login']);
        return false;
    }
    if (auth.isCompatEditor() || auth.isSuperAdmin()) return true;
    router.navigate(['/vente/accueil']);
    return false;
};
