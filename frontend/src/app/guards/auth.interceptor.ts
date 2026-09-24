import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const router = inject(Router);
    const token = localStorage.getItem('token');
    const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

    return next(request).pipe(
        catchError((err: HttpErrorResponse) => {
            // An expired or invalid login token: send the user back to the login page
            // (a wrong password on the login form is also a 401, and must stay on that page)
            if (err.status === 401 && token && !req.url.includes('/auth/login')) {
                ['token', 'role', 'username', 'nom'].forEach(k => localStorage.removeItem(k));
                router.navigate(['/login']);
            }
            return throwError(() => err);
        })
    );
};
