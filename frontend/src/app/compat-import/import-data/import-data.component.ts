import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HttpEventType } from '@angular/common/http';
import { CompatImportService } from '../../services/compat-import.service';
import { AuthService } from '../../services/auth.service';
import {
    BrandsModelsPreview, BrandsModelsResult, CompatibilitiesPreview, CompatibilitiesResult,
    PART_TYPE_KEYS, PartTypeKey,
} from '../../models/compat-import.model';

type Tab = 'brands' | 'compat';

@Component({
    selector: 'app-import-data',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './import-data.component.html',
    styleUrls: ['./import-data.component.css']
})
export class ImportDataComponent {
    activeTab: Tab = 'brands';
    readonly partTypeKeys = PART_TYPE_KEYS;

    constructor(private importService: CompatImportService, public auth: AuthService, private router: Router) { }

    logout(): void {
        this.auth.logout();
    }

    partTypeLabelKey(key: string): string {
        return 'IMPORT_DATA.TYPE_' + key.toUpperCase();
    }

    // ── Tab 1: brands & models ──

    bmFile: File | null = null;
    bmUploadProgress: number | null = null;
    bmPreview: BrandsModelsPreview | null = null;
    bmLoading = false;
    bmErrorMsg = '';
    bmSearchTerm = '';
    bmExcludedBrands = new Set<string>();
    bmExcludedModels = new Set<string>();
    bmConfirming = false;
    bmResult: BrandsModelsResult | null = null;

    onBmFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.bmFile = input.files?.[0] ?? null;
        this.bmPreview = null;
        this.bmResult = null;
        this.bmErrorMsg = '';
        this.bmExcludedBrands.clear();
        this.bmExcludedModels.clear();
        this.bmSearchTerm = '';
    }

    uploadBmPreview(): void {
        if (!this.bmFile || this.bmLoading) return;
        this.bmLoading = true;
        this.bmErrorMsg = '';
        this.bmUploadProgress = 0;
        this.importService.previewBrandsModels(this.bmFile).subscribe({
            next: (event) => {
                if (event.type === HttpEventType.UploadProgress && event.total) {
                    this.bmUploadProgress = Math.round((event.loaded / event.total) * 100);
                } else if (event.type === HttpEventType.Response) {
                    this.bmPreview = event.body ?? null;
                    this.bmLoading = false;
                    this.bmUploadProgress = null;
                }
            },
            error: (err) => {
                this.bmLoading = false;
                this.bmUploadProgress = null;
                this.bmErrorMsg = err.error?.message || 'IMPORT_DATA.ERR_PREVIEW';
            }
        });
    }

    toggleBrandExcluded(marque: string): void {
        if (this.bmExcludedBrands.has(marque)) this.bmExcludedBrands.delete(marque);
        else this.bmExcludedBrands.add(marque);
    }

    toggleModelExcluded(cle: string): void {
        if (this.bmExcludedModels.has(cle)) this.bmExcludedModels.delete(cle);
        else this.bmExcludedModels.add(cle);
    }

    get filteredBmModels() {
        if (!this.bmPreview) return [];
        const term = this.bmSearchTerm.trim().toLowerCase();
        if (!term) return this.bmPreview.modeles;
        return this.bmPreview.modeles.filter(m =>
            m.marque.toLowerCase().includes(term) || m.modele.toLowerCase().includes(term) || (m.code || '').toLowerCase().includes(term)
        );
    }

    confirmBm(): void {
        if (!this.bmPreview || this.bmConfirming) return;
        this.bmConfirming = true;
        this.bmErrorMsg = '';
        this.importService.confirmBrandsModels(this.bmPreview.importId, this.bmFile?.name || 'import.zip', {
            marquesExclues: [...this.bmExcludedBrands],
            modelesExclus: [...this.bmExcludedModels],
        }).subscribe({
            next: (res) => {
                this.bmConfirming = false;
                this.bmResult = res;
                this.bmPreview = null;
                this.bmFile = null;
            },
            error: (err) => {
                this.bmConfirming = false;
                this.bmErrorMsg = err.error?.message || 'IMPORT_DATA.ERR_CONFIRM';
            }
        });
    }

    downloadBmErrorReport(): void {
        if (!this.bmResult) return;
        const lines = this.bmResult.erreurs.map(e => `${e.marque};${e.message}`);
        this.downloadTextFile('import-marques-erreurs.csv', 'marque;message\n' + lines.join('\n'));
    }

    // ── Tab 2: compatibilities ──

    compatFile: File | null = null;
    compatUploadProgress: number | null = null;
    compatPreview: CompatibilitiesPreview | null = null;
    compatLoading = false;
    compatErrorMsg = '';
    compatSelectedTypes = new Set<PartTypeKey>(PART_TYPE_KEYS);
    compatExcludedGroups = new Set<string>();
    compatConfirmedMerges = new Set<string>();
    compatConfirming = false;
    compatResult: CompatibilitiesResult | null = null;

    onCompatFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.compatFile = input.files?.[0] ?? null;
        this.compatPreview = null;
        this.compatResult = null;
        this.compatErrorMsg = '';
        this.compatExcludedGroups.clear();
        this.compatConfirmedMerges.clear();
    }

    toggleCompatType(key: PartTypeKey): void {
        if (this.compatSelectedTypes.has(key)) this.compatSelectedTypes.delete(key);
        else this.compatSelectedTypes.add(key);
    }

    uploadCompatPreview(): void {
        if (!this.compatFile || this.compatLoading) return;
        this.compatLoading = true;
        this.compatErrorMsg = '';
        this.compatUploadProgress = 0;
        this.importService.previewCompatibilities(this.compatFile).subscribe({
            next: (event) => {
                if (event.type === HttpEventType.UploadProgress && event.total) {
                    this.compatUploadProgress = Math.round((event.loaded / event.total) * 100);
                } else if (event.type === HttpEventType.Response) {
                    this.compatPreview = event.body ?? null;
                    this.compatLoading = false;
                    this.compatUploadProgress = null;
                }
            },
            error: (err) => {
                this.compatLoading = false;
                this.compatUploadProgress = null;
                this.compatErrorMsg = err.error?.message || 'IMPORT_DATA.ERR_PREVIEW';
            }
        });
    }

    get visibleCompatGroups() {
        if (!this.compatPreview) return [];
        return this.compatPreview.groupes.filter(g => this.compatSelectedTypes.has(g.partTypeKey as PartTypeKey));
    }

    toggleGroupExcluded(cle: string): void {
        if (this.compatExcludedGroups.has(cle)) this.compatExcludedGroups.delete(cle);
        else this.compatExcludedGroups.add(cle);
    }

    toggleMergeConfirmed(cle: string): void {
        if (this.compatConfirmedMerges.has(cle)) this.compatConfirmedMerges.delete(cle);
        else this.compatConfirmedMerges.add(cle);
    }

    confirmCompat(): void {
        if (!this.compatPreview || this.compatConfirming) return;
        this.compatConfirming = true;
        this.compatErrorMsg = '';
        this.importService.confirmCompatibilities(
            this.compatPreview.importId,
            this.compatFile?.name || 'compatibilities.json',
            [...this.compatSelectedTypes],
            { groupesExclus: [...this.compatExcludedGroups], fusionsConfirmees: [...this.compatConfirmedMerges] },
        ).subscribe({
            next: (res) => {
                this.compatConfirming = false;
                this.compatResult = res;
                this.compatPreview = null;
                this.compatFile = null;
            },
            error: (err) => {
                this.compatConfirming = false;
                this.compatErrorMsg = err.error?.message || 'IMPORT_DATA.ERR_CONFIRM';
            }
        });
    }

    private downloadTextFile(filename: string, content: string): void {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}
