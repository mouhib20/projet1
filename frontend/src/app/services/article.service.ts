import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ArticleForm {
    id_article?: number;
    designation: string;
    prix_achat: number;
    prix_vente?: number;
    barcode?: string;
    marque?: string;
    modele?: string;
    type?: 'part' | 'accessory';
    sous_categorie?: string;
    quantite?: number;
    qte_min?: number;
    description?: string;
    image?: string;
}

export function articleImageUrl(image?: string | null): string | null {
    if (!image) return null;
    return `${environment.filesUrl}${image}`;
}

@Injectable({
    providedIn: 'root'
})
export class ArticleService {
    private apiUrl = `${environment.apiUrl}/articles`;

    constructor(private http: HttpClient) { }

    getArticles(): Observable<ArticleForm[]> {
        return this.http.get<ArticleForm[]>(this.apiUrl);
    }

    getArticle(id: number): Observable<ArticleForm> {
        return this.http.get<ArticleForm>(`${this.apiUrl}/${id}`);
    }

    createArticle(article: Partial<ArticleForm>): Observable<ArticleForm> {
        return this.http.post<ArticleForm>(this.apiUrl, article);
    }

    updateArticle(id: number, article: Partial<ArticleForm>): Observable<ArticleForm> {
        return this.http.put<ArticleForm>(`${this.apiUrl}/${id}`, article);
    }

    deleteArticle(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/${id}`);
    }

    uploadImage(file: File): Observable<{ url: string }> {
        const formData = new FormData();
        formData.append('image', file);
        return this.http.post<{ url: string }>(`${this.apiUrl}/upload-image`, formData);
    }

    linkFournisseur(articleId: number, fournisseurId: number): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/${articleId}/fournisseur`, { fournisseurId });
    }

    getSav(): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/sav`);
    }

    creerSav(data: { id_article: number; id_client?: number; qte?: number; probleme: string; degre_dommage?: string }): Observable<{ id: number }> {
        return this.http.post<{ id: number }>(`${this.apiUrl}/sav`, data);
    }

    remplacerSav(savId: number, idArticleRemplacement: number): Observable<{ remplacement: string }> {
        return this.http.post<{ remplacement: string }>(`${this.apiUrl}/sav/${savId}/remplacer`, { id_article_remplacement: idArticleRemplacement });
    }

    getRetoursFournisseur(): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/retours-fournisseur`);
    }

    renvoyerAuFournisseur(articleId: number, data: { probleme: string; qte?: number }): Observable<{ fournisseur: string | null }> {
        return this.http.post<{ fournisseur: string | null }>(`${this.apiUrl}/${articleId}/retour-fournisseur`, data);
    }
}
