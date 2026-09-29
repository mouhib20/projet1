import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
    WholesaleCatalogueEntry, WholesaleOrder, WholesaleOrderLineInput, WholesaleListing,
} from '../models/wholesale.model';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class WholesaleService {

    private apiUrl = `${environment.apiUrl}/wholesale`;

    constructor(private http: HttpClient) { }

    // ── Customer side (any store) ──

    getCatalogue(q?: string): Observable<WholesaleCatalogueEntry[]> {
        return this.http.get<WholesaleCatalogueEntry[]>(`${this.apiUrl}/catalog`, { params: q ? { q } : {} });
    }

    createOrder(dto: { lignes: WholesaleOrderLineInput[]; note?: string; methode_reception?: string }): Observable<{ id: number }> {
        return this.http.post<{ id: number }>(`${this.apiUrl}/orders`, dto);
    }

    getOrders(): Observable<WholesaleOrder[]> {
        return this.http.get<WholesaleOrder[]>(`${this.apiUrl}/orders`);
    }

    acceptAdjustment(id: number): Observable<void> {
        return this.http.patch<void>(`${this.apiUrl}/orders/${id}/accept-adjustment`, {});
    }

    cancelOrder(id: number): Observable<void> {
        return this.http.patch<void>(`${this.apiUrl}/orders/${id}/cancel`, {});
    }

    confirmReceipt(id: number): Observable<void> {
        return this.http.patch<void>(`${this.apiUrl}/orders/${id}/receive`, {});
    }

    // ── Wholesale store's own side ──

    confirmOrder(id: number, lignes: { id_ligne: number; qte_confirmee: number }[]): Observable<void> {
        return this.http.patch<void>(`${this.apiUrl}/orders/${id}/confirm`, { lignes });
    }

    startPreparation(id: number): Observable<void> {
        return this.http.patch<void>(`${this.apiUrl}/orders/${id}/start-preparation`, {});
    }

    sendOrder(id: number): Observable<void> {
        return this.http.patch<void>(`${this.apiUrl}/orders/${id}/send`, {});
    }

    getListings(): Observable<WholesaleListing[]> {
        return this.http.get<WholesaleListing[]>(`${this.apiUrl}/listings`);
    }

    createListing(dto: { id_article: number; prix_gros: number; qte_min?: number }): Observable<{ id: number }> {
        return this.http.post<{ id: number }>(`${this.apiUrl}/listings`, dto);
    }

    updateListing(id: number, dto: { prix_gros?: number; qte_min?: number; visible?: boolean }): Observable<void> {
        return this.http.put<void>(`${this.apiUrl}/listings/${id}`, dto);
    }

    deleteListing(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/listings/${id}`);
    }
}
