import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../services/auth.service';

@Component({
    selector: 'app-vente',
    standalone: true,
    imports: [CommonModule, RouterModule, TranslatePipe],
    templateUrl: './vente.component.html',
    styleUrl: './vente.component.css'
})
export class VenteComponent {
    showLangMenu = false;
    currentLang = 'Français';

    languages = [
        { code: 'ar', label: 'العربية' },
        { code: 'fr', label: 'Français' },
        { code: 'en', label: 'English' }
    ];

    constructor(
        private router: Router,
        private translate: TranslateService,
        public auth: AuthService
    ) {
        this.setInitialLangLabel();
    }

    setInitialLangLabel() {
        const lang = this.translate.getCurrentLang() || this.translate.getBrowserLang() || 'fr';
        const found = this.languages.find(l => l.code === lang);
        if (found) {
            this.currentLang = found.label;
        }
    }

    goHome() {
        this.router.navigate(['']);
    }

    logout() {
        this.auth.logout();
    }

    toggleLangMenu() {
        this.showLangMenu = !this.showLangMenu;
    }

    selectLang(lang: any) {
        this.currentLang = lang.label;
        this.showLangMenu = false;
        this.translate.use(lang.code);
    }
}
