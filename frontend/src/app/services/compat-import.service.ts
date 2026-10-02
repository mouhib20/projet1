import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
    ImportEmployee, BrandsModelsPreview, BrandsModelsSelections, BrandsModelsResult,
    CompatibilitiesPreview, CompatibilitiesSelections, CompatibilitiesResult,
} from '../models/compat-import.model';

@Injectable({
    providedIn: 'root'
})
export class CompatImportService {

    private apiUrl = `${environment.apiUrl}/compat-import`;

    constructor(private http: HttpClient) { }

    // ── compatibility_employee account management (super_admin) ──

    getEmployees(): Observable<ImportEmployee[]> {
        return this.http.get<ImportEmployee[]>(`${this.apiUrl}/employees`);
    }

    createEmployee(dto: ImportEmployee): Observable<ImportEmployee> {
        return this.http.post<ImportEmployee>(`${this.apiUrl}/employees`, dto);
    }

    setEmployeeStatut(id: number, actif: boolean): Observable<void> {
        return this.http.patch<void>(`${this.apiUrl}/employees/${id}/statut`, { actif });
    }

    // ── Tab 1: brands & models ──

    /** Uses HttpRequest with reportProgress so the component can show an upload progress bar for a
     *  potentially large ZIP, same pattern recommended for any large multipart upload in Angular. */
    previewBrandsModels(file: File): Observable<HttpEvent<BrandsModelsPreview>> {
        const formData = new FormData();
        formData.append('file', file);
        const req = new HttpRequest('POST', `${this.apiUrl}/brands-models/preview`, formData, { reportProgress: true });
        return this.http.request<BrandsModelsPreview>(req);
    }

    confirmBrandsModels(importId: string, nomFichier: string, selections?: BrandsModelsSelections): Observable<BrandsModelsResult> {
        return this.http.post<BrandsModelsResult>(`${this.apiUrl}/brands-models/confirm`, { importId, nomFichier, selections });
    }

    // ── Tab 2: compatibilities ──

    previewCompatibilities(file: File): Observable<HttpEvent<CompatibilitiesPreview>> {
        const formData = new FormData();
        formData.append('file', file);
        const req = new HttpRequest('POST', `${this.apiUrl}/compatibilities/preview`, formData, { reportProgress: true });
        return this.http.request<CompatibilitiesPreview>(req);
    }

    confirmCompatibilities(importId: string, nomFichier: string, partTypes?: string[], selections?: CompatibilitiesSelections): Observable<CompatibilitiesResult> {
        return this.http.post<CompatibilitiesResult>(`${this.apiUrl}/compatibilities/confirm`, { importId, nomFichier, partTypes, selections });
    }
}
