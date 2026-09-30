import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

/** PWA: a small persistent banner the moment a new build is ready to take over - reloading THIS
 *  tab is the user's choice, never forced (an offline cashier mid-sale must not be interrupted).
 *  Root-level (app.component.ts) so it's visible from every route.
 *
 *  Angular's default SW behaviour needs two reloads to actually show new content: one to notice a
 *  new version exists (background download), another to activate it (swap the controller). If the
 *  user doesn't reload at exactly the right moment, they can stay stuck on an old cached build
 *  indefinitely even after many later reopens. So as soon as a new version is ready, we call
 *  activateUpdate() immediately (safe - it only prepares the new SW to control the *next*
 *  navigation, it never touches the page currently on screen) instead of waiting for the banner
 *  click; the banner's reload button is then just a convenience to pick that new version up now
 *  rather than on the next natural reopen. */
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
                .subscribe(() => {
                    this.swUpdate.activateUpdate().catch(() => undefined);
                    this.updateAvailable.set(true);
                });
            this.swUpdate.checkForUpdate().catch(() => undefined);
        }
    }

    reload(): void {
        document.location.reload();
    }
}
