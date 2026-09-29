import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../services/auth.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './login.component.html',
    styleUrl: './login.component.css'
})
export class LoginComponent {
    username = '';
    password = '';
    errorMsg = '';
    loading = false;
    showPassword = false;

    constructor(private authService: AuthService, private router: Router) {
        if (this.authService.isLoggedIn()) {
            this.router.navigate([this.landingRoute()]);
        }
    }

    /** Super Admin, compat_editor and wholesale_editor have no store of their own and never see the regular POS/stock/etc. pages. */
    private landingRoute(): string {
        if (this.authService.isSuperAdmin()) return '/super-admin/stores';
        if (this.authService.isCompatEditor()) return '/compat-editor/groups';
        if (this.authService.isWholesaleEditor()) return '/wholesale-editor/products';
        return '/vente/accueil';
    }

    togglePassword() {
        this.showPassword = !this.showPassword;
    }

    login() {
        if (!this.username || !this.password) {
            this.errorMsg = 'LOGIN.ERR_REQUIRED';
            return;
        }
        this.loading = true;
        this.errorMsg = '';

        this.authService.login(this.username, this.password).subscribe({
            next: () => {
                this.loading = false;
                this.router.navigate([this.landingRoute()]);
            },
            error: (err) => {
                this.loading = false;
                const msg = err?.error?.message;
                this.errorMsg = Array.isArray(msg) ? msg[0] : (msg || 'LOGIN.ERR_INVALID');
            }
        });
    }

    goHome() {
        this.router.navigate(['/']);
    }
}
