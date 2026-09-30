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

/** One part attached to an in-progress ticket - just enough to decide, offline, whether the
 *  ticket already has every part it needs (see ReparationComponent.peutMarquerPretHorsLigne). */
export interface OfflineReparationItem {
    id_article: number;
    qte: number;
    prix: number;
    sous_categorie: string | null;
}

/** Mirrors ReparationsService.activeSync(). */
export interface OfflineReparationActive {
    id_reparation: number;
    appareil: string | null;
    description: string | null;
    statut: string;
    id_client: number | null;
    client_nom: string | null;
    prix: number;
    date_reception: string | null;
    items: OfflineReparationItem[];
    updated_at: string;
}

export type OutboxStatus = 'pending' | 'syncing' | 'failed' | 'synced';

/** One queued offline operation, keyed by a device-generated client_id (the idempotency key the
 *  server uses too for 'vente_checkout'/'reparation_create' - see VentesService.checkout /
 *  ReparationsService.create; 'client_create' relies on ClientsService.create's own name+phone
 *  dedup instead, and 'reparation_status' on updateStatus's natural idempotency - neither needs a
 *  server-side client_id, though one is still generated as the outbox's own local key). */
export interface OutboxEntry {
    client_id: string;
    type: 'vente_checkout' | 'client_create' | 'reparation_create' | 'reparation_status';
    payload: any;
    status: OutboxStatus;
    created_at: number;
    id_magasin: number;
    retry_count: number;
    last_error?: string;
    /** Filled in once synced: the server's response. */
    result?: { venteIds?: number[]; avertissements?: string[]; id_client?: number; id_reparation?: number };
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
    reparationsActive!: Table<OfflineReparationActive, number>;
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
        // v2: adds the in-progress reparation cache for offline ticket creation/status change (phase 3).
        this.version(2).stores({
            articles: 'id_article, barcode, updated_at',
            clients: 'id_client, updated_at',
            reparationsPickup: 'id_reparation, updated_at',
            reparationsActive: 'id_reparation, updated_at',
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
            this.reparationsActive.clear(),
            this.outbox.clear(),
            this.meta.clear(),
        ]);
    }
}
