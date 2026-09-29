import { Injectable, effect, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { OfflineDbService, OutboxEntry } from './offline-db.service';
import { ConnectivityService } from './connectivity.service';
import { AuthService } from '../services/auth.service';

export interface SyncWarning {
    client_id: string;
    messages: string[];
}

/** The offline mode's sync engine: pulls reference data incrementally, queues offline sales
 *  (outbox), and replays the outbox once online - auto on reconnect, or via a manual "sync now". */
@Injectable({ providedIn: 'root' })
export class SyncService {
    private apiUrl = environment.apiUrl;

    readonly syncing = signal(false);
    readonly pendingCount = signal(0);
    /** Surfaced once, right after a successful sync, for a toast - e.g. negative-stock warnings. */
    readonly lastWarnings = signal<SyncWarning[]>([]);
    /** Bumped at the end of every syncOutbox() run, whether or not anything changed - lets a page
     *  like PendingOperationsComponent reliably reload every time a sync cycle finishes, even one
     *  that completes before the page ever observes `syncing` transition from true to false. */
    readonly lastSyncAt = signal(0);

    constructor(
        private http: HttpClient,
        private db: OfflineDbService,
        private connectivity: ConnectivityService,
        private auth: AuthService,
    ) {
        this.refreshPendingCount();
        // Auto-sync the moment connectivity comes back.
        effect(() => {
            if (this.connectivity.isOnline() && this.auth.isLoggedIn()) {
                this.syncOutbox();
            }
        });
    }

    async refreshPendingCount(): Promise<void> {
        const n = await this.db.outbox.where('status').anyOf('pending', 'failed', 'syncing').count();
        this.pendingCount.set(n);
    }

    // ── Reference-data pull (articles / clients / reparations ready for pickup) ──

    async pullReferenceData(): Promise<void> {
        if (!this.connectivity.isOnline()) return;
        await Promise.all([this.pullArticles(), this.pullClients(), this.pullPickupReady()]);
    }

    private async pullArticles(): Promise<void> {
        const since = await this.db.getMeta<string>('articles_since');
        const rows = await firstValueFrom(
            this.http.get<any[]>(`${this.apiUrl}/articles/sync`, { params: since ? { since } : {} }),
        ).catch(() => null);
        if (!rows) return;
        if (rows.length) {
            await this.db.articles.bulkPut(rows);
            await this.db.setMeta('articles_since', rows[rows.length - 1].updated_at);
        }
    }

    private async pullClients(): Promise<void> {
        const since = await this.db.getMeta<string>('clients_since');
        const rows = await firstValueFrom(
            this.http.get<any[]>(`${this.apiUrl}/clients/sync`, { params: since ? { since } : {} }),
        ).catch(() => null);
        if (!rows) return;
        if (rows.length) {
            await this.db.clients.bulkPut(rows);
            await this.db.setMeta('clients_since', rows[rows.length - 1].updated_at);
        }
    }

    private async pullPickupReady(): Promise<void> {
        const since = await this.db.getMeta<string>('reparations_since');
        const rows = await firstValueFrom(
            this.http.get<any[]>(`${this.apiUrl}/reparations/pickup-ready`, { params: since ? { since } : {} }),
        ).catch(() => null);
        if (!rows) return;
        for (const row of rows) {
            // No longer ready (picked up meanwhile from another device) -> drop it locally too.
            if (row.statut !== 'Livraison et réception' && row.statut !== 'Terminé') {
                await this.db.reparationsPickup.delete(row.id_reparation);
            } else {
                await this.db.reparationsPickup.put(row);
            }
        }
        if (rows.length) await this.db.setMeta('reparations_since', rows[rows.length - 1].updated_at);
    }

    // ── Outbox ──

    /** Queues an offline sale. Returns the client_id (used as the temporary local reference). */
    async enqueueCheckout(payload: any): Promise<string> {
        const client_id = crypto.randomUUID();
        const entry: OutboxEntry = {
            client_id,
            type: 'vente_checkout',
            payload,
            status: 'pending',
            created_at: Date.now(),
            id_magasin: this.auth.getMagasinId() ?? -1,
            retry_count: 0,
        };
        await this.db.outbox.put(entry);
        await this.refreshPendingCount();
        return client_id;
    }

    async syncOutbox(): Promise<void> {
        if (this.syncing()) return;
        this.syncing.set(true);
        try {
            const entries = await this.db.outbox.where('status').anyOf('pending', 'failed').sortBy('created_at');
            const warnings: SyncWarning[] = [];
            for (const entry of entries) {
                if (!this.connectivity.isOnline()) break;
                await this.db.outbox.update(entry.client_id, { status: 'syncing' });
                try {
                    const res = await firstValueFrom(
                        this.http.post<any[]>(`${this.apiUrl}/ventes/checkout`, { ...entry.payload, client_id: entry.client_id }, { observe: 'response' }),
                    );
                    const venteIds = (res.body || []).map((v: any) => v.id_vente);
                    const header = res.headers.get('X-Vente-Avertissements');
                    const avertissements: string[] = header ? JSON.parse(header) : [];
                    await this.db.outbox.update(entry.client_id, {
                        status: 'synced',
                        result: { venteIds, avertissements },
                    });
                    if (avertissements.length) warnings.push({ client_id: entry.client_id, messages: avertissements });
                } catch (err: any) {
                    await this.db.outbox.update(entry.client_id, {
                        status: 'failed',
                        retry_count: entry.retry_count + 1,
                        last_error: err?.error?.message || err?.message || 'Erreur de synchronisation',
                    });
                }
            }
            if (warnings.length) this.lastWarnings.set(warnings);
            await this.pullReferenceData(); // reconcile local stock/clients with the server's authoritative state
        } finally {
            this.syncing.set(false);
            this.lastSyncAt.set(Date.now());
            await this.refreshPendingCount();
        }
    }

    async retry(client_id: string): Promise<void> {
        await this.db.outbox.update(client_id, { status: 'pending' });
        await this.refreshPendingCount();
        this.syncOutbox();
    }

    /** Only ever removes an entry that already failed - a pending/synced one is never discarded silently. */
    async discard(client_id: string): Promise<void> {
        const entry = await this.db.outbox.get(client_id);
        if (entry?.status === 'failed') {
            await this.db.outbox.delete(client_id);
            await this.refreshPendingCount();
        }
    }

    clearWarnings(): void {
        this.lastWarnings.set([]);
    }
}
