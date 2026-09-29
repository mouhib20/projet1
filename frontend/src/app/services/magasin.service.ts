import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Magasin, MagasinCreate, MagasinModulesMatrix } from '../models/magasin.model';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class MagasinService {

    private apiUrl = `${environment.apiUrl}/magasins`;

    constructor(private http: HttpClient) { }

    getMagasins(): Observable<Magasin[]> {
        return this.http.get<Magasin[]>(this.apiUrl);
    }

    getMagasin(id: number): Observable<Magasin> {
        return this.http.get<Magasin>(`${this.apiUrl}/${id}`);
    }

    createMagasin(dto: MagasinCreate): Observable<Magasin> {
        return this.http.post<Magasin>(this.apiUrl, dto);
    }

    updateMagasin(id: number, dto: Partial<Magasin>): Observable<Magasin> {
        return this.http.put<Magasin>(`${this.apiUrl}/${id}`, dto);
    }

    setStatut(id: number, actif: boolean): Observable<Magasin> {
        return this.http.patch<Magasin>(`${this.apiUrl}/${id}/statut`, { actif });
    }

    getModules(id: number): Observable<MagasinModulesMatrix> {
        return this.http.get<MagasinModulesMatrix>(`${this.apiUrl}/${id}/modules`);
    }

    setModules(id: number, matrix: MagasinModulesMatrix): Observable<MagasinModulesMatrix> {
        return this.http.put<MagasinModulesMatrix>(`${this.apiUrl}/${id}/modules`, matrix);
    }

    uploadLogo(id: number, file: File): Observable<Magasin> {
        const formData = new FormData();
        formData.append('logo', file);
        return this.http.post<Magasin>(`${this.apiUrl}/${id}/logo`, formData);
    }
}
