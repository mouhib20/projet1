import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FactureAchat } from '../models/facture-achat.model';

@Injectable({
    providedIn: 'root'
})
export class FactureAchatService {

    private apiUrl = 'http://localhost:3001/api/factures-achat';

    constructor(private http: HttpClient) { }

    getFactures(): Observable<FactureAchat[]> {
        return this.http.get<FactureAchat[]>(this.apiUrl);
    }

    getFacture(id: number): Observable<FactureAchat> {
        return this.http.get<FactureAchat>(`${this.apiUrl}/${id}`);
    }

    createFacture(facture: FactureAchat): Observable<FactureAchat> {
        return this.http.post<FactureAchat>(this.apiUrl, facture);
    }
}
