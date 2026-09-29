import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { SyncService } from '../sync.service';

/** Surfaces warnings from a just-completed sync (e.g. "stock became negative for X") - the
 *  clear, non-silent message the plan requires for that case. Root-level so it's visible
 *  regardless of which page the store owner happens to be on when the sync completes. */
@Component({
    selector: 'app-sync-warnings-banner',
    standalone: true,
    imports: [CommonModule, TranslatePipe],
    templateUrl: './sync-warnings-banner.component.html',
    styleUrls: ['./sync-warnings-banner.component.css']
})
export class SyncWarningsBannerComponent {
    constructor(public sync: SyncService) { }

    dismiss(): void {
        this.sync.clearWarnings();
    }
}
