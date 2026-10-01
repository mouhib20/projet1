import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CompatService } from '../../services/compat.service';
import { AuthService } from '../../services/auth.service';
import { articleImageUrl } from '../../services/article.service';
import { PosBridgeService } from '../../services/pos-bridge.service';
import { Brand, DeviceModel, PartType, CompatGroupStatut } from '../../models/compat.model';

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
    marque: string | null;
    modele: string | null;
    statut: CompatGroupStatut;
}

/** A device in the "compatible devices" grid, with its OWN stock - which may come from a
 *  DIFFERENT group than the one being displayed, since a device can be a member of more than one
 *  group of the same part type (its own native part, plus another device's part it also accepts). */
interface CompatibleDevice extends DeviceModel {
    id_article: number | null;
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

    // ── Result: EVERY part matching the chosen type, once a model is picked - a device can now
    // belong to more than one group of the same part type (its own native part, plus another
    // device's part that also happens to fit it), so this is a list, not a single match - plus
    // every other device that shares any of those same parts (compat_group), combined ──
    partsLoading = false;
    matchedParts: PartRow[] = [];
    devicesLoading = false;
    compatibleDevices: CompatibleDevice[] = [];
    searched = false;
    availableOnly = false;

    get visibleParts(): PartRow[] {
        return this.availableOnly ? this.matchedParts.filter(p => p.id_article) : this.matchedParts;
    }

    get totalInStock(): number {
        return this.matchedParts.filter(p => p.id_article).reduce((sum, p) => sum + (p.quantite ?? 0), 0);
    }

    get modelsInStock(): number {
        return this.matchedParts.filter(p => p.id_article).length;
    }

    showSuggestForm = false;
    suggestionText = '';
    suggesting = false;
    suggestSuccess = false;
    suggestError = '';

    constructor(
        private compatService: CompatService,
        public auth: AuthService,
        private translate: TranslateService,
        private router: Router,
        private posBridge: PosBridgeService,
    ) { }

    /** "Add to sale": hands the article id off via the shared bridge service and leaves Operations
     *  to resolve it against its own already-loaded article list once there - only the id travels,
     *  so a stale/short-lived copy of the article never gets added. Shared by the main parts table
     *  and the compatible-devices grid, so it takes the article id directly rather than a PartRow. */
    addToSale(item: { id_article: number | null }): void {
        if (!item.id_article) return;
        this.posBridge.sendArticleToSale(item.id_article);
        this.router.navigate(['/vente/operations']);
    }

    /** "Use in repair": same handoff, but Reparation opens a fresh ticket with the part already
     *  added, leaving client selection to the user. */
    useInRepair(item: { id_article: number | null }): void {
        if (!item.id_article) return;
        this.posBridge.sendArticleToRepair(item.id_article);
        this.router.navigate(['/reparation']);
    }

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
                this.matchedParts = data
                    .filter(p => p.id_part_type === this.selectedPartTypeId)
                    // Stocked first (most qty first among those), so what's actually usable right
                    // now doesn't get buried under "Not stocked" rows.
                    .sort((a, b) => {
                        if (!!a.id_article !== !!b.id_article) return a.id_article ? -1 : 1;
                        return (b.quantite ?? 0) - (a.quantite ?? 0);
                    });
                this.partsLoading = false;
                if (this.matchedParts.length) this.loadCompatibleDevices(this.matchedParts.map(p => p.id_group));
            },
            error: (err) => {
                this.partsLoading = false;
                this.errorMsg = err.error?.message || 'COMPATIBILITE.ERR_LOAD_PARTS';
            }
        });
    }

    /** Combines every matched group's devices into one deduped list - a device compatible via
     *  more than one of the matched groups still only shows once. */
    private loadCompatibleDevices(idGroups: number[]): void {
        this.devicesLoading = true;
        let remaining = idGroups.length;
        const parDevice = new Map<number, CompatibleDevice>();
        idGroups.forEach((idGroup) => {
            this.compatService.getModelsForGroup(idGroup).subscribe({
                next: (data) => {
                    // Backend now always includes id_article/quantite/prix_vente for this
                    // endpoint - DeviceModel itself doesn't declare them since stock.component's
                    // own use of this same call doesn't need them.
                    (data as CompatibleDevice[]).forEach((d) => parDevice.set(d.id, d));
                    if (--remaining === 0) {
                        this.compatibleDevices = [...parDevice.values()];
                        this.devicesLoading = false;
                    }
                },
                error: (err) => {
                    this.devicesLoading = false;
                    this.errorMsg = err.error?.message || 'COMPATIBILITE.ERR_LOAD_PARTS';
                }
            });
        });
    }

    private resetResult(): void {
        this.matchedParts = [];
        this.compatibleDevices = [];
        this.searched = false;
        this.availableOnly = false;
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
