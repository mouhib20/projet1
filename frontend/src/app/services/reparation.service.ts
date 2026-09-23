import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ReparationItem {
    id_article: number;
    qte: number;
    prix?: number;
}

export interface CreateReparationDto {
    id_client: number;
    appareil?: string;
    description?: string;
    cout_main_oeuvre?: number;
    prix?: number;
    acompte?: number;
    retour_de?: number;
    degre_dommage?: string;
    statut?: string;
    date_reception?: string;
    items?: ReparationItem[];
}

@Injectable({
    providedIn: 'root'
})
export class ReparationService {
    private apiUrl = `${environment.apiUrl}/reparations`;

    constructor(private http: HttpClient) { }

    getAllReparations(): Observable<any[]> {
        return this.http.get<any[]>(this.apiUrl);
    }

    getRetours(): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/retours`);
    }

    getReparation(id: number): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/${id}`);
    }

    createReparation(data: CreateReparationDto): Observable<any> {
        return this.http.post<any>(this.apiUrl, data);
    }

    updateStatut(id: number, statut: string): Observable<any> {
        return this.http.patch<any>(`${this.apiUrl}/${id}/statut`, { statut });
    }

    addItem(id: number, data: { id_article: number; qte?: number; prix?: number }): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/${id}/items`, data);
    }

    finaliserVente(id: number, montant_recu: number): Observable<any> {
        return this.http.patch<any>(`${this.apiUrl}/${id}/finaliser-vente`, { montant_recu });
    }

    deleteReparation(id: number): Observable<any> {
        return this.http.delete<any>(`${this.apiUrl}/${id}`);
    }
}
