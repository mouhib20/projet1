import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type UserRole = 'admin' | 'vendeur' | 'vendeuse' | 'visiteur';

@Injectable({ providedIn: 'root' })
export class AuthService {
    private apiUrl = `${environment.apiUrl}/auth`;

    constructor(private http: HttpClient, private router: Router) { }

    login(username: string, password: string): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/login`, { username, password }).pipe(
            tap(res => {
                localStorage.setItem('token', res.access_token);
                localStorage.setItem('role', res.role);
                localStorage.setItem('username', res.username);
                localStorage.setItem('nom', res.nom);
            })
        );
    }

    logout(): void {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('username');
        localStorage.removeItem('nom');
        this.router.navigate(['/login']);
    }

    isLoggedIn(): boolean {
        return !!localStorage.getItem('token');
    }

    getToken(): string | null {
        return localStorage.getItem('token');
    }

    getRole(): UserRole | null {
        return localStorage.getItem('role') as UserRole | null;
    }

    getUsername(): string | null {
        return localStorage.getItem('username');
    }

    getNom(): string | null {
        return localStorage.getItem('nom');
    }

    isAdmin(): boolean {
        return this.getRole() === 'admin';
    }
}
