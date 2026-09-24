import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Vente } from '../models/vente.model';
import { VenteStats } from '../models/vente-stats.model';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class VenteService {

    private apiUrl = `${environment.apiUrl}/ventes`;

    constructor(private http: HttpClient) { }

    getVentes(): Observable<Vente[]> {
        return this.http.get<Vente[]>(this.apiUrl);
    }

    getVente(id: number): Observable<Vente> {
        return this.http.get<Vente>(`${this.apiUrl}/${id}`);
    }

    createVente(vente: any): Observable<Vente> {
        return this.http.post<Vente>(this.apiUrl, vente);
    }

    checkout(payload: {
        clientId?: number | null;
        remise?: number;
        montantSolde?: number;
        date?: string;
        items: { articleId?: number | null; reparationId?: number | null; designation?: string; qte: number; prix: number }[];
    }): Observable<Vente[]> {
        return this.http.post<Vente[]>(`${this.apiUrl}/checkout`, payload);
    }

    deleteVente(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${id}`);
    }

    getStats(days: number = 14): Observable<VenteStats> {
        return this.http.get<VenteStats>(`${this.apiUrl}/stats?days=${days}`);
    }
}
