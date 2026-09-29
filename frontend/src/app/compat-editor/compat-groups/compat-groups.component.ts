import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CompatService } from '../../services/compat.service';
import { AuthService } from '../../services/auth.service';
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

    showNewPartType = false;
    newPartType = { nom_fr: '', nom_en: '', nom_ar: '' };

    showNewBrand = false;
    newBrand = { nom: '' };

    showNewModel = false;
    newModel: { id_brand: number | null; nom: string; nom_commercial: string; code: string } = { id_brand: null, nom: '', nom_commercial: '', code: '' };

    constructor(
        private compatService: CompatService,
        public auth: AuthService,
        private translate: TranslateService,
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

    get filteredModels(): DeviceModel[] {
        if (!this.modelSearchTerm) return this.models;
        const term = this.modelSearchTerm.toLowerCase();
        return this.models.filter(m =>
            m.nom.toLowerCase().includes(term) ||
            m.marque.toLowerCase().includes(term) ||
            (m.code || '').toLowerCase().includes(term)
        );
    }

    clearMessages(): void {
        this.errorMsg = '';
        this.successMsg = '';
    }

    openAddForm(): void {
        this.editingId = null;
        this.form = this.emptyForm();
        this.modelSearchTerm = '';
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
                this.newModel.id_brand = res.id;
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
        this.compatService.createModel({ id_brand: idBrand, nom, nom_commercial: nomCommercial, code }).subscribe({
            next: (res) => {
                const brand = this.brands.find(b => b.id === idBrand);
                this.models = [...this.models, { id: res.id, nom, nom_commercial: nomCommercial ?? null, code: code ?? null, id_brand: idBrand, marque: brand?.nom || '' }];
                this.form.modeleIds.push(res.id); // select it immediately, no wait on a refetch
                this.newModel = { id_brand: idBrand, nom: '', nom_commercial: '', code: '' };
                this.showNewModel = false;
            },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_GROUPS.ERR_CREATE'; }
        });
    }

    logout(): void {
        this.auth.logout();
    }
}
