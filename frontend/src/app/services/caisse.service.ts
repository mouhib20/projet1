import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CaisseMouvement, CaisseRapport, CaisseSession, CaisseStatus } from '../models/caisse.model';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class CaisseService {

    private apiUrl = `${environment.apiUrl}/caisse`;

    constructor(private http: HttpClient) { }

    getStatus(): Observable<CaisseStatus> {
        return this.http.get<CaisseStatus>(`${this.apiUrl}/status`);
    }

    ouvrir(fond_compte: number): Observable<CaisseSession> {
        return this.http.post<CaisseSession>(`${this.apiUrl}/ouvrir`, { fond_compte });
    }

    fermer(data: { montant_compte: number; fond_laisse: number; note?: string }): Observable<CaisseSession> {
        return this.http.post<CaisseSession>(`${this.apiUrl}/fermer`, data);
    }

    mouvement(data: { type: 'entree' | 'sortie'; montant: number; motif: string }): Observable<CaisseMouvement> {
        return this.http.post<CaisseMouvement>(`${this.apiUrl}/mouvements`, data);
    }

    getHistorique(): Observable<CaisseSession[]> {
        return this.http.get<CaisseSession[]>(`${this.apiUrl}/historique`);
    }

    getSession(id: number): Observable<{ session: CaisseSession; mouvements: CaisseMouvement[] }> {
        return this.http.get<{ session: CaisseSession; mouvements: CaisseMouvement[] }>(`${this.apiUrl}/sessions/${id}`);
    }

    getRapport(date: string): Observable<CaisseRapport> {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return this.http.get<CaisseRapport>(`${this.apiUrl}/rapport`, { params: { date, tz } });
    }
}
