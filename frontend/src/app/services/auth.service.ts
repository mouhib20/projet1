import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type UserRole = 'admin' | 'vendeur' | 'vendeuse' | 'visiteur';
export type Departement = 'ventes' | 'stock' | 'reparation' | 'fournisseurs' | 'charges' | 'clients' | 'rapports';
export type PermissionAction = 'voir' | 'ajouter' | 'modifier' | 'supprimer';
export type PermissionEntry = { voir: boolean; ajouter: boolean; modifier: boolean; supprimer: boolean };
export type PermissionMatrix = Partial<Record<Departement, PermissionEntry>>;

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
                localStorage.setItem('permissions', JSON.stringify(res.permissions || {}));
            })
        );
    }

    logout(): void {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('username');
        localStorage.removeItem('nom');
        localStorage.removeItem('permissions');
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

    getPermissions(): PermissionMatrix {
        try {
            return JSON.parse(localStorage.getItem('permissions') || '{}');
        } catch {
            return {};
        }
    }

    /** For an account with no permission rows (predates this feature): today's exact visibility per department. */
    private legacyVoirParDefaut(dept: Departement): boolean {
        const role = this.getRole();
        if (dept === 'ventes' || dept === 'rapports') return true; // open to everyone today, including visiteur
        if (dept === 'stock' || dept === 'fournisseurs') return role === 'admin'; // admin-only pages today
        return role !== 'visiteur'; // clients / charges: hidden only from visiteur
    }

    private legacyPeutParDefaut(dept: Departement, action: PermissionAction): boolean {
        if (action === 'voir') return this.legacyVoirParDefaut(dept);
        const role = this.getRole();
        if (role === 'visiteur') return false;
        if (dept === 'stock' || dept === 'fournisseurs') return role === 'admin'; // writes here are admin-only today
        return true;
    }

    /**
     * Admins always pass. An employee with no permission rows at all (every account that existed
     * before this feature) falls back to reproducing exactly today's behavior for that department
     * (see legacyPeutParDefaut). Employees created via the Employees page are checked strictly
     * against their granted matrix.
     */
    hasPermission(dept: Departement, action: PermissionAction): boolean {
        if (this.isAdmin()) return true;
        const perms = this.getPermissions();
        if (Object.keys(perms).length === 0) return this.legacyPeutParDefaut(dept, action);
        return !!perms[dept]?.[action];
    }
}
