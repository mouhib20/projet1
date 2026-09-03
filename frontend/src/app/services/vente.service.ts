import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Vente } from '../models/vente.model';

@Injectable({
    providedIn: 'root'
})
export class VenteService {

    private apiUrl = 'http://localhost:3001/api/ventes';

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

    deleteVente(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${id}`);
    }
}
