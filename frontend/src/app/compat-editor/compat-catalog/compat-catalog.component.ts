import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CompatService } from '../../services/compat.service';
import { AuthService } from '../../services/auth.service';
import { articleImageUrl } from '../../services/article.service';
import { Brand, DeviceModel } from '../../models/compat.model';

const MAX_MODEL_RESULTS = 200;

@Component({
    selector: 'app-compat-catalog',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './compat-catalog.component.html',
    styleUrls: ['./compat-catalog.component.css']
})
export class CompatCatalogComponent implements OnInit {
    brands: Brand[] = [];
    models: DeviceModel[] = [];
    loading = false;
    errorMsg = '';
    successMsg = '';

    brandSearchTerm = '';
    modelSearchTerm = '';

    get filteredBrands(): Brand[] {
        const t = this.brandSearchTerm.trim().toLowerCase();
        if (!t) return this.brands;
        return this.brands.filter(b => b.nom.toLowerCase().includes(t));
    }

    /** The full catalogue can hold thousands of models - nothing renders until the person
     *  searches, same "type to find it" convention as the base/compatible model pickers on the
     *  groups screen, with a hard cap so a broad term (e.g. a brand name) can't still dump
     *  hundreds of rows into the DOM at once. */
    get filteredModels(): DeviceModel[] {
        const t = this.modelSearchTerm.trim().toLowerCase();
        if (!t) return [];
        return this.models
            .filter(m => m.nom.toLowerCase().includes(t) || m.marque.toLowerCase().includes(t) || (m.code || '').toLowerCase().includes(t))
            .slice(0, MAX_MODEL_RESULTS);
    }

    get modelMatchCount(): number {
        const t = this.modelSearchTerm.trim().toLowerCase();
        if (!t) return 0;
        return this.models.filter(m => m.nom.toLowerCase().includes(t) || m.marque.toLowerCase().includes(t) || (m.code || '').toLowerCase().includes(t)).length;
    }

    modelCount(idBrand: number): number {
        return this.models.filter(m => m.id_brand === idBrand).length;
    }

    // ── Add brand ──
    showAddBrand = false;
    newBrandNom = '';

    // ── Edit brand (inline) ──
    editingBrandId: number | null = null;
    editBrandNom = '';

    // ── Add model ──
    showAddModel = false;
    newModel: { id_brand: number | null; nom: string; nom_commercial: string; code: string } = { id_brand: null, nom: '', nom_commercial: '', code: '' };

    // ── Edit model (inline) ──
    editingModelId: number | null = null;
    editModel = { nom: '', nom_commercial: '', code: '' };

    // ── Per-model photo upload, offered on each row ──
    modelImageUploadingId: number | null = null;

    constructor(
        private compatService: CompatService,
        public auth: AuthService,
        private translate: TranslateService,
        private router: Router,
    ) { }

    ngOnInit(): void {
        this.loadAll();
    }

    loadAll(): void {
        this.loading = true;
        this.compatService.getBrands().subscribe({
            next: (data) => { this.brands = data; this.loading = false; },
            error: () => { this.errorMsg = 'COMPAT_CATALOG.ERR_LOAD'; this.loading = false; }
        });
        this.compatService.getModels().subscribe({ next: (data) => this.models = data });
    }

    clearMessages(): void {
        this.errorMsg = '';
        this.successMsg = '';
    }

    imageUrl(image?: string | null): string | null {
        return articleImageUrl(image);
    }

    // ── Brands ──

    openAddBrand(): void {
        this.newBrandNom = '';
        this.showAddBrand = true;
        this.clearMessages();
    }

    addBrand(): void {
        const nom = this.newBrandNom.trim();
        if (!nom) { this.errorMsg = 'COMPAT_CATALOG.ERR_BRAND_NAME_REQUIRED'; return; }
        this.compatService.createBrand({ nom }).subscribe({
            next: (res) => {
                if (!this.brands.some(b => b.id === res.id)) this.brands = [...this.brands, { id: res.id, nom, logo: null }];
                this.showAddBrand = false;
                this.successMsg = 'COMPAT_CATALOG.SUCCESS_CREATE';
            },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_CATALOG.ERR_CREATE'; }
        });
    }

    startEditBrand(b: Brand): void {
        this.editingBrandId = b.id;
        this.editBrandNom = b.nom;
        this.clearMessages();
    }

    cancelEditBrand(): void {
        this.editingBrandId = null;
    }

    saveEditBrand(b: Brand): void {
        const nom = this.editBrandNom.trim();
        if (!nom) { this.errorMsg = 'COMPAT_CATALOG.ERR_BRAND_NAME_REQUIRED'; return; }
        this.compatService.updateBrand(b.id, { nom }).subscribe({
            next: () => {
                b.nom = nom;
                this.editingBrandId = null;
                this.successMsg = 'COMPAT_CATALOG.SUCCESS_UPDATE';
            },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_CATALOG.ERR_SAVE'; }
        });
    }

