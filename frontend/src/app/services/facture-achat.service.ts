import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FactureAchat } from '../models/facture-achat.model';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class FactureAchatService {

    private apiUrl = `${environment.apiUrl}/factures-achat`;

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
