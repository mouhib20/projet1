import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type UserRole = 'super_admin' | 'compat_editor' | 'wholesale_editor' | 'admin' | 'vendeur' | 'vendeuse' | 'visiteur';
export type Departement = 'ventes' | 'stock' | 'reparation' | 'fournisseurs' | 'charges' | 'clients' | 'rapports' | 'compatibilite' | 'wholesale';
export type PermissionAction = 'voir' | 'ajouter' | 'modifier' | 'supprimer';
export type PermissionEntry = { voir: boolean; ajouter: boolean; modifier: boolean; supprimer: boolean };
export type PermissionMatrix = Partial<Record<Departement, PermissionEntry>>;
export type ModulesMatrix = Partial<Record<Departement, boolean>>;

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
                localStorage.setItem('id_magasin', res.id_magasin == null ? '' : String(res.id_magasin));
                localStorage.setItem('modules', JSON.stringify(res.modules || {}));
            })
        );
    }

    logout(): void {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('username');
        localStorage.removeItem('nom');
        localStorage.removeItem('permissions');
        localStorage.removeItem('id_magasin');
        localStorage.removeItem('modules');
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

    isSuperAdmin(): boolean {
        return this.getRole() === 'super_admin';
    }

    isCompatEditor(): boolean {
        return this.getRole() === 'compat_editor';
    }

    isWholesaleEditor(): boolean {
        return this.getRole() === 'wholesale_editor';
    }

    /** null for super_admin/compat_editor/wholesale_editor (no store of their own), otherwise the account's store id. */
    getMagasinId(): number | null {
        const raw = localStorage.getItem('id_magasin');
        return raw ? Number(raw) : null;
    }

    getPermissions(): PermissionMatrix {
        try {
            return JSON.parse(localStorage.getItem('permissions') || '{}');
        } catch {
            return {};
        }
    }

    private getModules(): ModulesMatrix {
        try {
            return JSON.parse(localStorage.getItem('modules') || '{}');
        } catch {
            return {};
        }
    }

    /**
     * Whether Super Admin has this department turned on for the account's store. Always true for
     * super_admin (has no store, isn't subject to any store's switches) and for an account whose
     * login response carried no modules map at all (nothing to gate on — fails open, same default
     * the backend uses for a department nobody has ever toggled).
     */
    isModuleEnabled(dept: Departement): boolean {
        if (this.isSuperAdmin()) return true;
        const modules = this.getModules();
        if (Object.keys(modules).length === 0) return true;
        return modules[dept] !== false;
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
     * Admins always pass (unless Super Admin has switched this department off for their store —
     * checked first, since a store's own admin is not exempt from that). An employee with no
     * permission rows at all (every account that existed before this feature) falls back to
     * reproducing exactly today's behavior for that department (see legacyPeutParDefaut).
     * Employees created via the Employees page are checked strictly against their granted matrix.
     */
    hasPermission(dept: Departement, action: PermissionAction): boolean {
        if (!this.isModuleEnabled(dept)) return false;
        if (this.isAdmin()) return true;
        const perms = this.getPermissions();
        if (Object.keys(perms).length === 0) return this.legacyPeutParDefaut(dept, action);
        return !!perms[dept]?.[action];
    }

    /**
     * True if the employee has been granted at least one of the four actions on this department
     * (e.g. can add expenses without being able to browse the existing list). Used to decide
     * whether a page/section is reachable at all; the page itself still hides its "view" content
     * when 'voir' specifically is not granted. Also false whenever Super Admin has switched the
     * department off for this store, even for that store's own admin.
     */
    hasAnyPermission(dept: Departement): boolean {
        if (!this.isModuleEnabled(dept)) return false;
        if (this.isAdmin()) return true;
        const perms = this.getPermissions();
        if (Object.keys(perms).length === 0) return this.legacyPeutParDefaut(dept, 'voir');
        const entry = perms[dept];
        return !!entry && (entry.voir || entry.ajouter || entry.modifier || entry.supprimer);
    }
}
