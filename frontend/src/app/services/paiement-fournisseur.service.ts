import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface FournisseurDu {
    id_fournisseur: number;
    nom: string;
    prenom?: string;
    entreprise?: string;
    type_articles?: string;
    solde: number | string;
    total_paye: number | string;
}

export interface PaiementFournisseur {
    id: number;
    id_fournisseur: number;
    montant: number | string;
    date: string;
    note: string | null;
    paye_caisse: boolean;
    par_nom: string;
    nom: string;
    prenom?: string;
    entreprise?: string;
    type_articles?: string;
}

@Injectable({
    providedIn: 'root'
})
export class PaiementFournisseurService {
    private apiUrl = `${environment.apiUrl}/paiements-fournisseur`;

    constructor(private http: HttpClient) { }

    getDus(): Observable<FournisseurDu[]> {
        return this.http.get<FournisseurDu[]>(`${this.apiUrl}/dus`);
    }

    getHistorique(): Observable<PaiementFournisseur[]> {
        return this.http.get<PaiementFournisseur[]>(this.apiUrl);
    }

    payer(data: { id_fournisseur: number; montant: number; date?: string; note?: string; paye_caisse?: boolean }): Observable<any> {
        return this.http.post<any>(this.apiUrl, data);
    }

    annuler(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/${id}`);
    }
}
