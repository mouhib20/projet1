import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';

/** Fields the offline POS needs from an Article - mirrors ArticlesService.syncDepuis(). */
export interface OfflineArticle {
    id_article: number;
    designation: string;
    prix_achat: number;
    prix_vente: number;
    barcode: string | null;
    marque: string | null;
    modele: string | null;
    type: string | null;
    sous_categorie: string | null;
    quantite: number;
    qte_min: number;
    image: string | null;
    updated_at: string;
}

/** Mirrors ClientsService.syncDepuis(). */
export interface OfflineClient {
    id_client: number;
    nom: string;
    telephone: string | null;
    solde: number;
    updated_at: string;
}

/** Mirrors ReparationsService.pickupReady(). */
export interface OfflinePickupReparation {
    id_reparation: number;
    appareil: string | null;
    prix: number;
    statut: string;
    id_client: number | null;
    client_nom: string | null;
    updated_at: string;
}

export type OutboxStatus = 'pending' | 'syncing' | 'failed' | 'synced';

/** One queued offline operation, keyed by a device-generated client_id (the idempotency key the
 *  server uses too for 'vente_checkout' - see VentesService.checkout; 'client_create' relies on
 *  ClientsService.create's own name+phone dedup instead, so no server-side client_id is needed). */
export interface OutboxEntry {
    client_id: string;
    type: 'vente_checkout' | 'client_create';
    payload: any;
    status: OutboxStatus;
    created_at: number;
    id_magasin: number;
    retry_count: number;
    last_error?: string;
    /** Filled in once synced: the server's response. */
    result?: { venteIds?: number[]; avertissements?: string[]; id_client?: number };
}

export interface MetaEntry {
    key: string;
    value: any;
}

/** IndexedDB (via Dexie) - the offline POS's local cache + outbox. Origin-scoped, so it's wiped
 *  entirely on logout (see AuthService.logout) to avoid one account's data leaking into another's
 *  session on the same device/browser. */
@Injectable({ providedIn: 'root' })
export class OfflineDbService extends Dexie {
    articles!: Table<OfflineArticle, number>;
    clients!: Table<OfflineClient, number>;
    reparationsPickup!: Table<OfflinePickupReparation, number>;
    outbox!: Table<OutboxEntry, string>;
    meta!: Table<MetaEntry, string>;

    constructor() {
        super('gsmpro_offline');
        this.version(1).stores({
            articles: 'id_article, barcode, updated_at',
            clients: 'id_client, updated_at',
            reparationsPickup: 'id_reparation, updated_at',
            outbox: 'client_id, status, created_at',
            meta: 'key',
        });
    }

    async getMeta<T = any>(key: string): Promise<T | undefined> {
        const row = await this.meta.get(key);
        return row?.value;
    }

    async setMeta(key: string, value: any): Promise<void> {
        await this.meta.put({ key, value });
    }

    /** Everything local is wiped - called on logout, and before caching a different account's data. */
    async clearAll(): Promise<void> {
        await Promise.all([
            this.articles.clear(),
            this.clients.clear(),
            this.reparationsPickup.clear(),
            this.outbox.clear(),
            this.meta.clear(),
        ]);
    }
}
