import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CompatService } from '../../services/compat.service';
import { AuthService } from '../../services/auth.service';
import { articleImageUrl } from '../../services/article.service';
import { Brand, DeviceModel, PartType, CompatGroupListItem, CompatGroupStatut } from '../../models/compat.model';

@Component({
    selector: 'app-compat-groups',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './compat-groups.component.html',
    styleUrls: ['./compat-groups.component.css']
})
export class CompatGroupsComponent implements OnInit {
    groups: CompatGroupListItem[] = [];
    partTypes: PartType[] = [];
    brands: Brand[] = [];
    models: DeviceModel[] = [];

    loading = false;
    errorMsg = '';
    successMsg = '';

    showForm = false;
    editingId: number | null = null;
    saving = false;
    /** modeleIds here is the "also fits" list only - the base model is tracked separately and
     *  never duplicated into it (the backend adds it to compat_group_model on save either way). */
    form: { id_part_type: number | null; id_base_model: number | null; modeleIds: number[]; note: string; statut: CompatGroupStatut } = this.emptyForm();

    // ── Part type: a row of pills (one tap to pick), "+" opens the same add-new-type mini form ──
    showNewPartType = false;
    newPartType = { nom_fr: '', nom_en: '', nom_ar: '' };

    get selectedPartType(): PartType | undefined {
        return this.partTypes.find(t => t.id === this.form.id_part_type);
    }

    selectPartTypePill(pt: PartType): void {
        this.form.id_part_type = pt.id;
    }

    openAddPartType(): void {
        this.newPartType = { nom_fr: '', nom_en: '', nom_ar: '' };
        this.showNewPartType = true;
    }

    // ── Brand: search-or-create, used only while adding a brand-new model (base or compatible) ──
    showNewBrand = false;
    newBrand = { nom: '' };
    newModelBrandSearchTerm = '';
    showNewModelBrandDropdown = false;

    get filteredBrandsForNewModel(): Brand[] {
        if (!this.newModelBrandSearchTerm.trim()) return this.brands;
        const term = this.newModelBrandSearchTerm.toLowerCase();
        return this.brands.filter(b => b.nom.toLowerCase().includes(term));
    }

    get newModelSelectedBrand(): Brand | undefined {
        return this.brands.find(b => b.id === this.newModel.id_brand);
    }

    selectBrandForNewModel(b: Brand): void {
        this.newModel.id_brand = b.id;
        this.newModelBrandSearchTerm = '';
        this.showNewModelBrandDropdown = false;
        this.showNewBrand = false;
    }

    clearNewModelBrand(): void {
        this.newModel.id_brand = null;
        this.newModelBrandSearchTerm = '';
    }

    closeNewModelBrandDropdown(): void {
        setTimeout(() => this.showNewModelBrandDropdown = false, 200);
    }

    openAddBrandFromSearch(): void {
        this.newBrand = { nom: this.newModelBrandSearchTerm.trim() };
        this.showNewBrand = true;
    }

    addBrand(): void {
        if (!this.newBrand.nom.trim()) { this.errorMsg = 'COMPAT_GROUPS.ERR_BRAND_NAME_REQUIRED'; return; }
        const nom = this.newBrand.nom.trim();
        this.compatService.createBrand({ nom }).subscribe({
            next: (res) => {
                // The backend dedups case/whitespace-insensitively and may hand back an existing
                // id instead of a new one - skip the push then, or it renders as a duplicate.
                if (!this.brands.some(b => b.id === res.id)) {
                    this.brands = [...this.brands, { id: res.id, nom, logo: null }];
                }
                this.newModel.id_brand = res.id;
                this.newModelBrandSearchTerm = '';
                this.newBrand = { nom: '' };
                this.showNewBrand = false;
            },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_GROUPS.ERR_CREATE'; }
        });
    }

    // ── New model mini-form: shared by both the base-model picker and the compatible-models
    // search - newModelContext decides where the created model ends up. ──
    showNewModel = false;
    newModelContext: 'base' | 'compatible' = 'compatible';
    newModel: { id_brand: number | null; nom: string; nom_commercial: string; code: string; image?: string } = { id_brand: null, nom: '', nom_commercial: '', code: '', image: undefined };
    newModelImageUploading = false;
    newModelImageError = '';

    onNewModelImageSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        this.newModelImageError = '';
        this.newModelImageUploading = true;
        this.compatService.uploadModelImage(file).subscribe({
            next: (res) => {
                this.newModel.image = res.url;
                this.newModelImageUploading = false;
            },
            error: (err) => {
                this.newModelImageError = err.error?.message || 'COMPAT_GROUPS.ERR_IMAGE_UPLOAD';
                this.newModelImageUploading = false;
            }
        });
        input.value = '';
    }

    removeNewModelImage(): void {
        this.newModel.image = undefined;
    }

    addModel(): void {
        if (!this.newModel.id_brand) { this.errorMsg = 'COMPAT_GROUPS.ERR_MODEL_BRAND_REQUIRED'; return; }
        if (!this.newModel.nom.trim()) { this.errorMsg = 'COMPAT_GROUPS.ERR_MODEL_NAME_REQUIRED'; return; }
        const idBrand = this.newModel.id_brand;
        const nom = this.newModel.nom.trim();
        const nomCommercial = this.newModel.nom_commercial?.trim() || undefined;
        const code = this.newModel.code?.trim() || undefined;
        const image = this.newModel.image;
        const context = this.newModelContext;
        this.compatService.createModel({ id_brand: idBrand, nom, nom_commercial: nomCommercial, code, image }).subscribe({
            next: (res) => {
                const brand = this.brands.find(b => b.id === idBrand);
                // Same dedup caveat as addBrand()/addPartType(): a reused existing model must not
                // also render as a second entry.
                if (!this.models.some(m => m.id === res.id)) {
                    this.models = [...this.models, { id: res.id, nom, nom_commercial: nomCommercial ?? null, code: code ?? null, image: image ?? null, id_brand: idBrand, marque: brand?.nom || '' }];
                }
                if (context === 'base') {
                    this.selectBaseModel({ id: res.id } as DeviceModel);
                } else {
                    this.addCompatibleModel({ id: res.id } as DeviceModel);
                }
                this.modelSearchTerm = '';
                this.baseModelSearchTerm = '';
                this.newModel = { id_brand: null, nom: '', nom_commercial: '', code: '', image: undefined };
                this.newModelBrandSearchTerm = '';
                this.showNewModel = false;
            },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_GROUPS.ERR_CREATE'; }
        });
    }

    // ── Base model ("the part's original device"): single pick, shown as a card once chosen ──
    baseModelSearchTerm = '';
    showBaseModelDropdown = false;

    get selectedBaseModelObj(): DeviceModel | undefined {
        return this.models.find(m => m.id === this.form.id_base_model);
    }

    get filteredModelsForBase(): DeviceModel[] {
        if (!this.baseModelSearchTerm.trim()) return [];
        const term = this.baseModelSearchTerm.toLowerCase();
        return this.models.filter(m =>
            m.nom.toLowerCase().includes(term) ||
            m.marque.toLowerCase().includes(term) ||
            (m.code || '').toLowerCase().includes(term)
        );
    }

    get showAddBaseModelPrompt(): boolean {
        return this.baseModelSearchTerm.trim().length > 0 && this.filteredModelsForBase.length === 0 && !this.showNewModel;
    }

    openBaseModelPicker(): void {
        this.baseModelSearchTerm = '';
        this.showBaseModelDropdown = true;
    }

    closeBaseModelDropdown(): void {
        setTimeout(() => this.showBaseModelDropdown = false, 200);
    }

    selectBaseModel(m: DeviceModel): void {
        this.form.id_base_model = m.id;
        // The base can't also sit in the "also fits" list.
        const idx = this.form.modeleIds.indexOf(m.id);
        if (idx >= 0) this.form.modeleIds.splice(idx, 1);
        this.baseModelSearchTerm = '';
        this.showBaseModelDropdown = false;
    }

    openAddModelForBase(): void {
        this.newModel = { id_brand: null, nom: this.baseModelSearchTerm.trim(), nom_commercial: '', code: '', image: undefined };
        this.newModelContext = 'base';
        this.newModelBrandSearchTerm = '';
        this.showNewModel = true;
    }

    // ── Compatible models ("also fits on"): search-to-add, shown as removable chips ──
    modelSearchTerm = '';
    showModelSearchDropdown = false;

    /** Excludes the base model (can't also be "compatible") and anything already added. */
    get filteredModelsForCompatible(): DeviceModel[] {
        if (!this.modelSearchTerm.trim()) return [];
        const term = this.modelSearchTerm.toLowerCase();
        return this.models.filter(m =>
            m.id !== this.form.id_base_model &&
            !this.form.modeleIds.includes(m.id) &&
            (m.nom.toLowerCase().includes(term) || m.marque.toLowerCase().includes(term) || (m.code || '').toLowerCase().includes(term))
        );
    }

    get showAddModelPrompt(): boolean {
        return this.modelSearchTerm.trim().length > 0 && this.filteredModelsForCompatible.length === 0 && !this.showNewModel;
    }

    closeModelSearchDropdown(): void {
        setTimeout(() => this.showModelSearchDropdown = false, 200);
    }

    addCompatibleModel(m: DeviceModel): void {
        if (m.id === this.form.id_base_model) return;
        if (!this.form.modeleIds.includes(m.id)) this.form.modeleIds.push(m.id);
        this.modelSearchTerm = '';
        this.showModelSearchDropdown = false;
    }

    removeCompatibleModel(id: number): void {
        const idx = this.form.modeleIds.indexOf(id);
        if (idx >= 0) this.form.modeleIds.splice(idx, 1);
    }

    openAddModelFromSearch(): void {
        this.newModel = { id_brand: null, nom: this.modelSearchTerm.trim(), nom_commercial: '', code: '', image: undefined };
        this.newModelContext = 'compatible';
        this.newModelBrandSearchTerm = '';
        this.showNewModel = true;
    }

    modelLabel(id: number): string {
        const m = this.models.find(x => x.id === id);
        if (!m) return '';
        return m.code ? `${m.marque} ${m.nom} · ${m.code}` : `${m.marque} ${m.nom}`;
    }

    // ── Per-model photo upload, offered on each search result row ──
    modelImageUploadingId: number | null = null;
    modelImageError = '';

    onModelImageSelected(event: Event, model: DeviceModel): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        this.modelImageError = '';
        this.modelImageUploadingId = model.id;
        this.compatService.uploadModelImage(file).subscribe({
            next: (res) => {
                this.compatService.updateModel(model.id, { image: res.url }).subscribe({
                    next: () => {
                        model.image = res.url; // update in place - it's the same object reference in `models`
                        this.modelImageUploadingId = null;
                    },
                    error: (err) => {
                        this.modelImageError = err.error?.message || 'COMPAT_GROUPS.ERR_IMAGE_UPLOAD';
                        this.modelImageUploadingId = null;
                    }
                });
            },
            error: (err) => {
                this.modelImageError = err.error?.message || 'COMPAT_GROUPS.ERR_IMAGE_UPLOAD';
                this.modelImageUploadingId = null;
            }
        });
        input.value = '';
    }

    constructor(
        private compatService: CompatService,
        public auth: AuthService,
        private translate: TranslateService,
        private router: Router,
    ) { }

    ngOnInit(): void {
        this.loadAll();
    }

    emptyForm() {
        return { id_part_type: null as number | null, id_base_model: null as number | null, modeleIds: [] as number[], note: '', statut: 'confirmed' as CompatGroupStatut };
    }

    loadAll(): void {
        this.loading = true;
        this.compatService.getGroups().subscribe({
            next: (data) => { this.groups = data; this.loading = false; },
            error: () => { this.errorMsg = 'COMPAT_GROUPS.ERR_LOAD'; this.loading = false; }
        });
        this.compatService.getPartTypes().subscribe({ next: (d) => this.partTypes = d });
        this.compatService.getBrands().subscribe({ next: (d) => this.brands = d });
        this.compatService.getModels().subscribe({ next: (d) => this.models = d });
    }

    partTypeName(pt: { nom_fr: string; nom_en: string; nom_ar: string }): string {
        const lang = this.translate.currentLang();
        if (lang === 'en') return pt.nom_en;
        if (lang === 'ar') return pt.nom_ar;
        return pt.nom_fr;
    }

    imageUrl(image?: string | null): string | null {
        return articleImageUrl(image);
    }

    clearMessages(): void {
        this.errorMsg = '';
        this.successMsg = '';
    }

    private resetInlineCreateState(): void {
        this.showNewPartType = false;
        this.newPartType = { nom_fr: '', nom_en: '', nom_ar: '' };
        this.showNewBrand = false;
        this.newBrand = { nom: '' };
        this.newModelBrandSearchTerm = '';
        this.showNewModelBrandDropdown = false;
        this.showNewModel = false;
        this.newModel = { id_brand: null, nom: '', nom_commercial: '', code: '', image: undefined };
        this.baseModelSearchTerm = '';
        this.showBaseModelDropdown = false;
        this.modelSearchTerm = '';
        this.showModelSearchDropdown = false;
    }

    openAddForm(): void {
        this.editingId = null;
        this.form = this.emptyForm();
        this.resetInlineCreateState();
        this.showForm = true;
        this.clearMessages();
    }

    openEditForm(group: CompatGroupListItem): void {
        this.clearMessages();
        this.compatService.getGroup(group.id).subscribe({
            next: (detail) => {
                this.editingId = detail.id;
                const modeleIds = detail.modeleIds.filter(id => id !== detail.id_base_model);
                this.form = { id_part_type: detail.id_part_type, id_base_model: detail.id_base_model, modeleIds, note: detail.note || '', statut: detail.statut || 'confirmed' };
                this.resetInlineCreateState();
                this.showForm = true;
            },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_GROUPS.ERR_LOAD'; }
        });
    }

    cancelForm(): void {
        this.showForm = false;
    }

    save(): void {
        if (this.saving) return;
        if (!this.form.id_part_type) { this.errorMsg = 'COMPAT_GROUPS.ERR_PART_TYPE_REQUIRED'; return; }
        if (!this.form.id_base_model) { this.errorMsg = 'COMPAT_GROUPS.ERR_BASE_MODEL_REQUIRED'; return; }

        this.clearMessages();
        this.saving = true;
        const dto = {
            id_part_type: this.form.id_part_type,
            id_base_model: this.form.id_base_model,
            modeleIds: this.form.modeleIds,
            note: this.form.note?.trim() || undefined,
            statut: this.form.statut,
        };

        const onDone = (): void => {
            this.saving = false;
            this.successMsg = this.editingId ? 'COMPAT_GROUPS.SUCCESS_UPDATE' : 'COMPAT_GROUPS.SUCCESS_CREATE';
            this.showForm = false;
            this.loadAll();
        };
        const onError = (err: any): void => {
            this.saving = false;
            this.errorMsg = err.error?.message || 'COMPAT_GROUPS.ERR_SAVE';
        };

        if (this.editingId) {
            this.compatService.updateGroup(this.editingId, dto).subscribe({ next: onDone, error: onError });
        } else {
            this.compatService.createGroup(dto).subscribe({ next: onDone, error: onError });
        }
    }

    deleteGroup(group: CompatGroupListItem): void {
        if (!confirm(this.translate.instant('COMPAT_GROUPS.CONFIRM_DELETE'))) return;
        this.compatService.deleteGroup(group.id).subscribe({
            next: () => { this.successMsg = 'COMPAT_GROUPS.SUCCESS_DELETE'; this.loadAll(); },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_GROUPS.ERR_DELETE'; }
        });
    }

    // ── Inline creation of reference data ──

    addPartType(): void {
        if (!this.newPartType.nom_fr.trim() || !this.newPartType.nom_en.trim() || !this.newPartType.nom_ar.trim()) {
            this.errorMsg = 'COMPAT_GROUPS.ERR_PART_TYPE_LANGS_REQUIRED';
            return;
        }
        const dto = { ...this.newPartType };
        this.compatService.createPartType(dto).subscribe({
            next: (res) => {
                // Add locally instead of refetching: avoids a second round-trip racing with
                // whatever the user does next (e.g. submitting the group right away). The backend
                // dedups case/whitespace-insensitively and may hand back an EXISTING id instead of
                // a new one - skip the push then, or the reused pill renders twice.
                if (!this.partTypes.some(t => t.id === res.id)) {
                    this.partTypes = [...this.partTypes, { id: res.id, nom_fr: dto.nom_fr, nom_en: dto.nom_en, nom_ar: dto.nom_ar, categorie: 'part' }];
                }
                this.form.id_part_type = res.id;
                this.newPartType = { nom_fr: '', nom_en: '', nom_ar: '' };
                this.showNewPartType = false;
            },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_GROUPS.ERR_CREATE'; }
        });
    }

    goToSuggestions(): void {
        this.router.navigate(['/compat-editor/suggestions']);
    }

    logout(): void {
        this.auth.logout();
    }
}
