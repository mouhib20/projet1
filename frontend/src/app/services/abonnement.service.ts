import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Departement } from './auth.service';
import {
    ParametresAbonnement, AbonnementListeItem, ResumeFinancier, AbonnementDetail,
} from '../models/abonnement.model';

@Injectable({
    providedIn: 'root'
})
export class AbonnementService {

    private apiUrl = `${environment.apiUrl}/abonnements`;

    constructor(private http: HttpClient) { }

    getParametres(): Observable<ParametresAbonnement> {
        return this.http.get<ParametresAbonnement>(`${this.apiUrl}/parametres`);
    }

    updateParametres(dto: { prix_base_annuel?: number; duree_essai_jours?: number; duree_grace_jours?: number }): Observable<void> {
        return this.http.put<void>(`${this.apiUrl}/parametres`, dto);
    }

    updatePrixSection(departement: Departement, prixAnnuel: number | null): Observable<void> {
        return this.http.put<void>(`${this.apiUrl}/parametres/sections/${departement}`, { prix_annuel: prixAnnuel });
    }

    getResumeFinancier(): Observable<ResumeFinancier> {
        return this.http.get<ResumeFinancier>(`${this.apiUrl}/resume`);
    }

    listerAbonnements(): Observable<AbonnementListeItem[]> {
        return this.http.get<AbonnementListeItem[]>(this.apiUrl);
    }

    getAbonnement(idMagasin: number): Observable<AbonnementDetail> {
        return this.http.get<AbonnementDetail>(`${this.apiUrl}/${idMagasin}`);
    }

    enregistrerPaiement(idMagasin: number, dto: { montant: number; methode: string; reference?: string; date_paiement: string; note?: string; sections: Departement[] }): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/${idMagasin}/paiement`, dto);
    }

    prolongerEssai(idMagasin: number, jours: number, raison: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/${idMagasin}/prolonger-essai`, { jours, raison });
    }

    prolongerAbonnement(idMagasin: number, jours: number, raison: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/${idMagasin}/prolonger`, { jours, raison });
    }

    suspendre(idMagasin: number, raison: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/${idMagasin}/suspendre`, { raison });
    }

    reactiver(idMagasin: number, raison: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/${idMagasin}/reactiver`, { raison });
    }

    changerReduction(idMagasin: number, dto: { montant?: number | null; pourcentage?: number | null; raison: string }): Observable<void> {
        return this.http.put<void>(`${this.apiUrl}/${idMagasin}/reduction`, dto);
    }
}
