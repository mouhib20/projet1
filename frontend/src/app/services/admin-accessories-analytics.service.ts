import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
    AccAnalyticsFiltres, TopProduitAccessoire, ResumeAccessoires, FournisseurLigneAccessoire,
    RecommandationGrosAccessoire, ArticleNonLie, SuggestionProduit, DetailProduitAccessoire,
} from '../models/admin-accessories-analytics.model';

@Injectable({
    providedIn: 'root'
})
export class AdminAccessoriesAnalyticsService {

    private apiUrl = `${environment.apiUrl}/admin-accessories-analytics`;

    constructor(private http: HttpClient) { }

    private params(f: AccAnalyticsFiltres): Record<string, string> {
        const p: Record<string, string> = { periode: f.periode };
        if (f.dateDebut) p['dateDebut'] = f.dateDebut;
        if (f.dateFin) p['dateFin'] = f.dateFin;
        if (f.categorie) p['categorie'] = f.categorie;
        if (f.marque) p['marque'] = f.marque;
        if (f.wilaya) p['wilaya'] = f.wilaya;
        return p;
    }

    getResume(f: AccAnalyticsFiltres): Observable<ResumeAccessoires> {
        return this.http.get<ResumeAccessoires>(`${this.apiUrl}/resume`, { params: this.params(f) });
    }

    getTopProduits(f: AccAnalyticsFiltres): Observable<TopProduitAccessoire[]> {
        return this.http.get<TopProduitAccessoire[]>(`${this.apiUrl}/top-produits`, { params: this.params(f) });
    }

    getDetailProduit(idProduit: number, f: AccAnalyticsFiltres): Observable<DetailProduitAccessoire> {
        return this.http.get<DetailProduitAccessoire>(`${this.apiUrl}/top-produits/${idProduit}`, { params: this.params(f) });
    }

    getFournisseurs(f: AccAnalyticsFiltres): Observable<FournisseurLigneAccessoire[]> {
        return this.http.get<FournisseurLigneAccessoire[]>(`${this.apiUrl}/fournisseurs`, { params: this.params(f) });
    }

    getRecommandationsGros(f: AccAnalyticsFiltres): Observable<RecommandationGrosAccessoire[]> {
        return this.http.get<RecommandationGrosAccessoire[]>(`${this.apiUrl}/recommandations-gros`, { params: this.params(f) });
    }

    getNonLies(): Observable<ArticleNonLie[]> {
        return this.http.get<ArticleNonLie[]>(`${this.apiUrl}/non-lies`);
    }

    getSuggestions(idArticle: number): Observable<SuggestionProduit[]> {
        return this.http.get<SuggestionProduit[]>(`${this.apiUrl}/non-lies/${idArticle}/suggestions`);
    }

    lier(idArticle: number, idProduit?: number): Observable<{ id_produit: number }> {
        return this.http.post<{ id_produit: number }>(`${this.apiUrl}/non-lies/${idArticle}/lier`, { id_produit: idProduit });
    }

    recalculer(): Observable<{ fenetreJours: number }> {
        return this.http.post<{ fenetreJours: number }>(`${this.apiUrl}/recalculer`, {});
    }
}
