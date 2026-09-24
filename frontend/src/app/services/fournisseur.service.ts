import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Fournisseur } from '../models/fournisseur.model';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class FournisseurService {

    private apiUrl = `${environment.apiUrl}/fournisseurs`;

    constructor(private http: HttpClient) { }

    getFournisseurs(): Observable<Fournisseur[]> {
        return this.http.get<Fournisseur[]>(this.apiUrl);
    }

    getFournisseur(id: number): Observable<Fournisseur> {
        return this.http.get<Fournisseur>(`${this.apiUrl}/${id}`);
    }

    createFournisseur(fournisseur: Fournisseur): Observable<Fournisseur> {
        return this.http.post<Fournisseur>(this.apiUrl, fournisseur);
    }

    updateFournisseur(id: number, fournisseur: Fournisseur): Observable<Fournisseur> {
        return this.http.put<Fournisseur>(`${this.apiUrl}/${id}`, fournisseur);
    }

    deleteFournisseur(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${id}`);
    }
}
