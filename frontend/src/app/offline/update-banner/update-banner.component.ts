import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

/** PWA: a small persistent banner the moment a new build has been downloaded in the background -
 *  reloading is the user's choice, never forced (an offline cashier mid-sale must not be
 *  interrupted). Root-level (app.component.ts) so it's visible from every route. */
@Component({
    selector: 'app-update-banner',
    standalone: true,
    imports: [CommonModule, TranslatePipe],
    templateUrl: './update-banner.component.html',
    styleUrls: ['./update-banner.component.css']
})
export class UpdateBannerComponent {
    readonly updateAvailable = signal(false);

    constructor(private swUpdate: SwUpdate) {
        if (this.swUpdate.isEnabled) {
            this.swUpdate.versionUpdates
                .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
                .subscribe(() => this.updateAvailable.set(true));
        }
    }

    reload(): void {
        document.location.reload();
    }
}
