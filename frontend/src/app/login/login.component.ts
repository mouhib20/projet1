import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, FormsModule],
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
            this.router.navigate(['/vente']);
        }
    }

    togglePassword() {
        this.showPassword = !this.showPassword;
    }

    login() {
        if (!this.username || !this.password) {
            this.errorMsg = 'Veuillez remplir tous les champs.';
            return;
        }
        this.loading = true;
        this.errorMsg = '';

        this.authService.login(this.username, this.password).subscribe({
            next: () => {
                this.loading = false;
                this.router.navigate(['/vente']);
            },
            error: (err) => {
                this.loading = false;
                const msg = err?.error?.message;
                this.errorMsg = Array.isArray(msg) ? msg[0] : (msg || 'Identifiants incorrects.');
            }
        });
    }

    goHome() {
        this.router.navigate(['/']);
    }
}
