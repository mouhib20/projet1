import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Charge } from '../models/charge.model';

@Injectable({
    providedIn: 'root'
})
export class ChargeService {

    private apiUrl = 'http://localhost:3001/api/charges';

    constructor(private http: HttpClient) { }

    getCharges(): Observable<Charge[]> {
        return this.http.get<Charge[]>(this.apiUrl);
    }

    getCharge(id: number): Observable<Charge> {
        return this.http.get<Charge>(`${this.apiUrl}/${id}`);
    }

    createCharge(charge: Charge): Observable<Charge> {
        return this.http.post<Charge>(this.apiUrl, charge);
    }

    updateCharge(id: number, charge: Charge): Observable<Charge> {
        return this.http.put<Charge>(`${this.apiUrl}/${id}`, charge);
    }

    deleteCharge(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${id}`);
    }
}
