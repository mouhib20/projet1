import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CaisseCloture, CaisseStatus } from '../models/caisse.model';

@Injectable({
    providedIn: 'root'
})
export class CaisseService {

    private apiUrl = 'http://localhost:3001/api/caisse';

    constructor(private http: HttpClient) { }

    getStatus(date?: string): Observable<CaisseStatus> {
        const url = date ? `${this.apiUrl}/status?date=${date}` : `${this.apiUrl}/status`;
        return this.http.get<CaisseStatus>(url);
    }

    getHistorique(): Observable<CaisseCloture[]> {
        return this.http.get<CaisseCloture[]>(this.apiUrl);
    }

    cloturer(date?: string): Observable<CaisseCloture> {
        return this.http.post<CaisseCloture>(`${this.apiUrl}/cloturer`, date ? { date } : {});
    }

    saisirComptage(id: number, montant_compte: number): Observable<CaisseCloture> {
        return this.http.put<CaisseCloture>(`${this.apiUrl}/${id}/comptage`, { montant_compte });
    }
}
