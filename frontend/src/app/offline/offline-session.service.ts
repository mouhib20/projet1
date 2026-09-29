import { Injectable } from '@angular/core';

const KEY = 'offline_last_online_login_at';
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Governs how long a device may keep creating NEW offline sales after its last successful online
 * login, independent of the JWT's own (much shorter, 8h) expiry - see the plan's rationale: being
 * offline needs no network call at all, so no token is required for that; only SYNCING needs one,
 * and syncing naturally forces a fresh login if the cached token has expired. This is a separate,
 * purely client-side policy layer on top of that.
 */
@Injectable({ providedIn: 'root' })
export class OfflineSessionService {
    /** Called by AuthService right after a successful online login. */
    markOnlineLogin(): void {
        localStorage.setItem(KEY, String(Date.now()));
    }

    clear(): void {
        localStorage.removeItem(KEY);
    }

    private lastOnlineLoginAt(): number | null {
        const raw = localStorage.getItem(KEY);
        return raw ? Number(raw) : null;
    }

    /** False once more than 7 days have passed since the last time this device logged in online. */
    isOfflineCapable(): boolean {
        const last = this.lastOnlineLoginAt();
        if (last == null) return false;
        return Date.now() - last < WINDOW_MS;
    }

    daysRemaining(): number {
        const last = this.lastOnlineLoginAt();
        if (last == null) return 0;
        const remainingMs = WINDOW_MS - (Date.now() - last);
        return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
    }
}
