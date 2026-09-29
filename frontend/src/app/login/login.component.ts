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

    /** Super Admin has no store of its own and never sees the regular POS/stock/etc. pages. */
    private landingRoute(): string {
        return this.authService.isSuperAdmin() ? '/super-admin/stores' : '/vente/accueil';
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
