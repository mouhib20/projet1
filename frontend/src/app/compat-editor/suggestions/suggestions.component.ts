import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CompatService } from '../../services/compat.service';
import { AuthService } from '../../services/auth.service';
import { CompatSuggestion } from '../../models/compat.model';

@Component({
    selector: 'app-suggestions',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './suggestions.component.html',
    styleUrls: ['./suggestions.component.css']
})
export class SuggestionsComponent implements OnInit {
    suggestions: CompatSuggestion[] = [];
    loading = false;
    errorMsg = '';
    successMsg = '';
    processingId: number | null = null;

    constructor(private compatService: CompatService, public auth: AuthService, private router: Router) { }

    ngOnInit(): void {
        this.load();
    }

    load(): void {
        this.loading = true;
        this.compatService.getSuggestions().subscribe({
            next: (data) => { this.suggestions = data; this.loading = false; },
            error: () => { this.errorMsg = 'COMPAT_SUGGESTIONS.ERR_LOAD'; this.loading = false; }
        });
    }

    get pending(): CompatSuggestion[] {
        return this.suggestions.filter(s => s.statut === 'en_attente');
    }

    get processed(): CompatSuggestion[] {
        return this.suggestions.filter(s => s.statut !== 'en_attente');
    }

    process(s: CompatSuggestion, statut: 'acceptee' | 'refusee'): void {
        if (this.processingId) return;
        this.processingId = s.id;
        this.errorMsg = '';
        this.successMsg = '';
        this.compatService.processSuggestion(s.id, statut).subscribe({
            next: () => {
                this.processingId = null;
                this.successMsg = statut === 'acceptee' ? 'COMPAT_SUGGESTIONS.SUCCESS_ACCEPTED' : 'COMPAT_SUGGESTIONS.SUCCESS_REFUSED';
                this.load();
            },
            error: (err) => {
                this.processingId = null;
                this.errorMsg = err.error?.message || 'COMPAT_SUGGESTIONS.ERR_PROCESS';
            }
        });
    }

    back(): void {
        this.router.navigate(['/compat-editor/groups']);
    }

    logout(): void {
        this.auth.logout();
    }
}
