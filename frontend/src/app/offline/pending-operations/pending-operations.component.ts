import { Component, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { OfflineDbService, OutboxEntry } from '../offline-db.service';
import { SyncService } from '../sync.service';
import { ConnectivityService } from '../connectivity.service';

@Component({
    selector: 'app-pending-operations',
    standalone: true,
    imports: [CommonModule, TranslatePipe],
    templateUrl: './pending-operations.component.html',
    styleUrls: ['./pending-operations.component.css']
})
export class PendingOperationsComponent implements OnInit {
    entries: OutboxEntry[] = [];
    loading = false;

    constructor(private db: OfflineDbService, public sync: SyncService, public connectivity: ConnectivityService) {
        // The auto-sync effect (SyncService) can run in the background at any time - e.g. right on
        // app load, before the user ever opens this page, or while they're already looking at it,
        // sometimes finishing before this component even mounts. lastSyncAt changes on every run
        // (unlike `syncing`, which this page could easily miss the true->false transition of), so
        // reacting to it is what keeps this list from ever showing a stale snapshot.
        effect(() => {
            this.sync.lastSyncAt();
            this.load();
        });
    }

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        this.loading = true;
        this.entries = await this.db.outbox.orderBy('created_at').reverse().toArray();
        this.loading = false;
    }

    cartTotal(entry: OutboxEntry): number {
        return (entry.payload.items || []).reduce((s: number, i: any) => s + (i.qte || 0) * (i.prix || 0), 0);
    }

    statusClass(status: string): string {
        if (status === 'synced') return 'status-done';
        if (status === 'failed') return 'status-failed';
        if (status === 'syncing') return 'status-syncing';
        return 'status-pending';
    }

    async retry(entry: OutboxEntry): Promise<void> {
        await this.sync.retry(entry.client_id);
        await this.load();
    }

    async discard(entry: OutboxEntry): Promise<void> {
        await this.sync.discard(entry.client_id);
        await this.load();
    }

    syncNow(): void {
        this.sync.syncOutbox().then(() => this.load());
    }
}
