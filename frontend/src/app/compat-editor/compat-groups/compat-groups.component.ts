import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CompatService } from '../../services/compat.service';
import { AuthService } from '../../services/auth.service';
import { articleImageUrl } from '../../services/article.service';
import { Brand, DeviceModel, PartType, CompatGroupListItem } from '../../models/compat.model';

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
    form: { id_part_type: number | null; modeleIds: number[]; note: string } = this.emptyForm();
    modelSearchTerm = '';

    // ── Part type: search box + dropdown, auto-offers to create when nothing matches ──
    partTypeSearchTerm = '';
    showPartTypeDropdown = false;
    showNewPartType = false;
    newPartType = { nom_fr: '', nom_en: '', nom_ar: '' };

    get filteredPartTypes(): PartType[] {
        if (!this.partTypeSearchTerm.trim()) return this.partTypes;
        const term = this.partTypeSearchTerm.toLowerCase();
        return this.partTypes.filter(t => this.partTypeName(t).toLowerCase().includes(term));
    }

    get selectedPartType(): PartType | undefined {
        return this.partTypes.find(t => t.id === this.form.id_part_type);
    }

    selectPartType(pt: PartType): void {
        this.form.id_part_type = pt.id;
        this.partTypeSearchTerm = '';
        this.showPartTypeDropdown = false;
        this.showNewPartType = false;
    }

    clearPartType(): void {
        this.form.id_part_type = null;
        this.partTypeSearchTerm = '';
    }

    /** Delayed so a (mousedown) selection inside the dropdown still registers before it closes. */
    closePartTypeDropdown(): void {
        setTimeout(() => this.showPartTypeDropdown = false, 200);
    }

    openAddPartTypeFromSearch(): void {
        this.newPartType = { nom_fr: this.partTypeSearchTerm.trim(), nom_en: '', nom_ar: '' };
        this.showNewPartType = true;
    }

    showNewBrand = false;
    newBrand = { nom: '' };

    // ── Brand: a dedicated search box that also narrows the model list below it ──
    groupBrandFilterId: number | null = null;
    groupBrandSearchTerm = '';
    showGroupBrandDropdown = false;

    get filteredBrandsForGroupFilter(): Brand[] {
        if (!this.groupBrandSearchTerm.trim()) return this.brands;
        const term = this.groupBrandSearchTerm.toLowerCase();
        return this.brands.filter(b => b.nom.toLowerCase().includes(term));
    }

    get selectedGroupBrandFilter(): Brand | undefined {
        return this.brands.find(b => b.id === this.groupBrandFilterId);
    }

    selectGroupBrandFilter(b: Brand): void {
        this.groupBrandFilterId = b.id;
        this.groupBrandSearchTerm = '';
        this.showGroupBrandDropdown = false;
        this.showNewBrand = false;
    }

    clearGroupBrandFilter(): void {
        this.groupBrandFilterId = null;
        this.groupBrandSearchTerm = '';
    }

    closeGroupBrandDropdown(): void {
        setTimeout(() => this.showGroupBrandDropdown = false, 200);
    }

    /** Which combobox opened the "add brand" mini-form - decides where addBrand() assigns the result. */
    newBrandContext: 'group' | 'model' = 'group';

    openAddBrandFromGroupFilter(): void {
        this.newBrand = { nom: this.groupBrandSearchTerm.trim() };
        this.newBrandContext = 'group';
        this.showNewBrand = true;
    }

    // ── Brand nested inside "add model": same search-or-create pattern, used only when no
    // brand filter is selected above (otherwise the filter's brand is reused automatically) ──
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
        this.newBrandContext = 'model';
        this.showNewBrand = true;
    }

    showNewModel = false;
    newModel: { id_brand: number | null; nom: string; nom_commercial: string; code: string; image?: string } = { id_brand: null, nom: '', nom_commercial: '', code: '', image: undefined };
    newModelImageUploading = false;
    newModelImageError = '';

    openAddModelFromSearch(): void {
        // Reuse the brand filter above, if one is set - no need to pick it again for the new model.
        this.newModel = { id_brand: this.groupBrandFilterId, nom: this.modelSearchTerm.trim(), nom_commercial: '', code: '', image: undefined };
        this.newModelBrandSearchTerm = '';
        this.showNewModel = true;
    }

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
        return { id_part_type: null as number | null, modeleIds: [] as number[], note: '' };
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

    /** Deliberately NOT filtered by groupBrandFilterId - a group can (and often does) link models
     *  across different brands (e.g. a glass that fits several manufacturers' phones). The brand
     *  field above is only a convenience default for the "add new model" form below. */
    get filteredModels(): DeviceModel[] {
        if (!this.modelSearchTerm) return this.models;
        const term = this.modelSearchTerm.toLowerCase();
        return this.models.filter(m =>
            m.nom.toLowerCase().includes(term) ||
            m.marque.toLowerCase().includes(term) ||
            (m.code || '').toLowerCase().includes(term)
        );
    }

    /** Search found nothing - offer to create it right here, instead of a separate manual button. */
    get showAddModelPrompt(): boolean {
        return this.modelSearchTerm.trim().length > 0 && this.filteredModels.length === 0 && !this.showNewModel;
    }

    clearMessages(): void {
        this.errorMsg = '';
        this.successMsg = '';
    }

    private resetInlineCreateState(): void {
        this.partTypeSearchTerm = '';
        this.showPartTypeDropdown = false;
        this.showNewPartType = false;
        this.newPartType = { nom_fr: '', nom_en: '', nom_ar: '' };
        this.showNewBrand = false;
        this.newBrand = { nom: '' };
        this.groupBrandFilterId = null;
        this.groupBrandSearchTerm = '';
        this.showGroupBrandDropdown = false;
        this.newModelBrandSearchTerm = '';
        this.showNewModelBrandDropdown = false;
        this.showNewModel = false;
        this.newModel = { id_brand: null, nom: '', nom_commercial: '', code: '', image: undefined };
    }

    openAddForm(): void {
        this.editingId = null;
        this.form = this.emptyForm();
        this.modelSearchTerm = '';
        this.resetInlineCreateState();
        this.showForm = true;
        this.clearMessages();
    }

    openEditForm(group: CompatGroupListItem): void {
        this.clearMessages();
        this.compatService.getGroup(group.id).subscribe({
            next: (detail) => {
                this.editingId = detail.id;
                this.form = { id_part_type: detail.id_part_type, modeleIds: [...detail.modeleIds], note: detail.note || '' };
                this.modelSearchTerm = '';
                this.resetInlineCreateState();
                this.showForm = true;
            },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_GROUPS.ERR_LOAD'; }
        });
    }

    cancelForm(): void {
        this.showForm = false;
    }

    isModelSelected(id: number): boolean {
        return this.form.modeleIds.includes(id);
    }

    toggleModel(id: number): void {
        const idx = this.form.modeleIds.indexOf(id);
        if (idx >= 0) this.form.modeleIds.splice(idx, 1);
        else this.form.modeleIds.push(id);
    }

    save(): void {
        if (this.saving) return;
        if (!this.form.id_part_type) { this.errorMsg = 'COMPAT_GROUPS.ERR_PART_TYPE_REQUIRED'; return; }
        if (this.form.modeleIds.length === 0) { this.errorMsg = 'COMPAT_GROUPS.ERR_MODELS_REQUIRED'; return; }

        this.clearMessages();
        this.saving = true;
        const dto = { id_part_type: this.form.id_part_type, modeleIds: this.form.modeleIds, note: this.form.note?.trim() || undefined };

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
                // whatever the user does next (e.g. submitting the group right away).
                this.partTypes = [...this.partTypes, { id: res.id, nom_fr: dto.nom_fr, nom_en: dto.nom_en, nom_ar: dto.nom_ar, categorie: 'part' }];
                this.form.id_part_type = res.id;
                this.newPartType = { nom_fr: '', nom_en: '', nom_ar: '' };
                this.showNewPartType = false;
            },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_GROUPS.ERR_CREATE'; }
        });
    }

    addBrand(): void {
        if (!this.newBrand.nom.trim()) { this.errorMsg = 'COMPAT_GROUPS.ERR_BRAND_NAME_REQUIRED'; return; }
        const nom = this.newBrand.nom.trim();
        this.compatService.createBrand({ nom }).subscribe({
            next: (res) => {
                this.brands = [...this.brands, { id: res.id, nom, logo: null }];
                if (this.newBrandContext === 'group') {
                    this.groupBrandFilterId = res.id;
                    this.groupBrandSearchTerm = '';
                } else {
                    this.newModel.id_brand = res.id;
                    this.newModelBrandSearchTerm = '';
                }
                this.newBrand = { nom: '' };
                this.showNewBrand = false;
            },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_GROUPS.ERR_CREATE'; }
        });
    }

    addModel(): void {
        if (!this.newModel.id_brand) { this.errorMsg = 'COMPAT_GROUPS.ERR_MODEL_BRAND_REQUIRED'; return; }
        if (!this.newModel.nom.trim()) { this.errorMsg = 'COMPAT_GROUPS.ERR_MODEL_NAME_REQUIRED'; return; }
        const idBrand = this.newModel.id_brand;
        const nom = this.newModel.nom.trim();
        const nomCommercial = this.newModel.nom_commercial?.trim() || undefined;
        const code = this.newModel.code?.trim() || undefined;
        const image = this.newModel.image;
        this.compatService.createModel({ id_brand: idBrand, nom, nom_commercial: nomCommercial, code, image }).subscribe({
            next: (res) => {
                const brand = this.brands.find(b => b.id === idBrand);
                this.models = [...this.models, { id: res.id, nom, nom_commercial: nomCommercial ?? null, code: code ?? null, image: image ?? null, id_brand: idBrand, marque: brand?.nom || '' }];
                this.form.modeleIds.push(res.id); // select it immediately, no wait on a refetch
                this.modelSearchTerm = '';
                this.newModel = { id_brand: null, nom: '', nom_commercial: '', code: '', image: undefined };
                this.newModelBrandSearchTerm = '';
                this.showNewModel = false;
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
