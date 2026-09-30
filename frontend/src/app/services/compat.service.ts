import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
    CompatEditor, Brand, DeviceModel, PartType,
    CompatGroupListItem, CompatGroupDetail, CompatGroupSave, CompatSuggestion,
} from '../models/compat.model';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class CompatService {

    private apiUrl = `${environment.apiUrl}/compat`;

    constructor(private http: HttpClient) { }

    // ── Search (store-side) ──

    search(q: string): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/search`, { params: { q } });
    }

    partsForModel(idModel: number): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/models/${idModel}/parts`);
    }

    createSuggestion(dto: { id_model?: number; texte_libre?: string; id_part_type?: number }): Observable<{ id: number }> {
        return this.http.post<{ id: number }>(`${this.apiUrl}/suggestions`, dto);
    }

    getPartTypesForSearch(): Observable<PartType[]> {
        return this.http.get<PartType[]>(`${this.apiUrl}/search/part-types`);
    }

    getBrandsForSearch(): Observable<Brand[]> {
        return this.http.get<Brand[]>(`${this.apiUrl}/search/brands`);
    }

    getModelsForSearch(idBrand: number): Observable<DeviceModel[]> {
        return this.http.get<DeviceModel[]>(`${this.apiUrl}/search/models`, { params: { id_brand: idBrand } });
    }

    resolveGroup(idModel: number, idPartType: number): Observable<{ id_group: number } | null> {
        return this.http.get<{ id_group: number } | null>(`${this.apiUrl}/search/resolve-group`, { params: { id_model: idModel, id_part_type: idPartType } });
    }

    getGroupInfoForSearch(idGroup: number): Observable<{ id_part_type: number; nom_fr: string; nom_en: string; nom_ar: string } | null> {
        return this.http.get<{ id_part_type: number; nom_fr: string; nom_en: string; nom_ar: string } | null>(`${this.apiUrl}/search/groups/${idGroup}`);
    }

    // ── Reference data (editor) ──

    getBrands(): Observable<Brand[]> {
        return this.http.get<Brand[]>(`${this.apiUrl}/brands`);
    }

    createBrand(dto: { nom: string; logo?: string }): Observable<{ id: number }> {
        return this.http.post<{ id: number }>(`${this.apiUrl}/brands`, dto);
    }

    getModels(): Observable<DeviceModel[]> {
        return this.http.get<DeviceModel[]>(`${this.apiUrl}/models`);
    }

    createModel(dto: { id_brand: number; nom: string; nom_commercial?: string; code?: string; image?: string }): Observable<{ id: number }> {
        return this.http.post<{ id: number }>(`${this.apiUrl}/models`, dto);
    }

    updateModel(id: number, dto: { image?: string }): Observable<void> {
        return this.http.put<void>(`${this.apiUrl}/models/${id}`, dto);
    }

    uploadModelImage(file: File): Observable<{ url: string }> {
        const formData = new FormData();
        formData.append('image', file);
        return this.http.post<{ url: string }>(`${this.apiUrl}/models/upload-image`, formData);
    }

    getModelsForGroup(idGroup: number): Observable<DeviceModel[]> {
        return this.http.get<DeviceModel[]>(`${this.apiUrl}/groups/${idGroup}/models`);
    }

    getPartTypes(): Observable<PartType[]> {
        return this.http.get<PartType[]>(`${this.apiUrl}/part-types`);
    }

    createPartType(dto: { nom_fr: string; nom_en: string; nom_ar: string; categorie?: 'part' | 'accessory' }): Observable<{ id: number }> {
        return this.http.post<{ id: number }>(`${this.apiUrl}/part-types`, dto);
    }

    // ── Groups (editor) ──

    getGroups(): Observable<CompatGroupListItem[]> {
        return this.http.get<CompatGroupListItem[]>(`${this.apiUrl}/groups`);
    }

    getGroup(id: number): Observable<CompatGroupDetail> {
        return this.http.get<CompatGroupDetail>(`${this.apiUrl}/groups/${id}`);
    }

    createGroup(dto: CompatGroupSave): Observable<{ id: number }> {
        return this.http.post<{ id: number }>(`${this.apiUrl}/groups`, dto);
    }

    updateGroup(id: number, dto: Partial<CompatGroupSave>): Observable<void> {
        return this.http.put<void>(`${this.apiUrl}/groups/${id}`, dto);
    }

    deleteGroup(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/groups/${id}`);
    }

    // ── Suggestions review (editor) ──

    getSuggestions(): Observable<CompatSuggestion[]> {
        return this.http.get<CompatSuggestion[]>(`${this.apiUrl}/suggestions`);
    }

    processSuggestion(id: number, statut: 'acceptee' | 'refusee'): Observable<void> {
        return this.http.patch<void>(`${this.apiUrl}/suggestions/${id}`, { statut });
    }

    // ── Editor accounts (super_admin) ──

    getEditors(): Observable<CompatEditor[]> {
        return this.http.get<CompatEditor[]>(`${this.apiUrl}/editors`);
    }

    createEditor(dto: CompatEditor): Observable<CompatEditor> {
        return this.http.post<CompatEditor>(`${this.apiUrl}/editors`, dto);
    }

    setEditorStatut(id: number, actif: boolean): Observable<void> {
        return this.http.patch<void>(`${this.apiUrl}/editors/${id}/statut`, { actif });
    }
}
