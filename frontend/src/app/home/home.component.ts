import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [CommonModule, TranslatePipe],
    templateUrl: './home.component.html',
    styleUrl: './home.component.css'
})
export class HomeComponent {
    showLangMenu = false;
    currentLang = 'Français';

    languages = [
        { code: 'ar', label: 'العربية' },
        { code: 'fr', label: 'Français' },
        { code: 'en', label: 'English' }
    ];

    constructor(
        private router: Router,
        private translate: TranslateService
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

    goTo(path: string) {
        this.router.navigate([path]);
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
