import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CompatService } from '../../services/compat.service';
import { AuthService } from '../../services/auth.service';

interface SearchResult {
    id_model: number;
    modele: string;
    nom_commercial: string | null;
    code: string | null;
    id_brand: number;
    marque: string;
    groupes: { id_group: number; id_part_type: number; nom_fr: string; nom_en: string; nom_ar: string }[];
}

interface PartRow {
    id_group: number;
    id_part_type: number;
    nom_fr: string;
    nom_en: string;
    nom_ar: string;
    note: string | null;
    image: string | null;
    id_article: number | null;
    designation: string | null;
    quantite: number | null;
    prix_vente: number | null;
}

@Component({
    selector: 'app-compatibilite',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './compatibilite.component.html',
    styleUrls: ['./compatibilite.component.css']
})
export class CompatibiliteComponent {
    searchTerm = '';
    searching = false;
    searched = false;
    results: SearchResult[] = [];
    errorMsg = '';

    expandedModelId: number | null = null;
    partsLoading = false;
    parts: PartRow[] = [];

    constructor(
        private compatService: CompatService,
        public auth: AuthService,
        private translate: TranslateService,
    ) { }

    partTypeName(pt: { nom_fr: string; nom_en: string; nom_ar: string }): string {
        const lang = this.translate.currentLang();
        if (lang === 'en') return pt.nom_en;
        if (lang === 'ar') return pt.nom_ar;
        return pt.nom_fr;
    }

    search(): void {
        const term = this.searchTerm.trim();
        this.errorMsg = '';
        this.expandedModelId = null;
        this.parts = [];
        if (term.length < 2) {
            this.results = [];
            this.searched = false;
            return;
        }
        this.searching = true;
        this.searched = true;
        this.compatService.search(term).subscribe({
            next: (data) => { this.results = data; this.searching = false; },
            error: (err) => {
                this.searching = false;
                this.errorMsg = err.error?.message || 'COMPATIBILITE.ERR_SEARCH';
            }
        });
    }

    toggleModel(result: SearchResult): void {
        if (this.expandedModelId === result.id_model) {
            this.expandedModelId = null;
            this.parts = [];
            return;
        }
        this.expandedModelId = result.id_model;
        this.parts = [];
        this.partsLoading = true;
        this.compatService.partsForModel(result.id_model).subscribe({
            next: (data) => { this.parts = data; this.partsLoading = false; },
            error: (err) => {
                this.partsLoading = false;
                this.errorMsg = err.error?.message || 'COMPATIBILITE.ERR_LOAD_PARTS';
            }
        });
    }
}
