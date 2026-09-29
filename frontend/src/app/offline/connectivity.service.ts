import { Injectable, signal } from '@angular/core';

/** Wraps navigator.onLine + the browser's online/offline events as a signal every offline-aware
 *  piece of the app reads instead of touching navigator.onLine directly. */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
    readonly isOnline = signal(navigator.onLine);

    constructor() {
        window.addEventListener('online', () => this.isOnline.set(true));
        window.addEventListener('offline', () => this.isOnline.set(false));
    }
}
