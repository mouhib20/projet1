import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isLoggedIn()) {
        router.navigate(['/login']);
        return false;
    }

    const requiredRoles = route.data?.['roles'] as Array<string>;
    if (requiredRoles && requiredRoles.length > 0) {
        const userRole = auth.getRole();
        if (!userRole || !requiredRoles.includes(userRole)) {
            router.navigate(['/vente/accueil']);
            return false;
        }
    }

    return true;
};
