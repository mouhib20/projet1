import { Injectable, BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

export interface Acteur {
    id: number | null;
    nom: string;
    role: string;
}

export type TypeMouvement = 'entree' | 'sortie';
export type SourceMouvement = 'manuel' | 'vente' | 'reparation' | 'depot_client' | 'charge' | 'retour' | 'paiement_fournisseur';

/** Roles allowed to open the drawer, move cash and close it. Visitors are read-only elsewhere. */
const ROLES_CAISSE = ['admin', 'vendeur', 'vendeuse'];

const num = (v: unknown): number => Number(v) || 0;
const arrondi = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Cash drawer, built around sessions: it is opened with a counted float, every cash movement
 * (sales, deposits, expenses, refunds, manual in/out with a reason) is a row of one ledger,
 * and closing compares the counted amount with the expected one.
 */
@Injectable()
export class CaisseService {
    private readonly logger = new Logger(CaisseService.name);

    constructor(
        private readonly dataSource: DataSource,
        private readonly jwt: JwtService,
    ) { }

    // ── Who is calling ───────────────────────────────────────────

    /** The logged-in user from the Bearer token; throws when there is none. */
    async acteurRequis(authorization?: string): Promise<Acteur> {
        const token = (authorization || '').replace(/^Bearer\s+/i, '');
        if (!token) throw new UnauthorizedException('Connexion requise.');
        let payload: any;
        try {
            payload = this.jwt.verify(token);
        } catch {
            throw new UnauthorizedException('Session expirée, reconnectez-vous.');
        }
        const [u] = await this.dataSource.query(`SELECT nom FROM utilisateurs WHERE id = $1`, [payload.sub]);
        return { id: payload.sub ?? null, nom: u?.nom || payload.username || 'Inconnu', role: payload.role };
    }

    /** Same, but never fails: automatic cash entries must not break a sale or a deposit. */
    async acteurOuSysteme(authorization?: string): Promise<Acteur> {
        try {
            return await this.acteurRequis(authorization);
        } catch {
            return { id: null, nom: 'Système', role: 'systeme' };
        }
    }

    exigerRole(acteur: Acteur): void {
        if (!ROLES_CAISSE.includes(acteur.role)) {
            throw new ForbiddenException("Vous n'avez pas le droit d'utiliser la caisse.");
        }
    }

    // ── Sessions ─────────────────────────────────────────────────

    private async sessionOuverte(): Promise<any | null> {
        const [s] = await this.dataSource.query(`SELECT * FROM caisse_session WHERE statut = 'ouverte'`);
        return s || null;
    }

    private async totaux(idSession: number): Promise<{ entrees: number; sorties: number }> {
        const [t] = await this.dataSource.query(
            `SELECT COALESCE(SUM(montant) FILTER (WHERE type = 'entree'), 0) AS entrees,
                    COALESCE(SUM(montant) FILTER (WHERE type = 'sortie'), 0) AS sorties
             FROM caisse_mouvement WHERE id_session = $1 AND avant_ouverture = false`,
            [idSession],
        );
        return { entrees: num(t.entrees), sorties: num(t.sorties) };
    }

    /** What should be in the drawer right now for an open session. */
    private async attendu(session: any): Promise<number> {
        const t = await this.totaux(session.id);
        return arrondi(num(session.fond_ouverture) + t.entrees - t.sorties);
    }

    /** Expected float when opening: what was left at the last close, plus cash moved while closed. */
    private async fondAttenduOuverture(): Promise<{ fondLaisse: number; horsSession: number }> {
        const [prev] = await this.dataSource.query(
            `SELECT fond_laisse FROM caisse_session WHERE statut = 'fermee' ORDER BY ferme_le DESC, id DESC LIMIT 1`,
        );
        const [orph] = await this.dataSource.query(
            `SELECT COALESCE(SUM(CASE WHEN type = 'entree' THEN montant ELSE -montant END), 0) AS net
             FROM caisse_mouvement WHERE id_session IS NULL`,
        );
        return { fondLaisse: num(prev?.fond_laisse), horsSession: num(orph.net) };
    }

    async getStatus(acteur: Acteur) {
        this.exigerRole(acteur);
        const session = await this.sessionOuverte();
        if (!session) {
            const f = await this.fondAttenduOuverture();
            return {
                ouverte: false,
                session: null,
                fondAttenduOuverture: arrondi(f.fondLaisse + f.horsSession),
                horsSession: f.horsSession,
            };
        }
        const t = await this.totaux(session.id);
        const mouvements = await this.dataSource.query(
            `SELECT id, type, source, montant, motif, reference, avant_ouverture, par_nom, cree_le
             FROM caisse_mouvement WHERE id_session = $1 ORDER BY id DESC`,
            [session.id],
        );
        return {
            ouverte: true,
            session,
            entrees: t.entrees,
            sorties: t.sorties,
            attendu: arrondi(num(session.fond_ouverture) + t.entrees - t.sorties),
            mouvements,
        };
    }

    async ouvrir(acteur: Acteur, fondCompte: number) {
        this.exigerRole(acteur);
        if (typeof fondCompte !== 'number' || !isFinite(fondCompte) || fondCompte < 0) {
            throw new BadRequestException("Le fond de caisse compté est invalide.");
        }
        if (await this.sessionOuverte()) {
            throw new BadRequestException('La caisse est déjà ouverte.');
        }
        const f = await this.fondAttenduOuverture();
        return this.dataSource.transaction(async (m) => {
            const [s] = await m.query(
                `INSERT INTO caisse_session (ouvert_par_id, ouvert_par_nom, fond_attendu_ouverture, fond_ouverture)
                 VALUES ($1, $2, $3, $4) RETURNING *`,
                [acteur.id, acteur.nom, arrondi(f.fondLaisse + f.horsSession), fondCompte],
            );
            // Cash moved while the drawer was closed is part of the float that was just counted
            await m.query(
                `UPDATE caisse_mouvement SET id_session = $1, avant_ouverture = true WHERE id_session IS NULL`,
                [s.id],
            );
            return s;
        });
    }

    async fermer(acteur: Acteur, data: { montant_compte: number; fond_laisse: number; note?: string }) {
        this.exigerRole(acteur);
        const session = await this.sessionOuverte();
        if (!session) throw new BadRequestException("La caisse n'est pas ouverte.");
        if (acteur.role !== 'admin' && session.ouvert_par_id !== acteur.id) {
            throw new ForbiddenException(`Seul ${session.ouvert_par_nom} (ou un administrateur) peut fermer cette caisse.`);
        }
        const { montant_compte, fond_laisse } = data;
        if (typeof montant_compte !== 'number' || !isFinite(montant_compte) || montant_compte < 0) {
            throw new BadRequestException('Le montant compté est invalide.');
        }
        if (typeof fond_laisse !== 'number' || !isFinite(fond_laisse) || fond_laisse < 0) {
            throw new BadRequestException('Le fond remis en caisse est invalide.');
        }
        if (fond_laisse > montant_compte) {
            throw new BadRequestException('Le fond remis en caisse ne peut pas dépasser le montant compté.');
        }
        const attendu = await this.attendu(session);
        const ecart = arrondi(montant_compte - attendu);
        // TypeORM returns [rows, affectedCount] for UPDATE ... RETURNING on Postgres
        const res = await this.dataSource.query(
            `UPDATE caisse_session
             SET statut = 'fermee', ferme_par_id = $1, ferme_par_nom = $2, ferme_le = now(),
                 montant_attendu = $3, montant_compte = $4, ecart = $5, fond_laisse = $6, note = $7
             WHERE id = $8 AND statut = 'ouverte' RETURNING *`,
            [acteur.id, acteur.nom, attendu, montant_compte, ecart, fond_laisse, (data.note || '').trim() || null, session.id],
        );
        const closed = (Array.isArray(res[0]) ? res[0] : res)[0];
        if (!closed) throw new BadRequestException('La caisse a déjà été fermée.');
        return closed;
    }

    // ── Movements ────────────────────────────────────────────────

    /** Manual cash in/out. A reason is mandatory, and the drawer must be open. */
    async mouvementManuel(acteur: Acteur, data: { type: TypeMouvement; montant: number; motif: string }) {
        this.exigerRole(acteur);
        if (data.type !== 'entree' && data.type !== 'sortie') throw new BadRequestException('Type de mouvement invalide.');
        if (typeof data.montant !== 'number' || !isFinite(data.montant) || data.montant <= 0) {
            throw new BadRequestException('Le montant doit être supérieur à 0.');
        }
        const motif = (data.motif || '').trim();
        if (!motif) throw new BadRequestException('Indiquez le motif (ex: paiement fournisseur, dépense imprévue).');
        const session = await this.sessionOuverte();
        if (!session) throw new BadRequestException("Ouvrez la caisse avant d'enregistrer un mouvement.");
        if (data.type === 'sortie') {
            const attendu = await this.attendu(session);
            if (data.montant > attendu) {
                throw new BadRequestException(`Sortie impossible : il n'y a que ${attendu} en caisse.`);
            }
        }
        const [row] = await this.dataSource.query(
            `INSERT INTO caisse_mouvement (id_session, type, source, montant, motif, par_id, par_nom)
             VALUES ($1, $2, 'manuel', $3, $4, $5, $6) RETURNING *`,
            [session.id, data.type, data.montant, motif, acteur.id, acteur.nom],
        );
        return row;
    }

    /**
     * Called by sales, repairs, client deposits and expenses: the movement lands in the open
     * session, or waits (no session) to be counted in the float at the next opening.
     * Never throws — cash bookkeeping must not break the operation that triggered it.
     */
    async enregistrerAuto(
        acteur: Acteur,
        m: { type: TypeMouvement; source: SourceMouvement; montant: number; motif: string; reference?: string },
    ): Promise<void> {
        const montant = arrondi(num(m.montant));
        if (montant <= 0) return;
        try {
            const session = await this.sessionOuverte();
            await this.dataSource.query(
                `INSERT INTO caisse_mouvement (id_session, type, source, montant, motif, reference, par_id, par_nom)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [session?.id ?? null, m.type, m.source, montant, m.motif.slice(0, 255), m.reference ?? null, acteur.id, acteur.nom],
            );
        } catch (err) {
            this.logger.error(`Mouvement de caisse non enregistré (${m.source}: ${m.motif})`, err as Error);
        }
    }

    // ── History and reports ──────────────────────────────────────

    async historique(acteur: Acteur) {
        this.exigerRole(acteur);
        const seulement = acteur.role === 'admin' ? '' : 'WHERE ouvert_par_id = $1';
        return this.dataSource.query(
            `SELECT * FROM caisse_session ${seulement} ORDER BY id DESC LIMIT 60`,
            acteur.role === 'admin' ? [] : [acteur.id],
        );
    }

    async mouvementsDeSession(acteur: Acteur, idSession: number) {
        this.exigerRole(acteur);
        const [s] = await this.dataSource.query(`SELECT * FROM caisse_session WHERE id = $1`, [idSession]);
        if (!s) throw new NotFoundException(`Session #${idSession} introuvable`);
        if (acteur.role !== 'admin' && s.ouvert_par_id !== acteur.id) {
            throw new ForbiddenException('Vous ne pouvez voir que vos propres sessions.');
        }
        const mouvements = await this.dataSource.query(
            `SELECT id, type, source, montant, motif, reference, avant_ouverture, par_nom, cree_le
             FROM caisse_mouvement WHERE id_session = $1 ORDER BY id`,
            [idSession],
        );
        return { session: s, mouvements };
    }

    /** Daily report per employee: what each one took in and paid out, and the sessions of that day. */
    async rapport(acteur: Acteur, date: string, tz?: string) {
        this.exigerRole(acteur);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new BadRequestException('Date invalide (AAAA-MM-JJ).');
        let zone = 'UTC';
        if (tz) {
            const [ok] = await this.dataSource.query(`SELECT 1 AS ok FROM pg_timezone_names WHERE name = $1`, [tz]);
            if (ok) zone = tz;
        }
        const seulement = acteur.role === 'admin' ? '' : 'AND par_id = $3';
        const params: any[] = [date, zone];
        if (acteur.role !== 'admin') params.push(acteur.id);

        const employes = await this.dataSource.query(
            `SELECT par_nom AS employe,
                COALESCE(SUM(montant) FILTER (WHERE source = 'vente'), 0) AS ventes,
                COALESCE(SUM(montant) FILTER (WHERE source IN ('reparation', 'depot_client')), 0) AS acomptes_depots,
                COALESCE(SUM(montant) FILTER (WHERE source = 'manuel' AND type = 'entree'), 0) AS entrees_manuelles,
                COALESCE(SUM(montant) FILTER (WHERE source = 'manuel' AND type = 'sortie'), 0) AS sorties_manuelles,
                COALESCE(SUM(montant) FILTER (WHERE source IN ('charge', 'paiement_fournisseur') AND type = 'sortie'), 0) AS depenses,
                COALESCE(SUM(montant) FILTER (WHERE source = 'retour'), 0) AS retours,
                COALESCE(SUM(CASE WHEN type = 'entree' THEN montant ELSE -montant END), 0) AS net,
                COUNT(*) AS nb_mouvements
             FROM caisse_mouvement
             WHERE (cree_le AT TIME ZONE $2)::date = $1::date ${seulement}
             GROUP BY par_nom ORDER BY par_nom`,
            params,
        );
        const sessions = await this.dataSource.query(
            `SELECT id, statut, ouvert_par_nom, ouvert_le, ferme_par_nom, ferme_le, fond_ouverture, fond_attendu_ouverture,
                    montant_attendu, montant_compte, ecart, fond_laisse
             FROM caisse_session
             WHERE (ouvert_le AT TIME ZONE $2)::date = $1::date ${acteur.role === 'admin' ? '' : 'AND ouvert_par_id = $3'}
             ORDER BY id`,
            params,
        );
        return { date, employes, sessions };
    }
}
