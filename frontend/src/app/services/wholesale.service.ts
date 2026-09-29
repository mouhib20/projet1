import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
    WholesaleCatalogueEntry, WholesaleOrder, WholesaleOrderLineInput, WholesaleListing,
    WholesaleListingSave, WholesaleEditor,
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

    // ── Wholesale-editor side (independent role, no store) ──

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

    createListing(dto: WholesaleListingSave): Observable<{ id: number }> {
        return this.http.post<{ id: number }>(`${this.apiUrl}/listings`, dto);
    }

    updateListing(id: number, dto: Partial<WholesaleListingSave>): Observable<void> {
        return this.http.put<void>(`${this.apiUrl}/listings/${id}`, dto);
    }

    deleteListing(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/listings/${id}`);
    }

    // ── Wholesale-editor accounts (super_admin) ──

    getEditors(): Observable<WholesaleEditor[]> {
        return this.http.get<WholesaleEditor[]>(`${this.apiUrl}/editors`);
    }

    createEditor(dto: WholesaleEditor): Observable<WholesaleEditor> {
        return this.http.post<WholesaleEditor>(`${this.apiUrl}/editors`, dto);
    }

    setEditorStatut(id: number, actif: boolean): Observable<void> {
        return this.http.patch<void>(`${this.apiUrl}/editors/${id}/statut`, { actif });
    }
}
