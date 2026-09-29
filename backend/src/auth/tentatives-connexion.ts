/**
 * Simple in-memory sliding-window counter, keyed by an arbitrary string.
 * Used to rate-limit login attempts along several independent dimensions at once
 * (per IP+username, per username alone, per IP alone) so that neither rotating IPs
 * nor username-spraying from one IP can bypass the limit.
 */
export class CompteurFenetre {
    private readonly entrees = new Map<string, { n: number; debut: number }>();

    constructor(private readonly max: number, private readonly fenetreMs: number) { }

    /** True if this key is currently blocked (has already reached the limit for this window). */
    bloque(cle: string): boolean {
        const e = this.entrees.get(cle);
        if (!e) return false;
        if (Date.now() - e.debut > this.fenetreMs) {
            this.entrees.delete(cle);
            return false;
        }
        return e.n >= this.max;
    }

    /** Records one more failure for this key. */
    enregistrerEchec(cle: string): void {
        const now = Date.now();
        const e = this.entrees.get(cle);
        if (!e || now - e.debut > this.fenetreMs) {
            this.entrees.set(cle, { n: 1, debut: now });
        } else {
            e.n += 1;
        }
    }

    /** Clears this key (a successful login resets its own IP+username counter). */
    reinitialiser(cle: string): void {
        this.entrees.delete(cle);
    }
}
