import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Client, ClientDepot, ClientDepotSummary } from '../models/client.model';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class ClientService {

    private apiUrl = `${environment.apiUrl}/clients`;

    constructor(private http: HttpClient) { }

    getClients(): Observable<Client[]> {
        return this.http.get<Client[]>(this.apiUrl);
    }

    getClient(id: number): Observable<Client> {
        return this.http.get<Client>(`${this.apiUrl}/${id}`);
    }

    createClient(client: Client): Observable<Client> {
        return this.http.post<Client>(this.apiUrl, client);
    }

    updateClient(id: number, client: Client): Observable<Client> {
        return this.http.put<Client>(`${this.apiUrl}/${id}`, client);
    }

    deleteClient(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${id}`);
    }

    deposer(id: number, montant: number, note?: string): Observable<Client> {
        return this.http.post<Client>(`${this.apiUrl}/${id}/depots`, { montant, note });
    }

    getDepots(id: number): Observable<ClientDepot[]> {
        return this.http.get<ClientDepot[]>(`${this.apiUrl}/${id}/depots`);
    }

    getDepotsSummary(): Observable<ClientDepotSummary[]> {
        return this.http.get<ClientDepotSummary[]>(`${this.apiUrl}/depots/summary`);
    }
}
