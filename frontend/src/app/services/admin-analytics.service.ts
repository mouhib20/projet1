import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
    AnalyticsFiltres, TopPiece, EcranPiece, FournisseurLigne, RecommandationGros, DetailPiece,
} from '../models/admin-analytics.model';

@Injectable({
    providedIn: 'root'
})
export class AdminAnalyticsService {

    private apiUrl = `${environment.apiUrl}/admin-analytics`;

    constructor(private http: HttpClient) { }

    private params(f: AnalyticsFiltres): Record<string, string> {
        const p: Record<string, string> = { periode: f.periode };
        if (f.dateDebut) p['dateDebut'] = f.dateDebut;
        if (f.dateFin) p['dateFin'] = f.dateFin;
        if (f.idPartType) p['idPartType'] = String(f.idPartType);
        if (f.idBrand) p['idBrand'] = String(f.idBrand);
        if (f.wilaya) p['wilaya'] = f.wilaya;
        return p;
    }

    getTopPieces(f: AnalyticsFiltres): Observable<TopPiece[]> {
        return this.http.get<TopPiece[]>(`${this.apiUrl}/top-pieces`, { params: this.params(f) });
    }

    getDetailPiece(idGroup: number, f: AnalyticsFiltres): Observable<DetailPiece> {
        return this.http.get<DetailPiece>(`${this.apiUrl}/top-pieces/${idGroup}`, { params: this.params(f) });
    }

    getEcrans(f: AnalyticsFiltres): Observable<EcranPiece[]> {
        return this.http.get<EcranPiece[]>(`${this.apiUrl}/ecrans`, { params: this.params(f) });
    }

    getFournisseurs(f: AnalyticsFiltres): Observable<FournisseurLigne[]> {
        return this.http.get<FournisseurLigne[]>(`${this.apiUrl}/fournisseurs`, { params: this.params(f) });
    }

    getRecommandationsGros(f: AnalyticsFiltres): Observable<RecommandationGros[]> {
        return this.http.get<RecommandationGros[]>(`${this.apiUrl}/recommandations-gros`, { params: this.params(f) });
    }

    recalculer(): Observable<{ fenetreJours: number }> {
        return this.http.post<{ fenetreJours: number }>(`${this.apiUrl}/recalculer`, {});
    }
}
