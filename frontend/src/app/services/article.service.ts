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
}
