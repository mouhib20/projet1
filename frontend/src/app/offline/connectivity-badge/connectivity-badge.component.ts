import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ConnectivityService } from '../connectivity.service';
import { SyncService } from '../sync.service';

@Component({
    selector: 'app-connectivity-badge',
    standalone: true,
    imports: [CommonModule, TranslatePipe],
    templateUrl: './connectivity-badge.component.html',
    styleUrls: ['./connectivity-badge.component.css']
})
export class ConnectivityBadgeComponent {
    constructor(public connectivity: ConnectivityService, public sync: SyncService, private router: Router) { }

    syncNow(): void {
        this.sync.syncOutbox();
    }

    openPending(): void {
        this.router.navigate(['/vente/operations-en-attente']);
    }
}