    deleteBrand(b: Brand): void {
        if (!confirm(this.translate.instant('COMPAT_CATALOG.CONFIRM_DELETE_BRAND', { nom: b.nom }))) return;
        this.clearMessages();
        this.compatService.deleteBrand(b.id).subscribe({
            next: () => { this.brands = this.brands.filter(x => x.id !== b.id); this.successMsg = 'COMPAT_CATALOG.SUCCESS_DELETE'; },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_CATALOG.ERR_DELETE'; }
        });
    }

    // ── Models ──

    openAddModel(): void {
        this.newModel = { id_brand: this.brands[0]?.id ?? null, nom: '', nom_commercial: '', code: '' };
        this.showAddModel = true;
        this.clearMessages();
    }

    addModel(): void {
        if (!this.newModel.id_brand) { this.errorMsg = 'COMPAT_CATALOG.ERR_MODEL_BRAND_REQUIRED'; return; }
        const nom = this.newModel.nom.trim();
        if (!nom) { this.errorMsg = 'COMPAT_CATALOG.ERR_MODEL_NAME_REQUIRED'; return; }
        const idBrand = this.newModel.id_brand;
        const nomCommercial = this.newModel.nom_commercial.trim() || undefined;
        const code = this.newModel.code.trim() || undefined;
        this.compatService.createModel({ id_brand: idBrand, nom, nom_commercial: nomCommercial, code }).subscribe({
            next: (res) => {
                const brand = this.brands.find(b => b.id === idBrand);
                if (!this.models.some(m => m.id === res.id)) {
                    this.models = [...this.models, { id: res.id, nom, nom_commercial: nomCommercial ?? null, code: code ?? null, image: null, id_brand: idBrand, marque: brand?.nom || '' }];
                }
                this.showAddModel = false;
                this.successMsg = 'COMPAT_CATALOG.SUCCESS_CREATE';
            },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_CATALOG.ERR_CREATE'; }
        });
    }

    startEditModel(m: DeviceModel): void {
        this.editingModelId = m.id;
        this.editModel = { nom: m.nom, nom_commercial: m.nom_commercial || '', code: m.code || '' };
        this.clearMessages();
    }

    cancelEditModel(): void {
        this.editingModelId = null;
    }

    saveEditModel(m: DeviceModel): void {
        const nom = this.editModel.nom.trim();
        if (!nom) { this.errorMsg = 'COMPAT_CATALOG.ERR_MODEL_NAME_REQUIRED'; return; }
        const nomCommercial = this.editModel.nom_commercial.trim() || undefined;
        const code = this.editModel.code.trim() || undefined;
        this.compatService.updateModel(m.id, { nom, nom_commercial: nomCommercial, code }).subscribe({
            next: () => {
                m.nom = nom;
                m.nom_commercial = nomCommercial ?? null;
                m.code = code ?? null;
                this.editingModelId = null;
                this.successMsg = 'COMPAT_CATALOG.SUCCESS_UPDATE';
            },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_CATALOG.ERR_SAVE'; }
        });
    }

    onModelImageSelected(event: Event, m: DeviceModel): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        this.clearMessages();
        this.modelImageUploadingId = m.id;
        this.compatService.uploadModelImage(file).subscribe({
            next: (res) => {
                this.compatService.updateModel(m.id, { image: res.url }).subscribe({
                    next: () => {
                        m.image = res.url; // same object reference in `models` - updates in place
                        this.modelImageUploadingId = null;
                    },
                    error: (err) => {
                        this.errorMsg = err.error?.message || 'COMPAT_CATALOG.ERR_IMAGE_UPLOAD';
                        this.modelImageUploadingId = null;
                    }
                });
            },
            error: (err) => {
                this.errorMsg = err.error?.message || 'COMPAT_CATALOG.ERR_IMAGE_UPLOAD';
                this.modelImageUploadingId = null;
            }
        });
        input.value = '';
    }

    deleteModel(m: DeviceModel): void {
        if (!confirm(this.translate.instant('COMPAT_CATALOG.CONFIRM_DELETE_MODEL', { nom: m.nom }))) return;
        this.clearMessages();
        this.compatService.deleteModel(m.id).subscribe({
            next: () => { this.models = this.models.filter(x => x.id !== m.id); this.successMsg = 'COMPAT_CATALOG.SUCCESS_DELETE'; },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_CATALOG.ERR_DELETE'; }
        });
    }

    goToGroups(): void {
        this.router.navigate(['/compat-editor/groups']);
    }

    logout(): void {
        this.auth.logout();
    }
}
