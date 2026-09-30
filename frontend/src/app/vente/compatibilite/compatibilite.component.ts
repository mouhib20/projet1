import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CompatService } from '../../services/compat.service';
import { AuthService } from '../../services/auth.service';
import { articleImageUrl } from '../../services/article.service';
import { Brand, DeviceModel, PartType } from '../../models/compat.model';

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
export class CompatibiliteComponent implements OnInit {
    errorMsg = '';

    // ── Step 1/2/3: part type -> brand -> model ──
    partTypes: PartType[] = [];
    brands: Brand[] = [];
    models: DeviceModel[] = [];

    selectedPartTypeId: number | null = null;
    selectedBrandId: number | null = null;
    selectedModelId: number | null = null;

    modelsLoading = false;

    // ── Visual pickers: brand/model are chosen from a modal grid (logo/photo cards), not a <select> ──
    showBrandPicker = false;
    showModelPicker = false;
    brandSearchTerm = '';
    modelSearchTerm = '';

    get filteredBrands(): Brand[] {
        if (!this.brandSearchTerm.trim()) return this.brands;
        const term = this.brandSearchTerm.toLowerCase();
        return this.brands.filter(b => b.nom.toLowerCase().includes(term));
    }

    get filteredModelsForPicker(): DeviceModel[] {
        if (!this.modelSearchTerm.trim()) return this.models;
        const term = this.modelSearchTerm.toLowerCase();
        return this.models.filter(m =>
            m.nom.toLowerCase().includes(term) || (m.code || '').toLowerCase().includes(term) || (m.nom_commercial || '').toLowerCase().includes(term)
        );
    }

    openBrandPicker(): void {
        if (!this.selectedPartTypeId) return;
        this.brandSearchTerm = '';
        this.showBrandPicker = true;
    }

    closeBrandPicker(): void {
        this.showBrandPicker = false;
    }

    selectBrand(brand: Brand): void {
        this.selectedBrandId = brand.id;
        this.showBrandPicker = false;
        this.onBrandChange();
    }

    openModelPicker(): void {
        if (!this.selectedBrandId || this.modelsLoading) return;
        this.modelSearchTerm = '';
        this.showModelPicker = true;
    }

    closeModelPicker(): void {
        this.showModelPicker = false;
    }

    selectModelFromPicker(model: DeviceModel): void {
        this.selectedModelId = model.id;
        this.showModelPicker = false;
        this.onModelChange();
    }

    imageUrl(image?: string | null): string | null {
        return articleImageUrl(image);
    }

    // ── Result: the part matching the chosen type, once a model is picked - plus every other
    // device that shares that exact same part (compat_group) ──
    partsLoading = false;
    matchedPart: PartRow | null = null;
    devicesLoading = false;
    compatibleDevices: DeviceModel[] = [];
    searched = false;

    showSuggestForm = false;
    suggestionText = '';
    suggesting = false;
    suggestSuccess = false;
    suggestError = '';

    constructor(
        private compatService: CompatService,
        public auth: AuthService,
        private translate: TranslateService,
    ) { }

    ngOnInit(): void {
        this.compatService.getPartTypesForSearch().subscribe({
            next: (data) => { this.partTypes = data; },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPATIBILITE.ERR_SEARCH'; }
        });
        this.compatService.getBrandsForSearch().subscribe({
            next: (data) => { this.brands = data; },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPATIBILITE.ERR_SEARCH'; }
        });
    }

    partTypeName(pt: { nom_fr: string; nom_en: string; nom_ar: string }): string {
        const lang = this.translate.currentLang();
        if (lang === 'en') return pt.nom_en;
        if (lang === 'ar') return pt.nom_ar;
        return pt.nom_fr;
    }

    get selectedPartType(): PartType | undefined {
        return this.partTypes.find(t => t.id === this.selectedPartTypeId);
    }

    get selectedBrand(): Brand | undefined {
        return this.brands.find(b => b.id === this.selectedBrandId);
    }

    get selectedModel(): DeviceModel | undefined {
        return this.models.find(m => m.id === this.selectedModelId);
    }

    onPartTypeChange(): void {
        this.resetResult();
    }

    onBrandChange(): void {
        this.models = [];
        this.selectedModelId = null;
        this.resetResult();
        if (!this.selectedBrandId) return;
        this.modelsLoading = true;
        this.compatService.getModelsForSearch(this.selectedBrandId).subscribe({
            next: (data) => { this.models = data; this.modelsLoading = false; },
            error: (err) => {
                this.modelsLoading = false;
                this.errorMsg = err.error?.message || 'COMPATIBILITE.ERR_SEARCH';
            }
        });
    }

    onModelChange(): void {
        this.resetResult();
        if (!this.selectedModelId || !this.selectedPartTypeId) return;
        this.errorMsg = '';
        this.searched = true;
        this.partsLoading = true;
        this.compatService.partsForModel(this.selectedModelId).subscribe({
            next: (data: PartRow[]) => {
                this.matchedPart = data.find(p => p.id_part_type === this.selectedPartTypeId) || null;
                this.partsLoading = false;
                if (this.matchedPart) this.loadCompatibleDevices(this.matchedPart.id_group);
            },
            error: (err) => {
                this.partsLoading = false;
                this.errorMsg = err.error?.message || 'COMPATIBILITE.ERR_LOAD_PARTS';
            }
        });
    }

    private loadCompatibleDevices(idGroup: number): void {
        this.devicesLoading = true;
        this.compatService.getModelsForGroup(idGroup).subscribe({
            next: (data) => { this.compatibleDevices = data; this.devicesLoading = false; },
            error: (err) => {
                this.devicesLoading = false;
                this.errorMsg = err.error?.message || 'COMPATIBILITE.ERR_LOAD_PARTS';
            }
        });
    }

    private resetResult(): void {
        this.matchedPart = null;
        this.compatibleDevices = [];
        this.searched = false;
        this.showSuggestForm = false;
        this.suggestSuccess = false;
    }

    openSuggestForm(): void {
        this.showSuggestForm = true;
        this.suggestSuccess = false;
        this.suggestError = '';
        if (!this.suggestionText.trim()) {
            const parts = [this.selectedBrand?.nom, this.selectedModel?.nom, this.selectedPartType && this.partTypeName(this.selectedPartType)].filter(Boolean);
            this.suggestionText = parts.join(' — ');
        }
    }

    cancelSuggestForm(): void {
        this.showSuggestForm = false;
    }

    submitSuggestion(): void {
        if (this.suggesting) return;
        const texte = this.suggestionText.trim();
        if (!texte) { this.suggestError = 'COMPATIBILITE.ERR_SUGGESTION_REQUIRED'; return; }
        this.suggesting = true;
        this.suggestError = '';
        this.compatService.createSuggestion({
            texte_libre: texte,
            id_model: this.selectedModelId ?? undefined,
            id_part_type: this.selectedPartTypeId ?? undefined,
        }).subscribe({
            next: () => {
                this.suggesting = false;
                this.suggestSuccess = true;
                this.showSuggestForm = false;
                this.suggestionText = '';
            },
            error: (err) => {
                this.suggesting = false;
                this.suggestError = err.error?.message || 'COMPATIBILITE.ERR_SUGGESTION_SAVE';
            }
        });
    }
}
