import { CompatService } from './compat.service';
import { Brand, DeviceModel } from '../models/compat.model';

/** Reusable brand/model autocomplete state, backed by the shared compatibility catalogue.
 *  Instantiate one per input pair (e.g. device brand/model, used-part brand/model). */
export class CompatBrandModelPicker {
    filteredBrands: Brand[] = [];
    showBrandSuggestions = false;
    modelsForBrand: DeviceModel[] = [];
    filteredModels: DeviceModel[] = [];
    showModelSuggestions = false;
    selectedBrandId: number | null = null;

    constructor(private compatService: CompatService, private allBrands: () => Brand[]) { }

    onBrandInput(term: string): void {
        this.selectedBrandId = null;
        this.modelsForBrand = [];
        this.filteredModels = [];
        const t = (term || '').trim().toLowerCase();
        const brands = this.allBrands();
        this.filteredBrands = t ? brands.filter(b => b.nom.toLowerCase().includes(t)).slice(0, 8) : brands.slice(0, 8);
    }

    /** Returns the brand name to assign to the bound field. */
    selectBrand(b: Brand): string {
        this.selectedBrandId = b.id;
        this.showBrandSuggestions = false;
        this.compatService.getModelsForSearch(b.id).subscribe({
            next: (data) => { this.modelsForBrand = data; this.filteredModels = data.slice(0, 8); }
        });
        return b.nom;
    }

    closeBrandSuggestions(): void {
        setTimeout(() => this.showBrandSuggestions = false, 200);
    }

    onModelInput(term: string): void {
        const t = (term || '').trim().toLowerCase();
        this.filteredModels = t
            ? this.modelsForBrand.filter(m => m.nom.toLowerCase().includes(t)).slice(0, 8)
            : this.modelsForBrand.slice(0, 8);
    }

    /** Returns the model name to assign to the bound field. */
    selectModel(m: DeviceModel): string {
        this.showModelSuggestions = false;
        return m.nom;
    }

    closeModelSuggestions(): void {
        setTimeout(() => this.showModelSuggestions = false, 200);
    }
}
