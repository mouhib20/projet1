import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CaisseService } from '../caisse/caisse.service';

export type Periode = 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface Filtres {
    periode: Periode;
    dateDebut?: string;
    dateFin?: string;
    idPartType?: number;
    idBrand?: number;
    wilaya?: string;
}

/** How far back the nightly rebuild recomputes - comfortably covers the "year" filter with margin,
 *  without ever having to rebuild the whole table's history on every run. */
const FENETRE_RECALCUL_JOURS = 400;

@Injectable()
export class AdminAnalyticsService {
    private readonly logger = new Logger(AdminAnalyticsService.name);

    constructor(
        private readonly dataSource: DataSource,
        private readonly caisseService: CaisseService,
    ) { }

    // ── Access check ────────────────────────────────────────────

    private async superAdminRequis(authorization?: string): Promise<void> {
        const acteur = await this.caisseService.acteurRequis(authorization);
        if (acteur.role !== 'super_admin') throw new ForbiddenException('Action réservée à un super administrateur.');
    }

    // ── Period → calendar bounds ─────────────────────────────────

    private bornesPeriode(f: Filtres): { debut: string; fin: string } {
        if (f.periode === 'custom') {
            if (!f.dateDebut || !f.dateFin) throw new ForbiddenException('dateDebut et dateFin sont obligatoires pour une période personnalisée.');
            return { debut: f.dateDebut, fin: f.dateFin };
        }
        const fin = new Date();
        const debut = new Date(fin);
        if (f.periode === 'week') debut.setDate(debut.getDate() - 7);
        else if (f.periode === 'month') debut.setDate(debut.getDate() - 30);
        else if (f.periode === 'quarter') debut.setDate(debut.getDate() - 90);
        else debut.setFullYear(debut.getFullYear() - 1);
        return { debut: debut.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) };
    }

    /** Number of whole months the period spans (minimum 1) - used for the "suggested monthly
     *  quantity" in the wholesale-restock tab, so a 7-day period doesn't suggest a tiny fraction. */
    private moisDansPeriode(debut: string, fin: string): number {
        const jours = (new Date(fin).getTime() - new Date(debut).getTime()) / 86_400_000;
        return Math.max(1, Math.round(jours / 30));
    }

    // ── Nightly rebuild of analytics_resume_quotidien ────────────

    /** Rebuilds the rolling window from the raw tables. Public (not just @Cron) so a manual
     *  "recalculer maintenant" action - or a test - can trigger it without waiting for 4am. */
    async recalculerResumeQuotidien(authorization?: string): Promise<{ fenetreJours: number }> {
        if (authorization !== undefined) await this.superAdminRequis(authorization);
        const depuis = new Date();
        depuis.setDate(depuis.getDate() - FENETRE_RECALCUL_JOURS);
        const depuisStr = depuis.toISOString().slice(0, 10);

        await this.dataSource.transaction(async (m) => {
            await m.query(`DELETE FROM analytics_resume_quotidien WHERE date_jour >= $1`, [depuisStr]);

            await m.query(
                `INSERT INTO analytics_resume_quotidien (date_jour, id_group, id_magasin, qte_vendue, montant_vente_total, prix_vente_min, prix_vente_max)
                 SELECT v.date, a.compat_group_id, v.id_magasin, SUM(v.qte), SUM(v.qte * v.prix), MIN(v.prix), MAX(v.prix)
                   FROM vente v JOIN article a ON a.id_article = v.id_article
                  WHERE a.compat_group_id IS NOT NULL AND v.date >= $1
                  GROUP BY v.date, a.compat_group_id, v.id_magasin
                 ON CONFLICT (date_jour, id_group, id_magasin) DO UPDATE SET
                    qte_vendue = EXCLUDED.qte_vendue, montant_vente_total = EXCLUDED.montant_vente_total,
                    prix_vente_min = EXCLUDED.prix_vente_min, prix_vente_max = EXCLUDED.prix_vente_max`,
                [depuisStr],
            );

            await m.query(
                `INSERT INTO analytics_resume_quotidien (date_jour, id_group, id_magasin, qte_reparation)
                 SELECT r.date_reception, a.compat_group_id, ri.id_magasin, SUM(ri.qte)
                   FROM reparation_item ri
                   JOIN reparation r ON r.id_reparation = ri.id_reparation
                   JOIN article a ON a.id_article = ri.id_article
                  WHERE a.compat_group_id IS NOT NULL AND r.date_reception IS NOT NULL AND r.date_reception >= $1
                  GROUP BY r.date_reception, a.compat_group_id, ri.id_magasin
                 ON CONFLICT (date_jour, id_group, id_magasin) DO UPDATE SET qte_reparation = EXCLUDED.qte_reparation`,
                [depuisStr],
            );

            await m.query(
                `INSERT INTO analytics_resume_quotidien (date_jour, id_group, id_magasin, montant_achat_total, qte_achat_total, prix_achat_min, prix_achat_max)
                 SELECT mv.date_mouvement, a.compat_group_id, mv.id_magasin, SUM(mv.qte * mv.prix), SUM(mv.qte), MIN(mv.prix), MAX(mv.prix)
                   FROM mouvement_achat mv JOIN article a ON a.id_article = mv.id_article
                  WHERE a.compat_group_id IS NOT NULL AND mv.date_mouvement >= $1
                  GROUP BY mv.date_mouvement, a.compat_group_id, mv.id_magasin
                 ON CONFLICT (date_jour, id_group, id_magasin) DO UPDATE SET
                    montant_achat_total = EXCLUDED.montant_achat_total, qte_achat_total = EXCLUDED.qte_achat_total,
                    prix_achat_min = EXCLUDED.prix_achat_min, prix_achat_max = EXCLUDED.prix_achat_max`,
                [depuisStr],
            );
        });

        this.logger.log(`Résumé quotidien recalculé (fenêtre de ${FENETRE_RECALCUL_JOURS} jours).`);
        return { fenetreJours: FENETRE_RECALCUL_JOURS };
    }

    @Cron(CronExpression.EVERY_DAY_AT_4AM)
    async recalculNocturne(): Promise<void> {
        await this.recalculerResumeQuotidien();
    }

    // ── Tab 1 / 2: top parts (and screens, a filtered view of the same shape) ───

    /** One row per compat_group - "nb_magasins" only counts stores that actually SOLD it (matches
     *  the spec's own acceptance criterion), not ones that merely used it in a repair. */
    async topPieces(filtres: Filtres, authorization?: string): Promise<any[]> {
        await this.superAdminRequis(authorization);
        const { debut, fin } = this.bornesPeriode(filtres);
        return this.dataSource.query(
            `SELECT cg.id AS id_group, pt.id AS id_part_type, pt.nom_fr, pt.nom_en, pt.nom_ar,
                    b.nom AS marque, dm.nom AS modele, dm.image,
                    COALESCE(SUM(r.qte_vendue), 0)::int AS qte_vendue,
                    COALESCE(SUM(r.qte_reparation), 0)::int AS qte_reparation,
                    COUNT(DISTINCT CASE WHEN r.qte_vendue > 0 THEN r.id_magasin END)::int AS nb_magasins,
                    CASE WHEN SUM(r.qte_achat_total) > 0 THEN ROUND(SUM(r.montant_achat_total) / SUM(r.qte_achat_total), 2) END AS prix_achat_moyen,
                    MIN(r.prix_achat_min) AS prix_achat_min,
                    MAX(r.prix_achat_max) AS prix_achat_max,
                    CASE WHEN SUM(r.qte_vendue) > 0 THEN ROUND(SUM(r.montant_vente_total) / SUM(r.qte_vendue), 2) END AS prix_vente_moyen,
                    MIN(r.prix_vente_min) AS prix_vente_min,
                    MAX(r.prix_vente_max) AS prix_vente_max
               FROM analytics_resume_quotidien r
               JOIN compat_group cg ON cg.id = r.id_group
               JOIN part_type pt ON pt.id = cg.id_part_type
               LEFT JOIN device_model dm ON dm.id = cg.id_base_model
               LEFT JOIN brand b ON b.id = dm.id_brand
               LEFT JOIN magasin mag ON mag.id_magasin = r.id_magasin
              WHERE r.date_jour BETWEEN $1 AND $2
                AND ($3::int IS NULL OR pt.id = $3)
                AND ($4::int IS NULL OR b.id = $4)
                AND ($5::text IS NULL OR mag.wilaya = $5)
              GROUP BY cg.id, pt.id, pt.nom_fr, pt.nom_en, pt.nom_ar, b.nom, dm.nom, dm.image
              ORDER BY qte_vendue DESC, qte_reparation DESC`,
            [debut, fin, filtres.idPartType ?? null, filtres.idBrand ?? null, filtres.wilaya ?? null],
        );
    }

    /** Tab 2: same shape as topPieces, forced to the "Afficheur" part type, plus how many device
     *  models each screen fits - the screen that fits many devices AND sells a lot is the priority. */
    async ecrans(filtres: Filtres, authorization?: string): Promise<any[]> {
        await this.superAdminRequis(authorization);
        const lignes = await this.topPieces({ ...filtres, idPartType: undefined }, authorization);
        const afficheur = lignes.filter((l) => /afficheur|display/i.test(l.nom_en) || /afficheur/i.test(l.nom_fr));
        if (!afficheur.length) return [];
        const ids = afficheur.map((l) => l.id_group);
        const comptes = await this.dataSource.query(
            `SELECT id_group, COUNT(*)::int AS nb_modeles_compatibles FROM compat_group_model WHERE id_group = ANY($1) GROUP BY id_group`,
            [ids],
        );
        const parGroupe = new Map<number, number>(comptes.map((c: any) => [c.id_group, c.nb_modeles_compatibles]));
        return afficheur.map((l) => ({ ...l, nb_modeles_compatibles: parGroupe.get(l.id_group) ?? 0 }));
    }

    /** Numeric month-by-month breakdown for one part's detail drill-down (no chart, per request). */
    async detailPiece(idGroup: number, filtres: Filtres, authorization?: string): Promise<{ parMois: any[]; fournisseurs: any[] }> {
        await this.superAdminRequis(authorization);
        const { debut, fin } = this.bornesPeriode(filtres);
        const parMois = await this.dataSource.query(
            `SELECT to_char(date_trunc('month', r.date_jour), 'YYYY-MM') AS mois,
                    COALESCE(SUM(r.qte_vendue), 0)::int AS qte_vendue,
                    COALESCE(SUM(r.qte_reparation), 0)::int AS qte_reparation,
                    COUNT(DISTINCT CASE WHEN r.qte_vendue > 0 THEN r.id_magasin END)::int AS nb_magasins
               FROM analytics_resume_quotidien r
              WHERE r.id_group = $1 AND r.date_jour BETWEEN $2 AND $3
              GROUP BY date_trunc('month', r.date_jour)
              ORDER BY date_trunc('month', r.date_jour)`,
            [idGroup, debut, fin],
        );
        const fournisseurs = await this.fournisseursPourGroupe(idGroup, debut, fin);
        return { parMois, fournisseurs };
    }

    private async fournisseursPourGroupe(idGroup: number, debut: string, fin: string): Promise<any[]> {
        return this.dataSource.query(
            `SELECT f.tel AS telephone,
                    (array_agg(f.nom ORDER BY mv.date_mouvement DESC))[1] AS nom,
                    ROUND(AVG(mv.prix), 2) AS prix_moyen,
                    COUNT(DISTINCT mv.id_magasin)::int AS nb_magasins,
                    MAX(mv.date_mouvement) AS derniere_date
               FROM mouvement_achat mv
               JOIN fournisseur f ON f.id_fournisseur = mv.id_fournisseur
               JOIN article a ON a.id_article = mv.id_article
              WHERE a.compat_group_id = $1 AND mv.date_mouvement BETWEEN $2 AND $3 AND f.tel IS NOT NULL AND f.tel != ''
              GROUP BY f.tel
              ORDER BY prix_moyen ASC`,
            [idGroup, debut, fin],
        );
    }

    // ── Tab 3: suppliers, deduped across stores by phone number ───

    /** Each store has its own fournisseur row (not shared data) - the same real supplier appears
     *  once per store it sells to, so this dedups by phone number (the only identifier that can
     *  realistically be the same across two stores' independently-entered records). Flags the
     *  cheapest row per part with "moins_cher" for the frontend to highlight. */
    async fournisseurs(filtres: Filtres, authorization?: string): Promise<any[]> {
        await this.superAdminRequis(authorization);
        const { debut, fin } = this.bornesPeriode(filtres);
        const lignes = await this.dataSource.query(
            `SELECT f.tel AS telephone,
                    (array_agg(f.nom ORDER BY mv.date_mouvement DESC))[1] AS nom,
                    cg.id AS id_group, pt.nom_fr, pt.nom_en, pt.nom_ar, b.nom AS marque, dm.nom AS modele,
                    ROUND(AVG(mv.prix), 2) AS prix_moyen,
                    COUNT(DISTINCT mv.id_magasin)::int AS nb_magasins,
                    MAX(mv.date_mouvement) AS derniere_date
               FROM mouvement_achat mv
               JOIN fournisseur f ON f.id_fournisseur = mv.id_fournisseur
               JOIN article a ON a.id_article = mv.id_article
               JOIN compat_group cg ON cg.id = a.compat_group_id
               JOIN part_type pt ON pt.id = cg.id_part_type
               LEFT JOIN device_model dm ON dm.id = cg.id_base_model
               LEFT JOIN brand b ON b.id = dm.id_brand
               LEFT JOIN magasin mag ON mag.id_magasin = mv.id_magasin
              WHERE a.compat_group_id IS NOT NULL AND mv.date_mouvement BETWEEN $1 AND $2
                AND f.tel IS NOT NULL AND f.tel != ''
                AND ($3::int IS NULL OR pt.id = $3)
                AND ($4::int IS NULL OR b.id = $4)
                AND ($5::text IS NULL OR mag.wilaya = $5)
              GROUP BY f.tel, cg.id, pt.id, pt.nom_fr, pt.nom_en, pt.nom_ar, b.nom, dm.nom
              ORDER BY f.tel, prix_moyen ASC`,
            [debut, fin, filtres.idPartType ?? null, filtres.idBrand ?? null, filtres.wilaya ?? null],
        );
        const moinsCherParGroupe = new Map<number, number>();
        for (const l of lignes) {
            const courant = moinsCherParGroupe.get(l.id_group);
            if (courant === undefined || l.prix_moyen < courant) moinsCherParGroupe.set(l.id_group, l.prix_moyen);
        }
        return lignes.map((l: any) => ({ ...l, moins_cher: l.prix_moyen === moinsCherParGroupe.get(l.id_group) }));
    }

    // ── Tab 4: what to stock wholesale ────────────────────────────

    /** Scored recommendation list. The score is a simple, documented weighted sum - not a hidden
     *  formula - combining actual consumption with unmet demand signals, so it's easy to adjust the
     *  weights later without changing the shape of the data. */
    async recommandationsGros(filtres: Filtres, authorization?: string): Promise<any[]> {
        await this.superAdminRequis(authorization);
        const { debut, fin } = this.bornesPeriode(filtres);
        const pieces = await this.topPieces(filtres, authorization);
        if (!pieces.length) return [];

        const ids = pieces.map((p) => p.id_group);
        const [recherches, modeles, moinsChers] = await Promise.all([
            this.dataSource.query(
                `SELECT cgm.id_group, COUNT(*)::int AS nb_recherches, COUNT(DISTINCT rs.id_magasin)::int AS nb_magasins_demande
                   FROM recherche_sans_stock rs
                   JOIN compat_group_model cgm ON cgm.id_model = rs.id_model
                   JOIN compat_group cg ON cg.id = cgm.id_group AND cg.id_part_type = rs.id_part_type
                  WHERE cgm.id_group = ANY($1) AND rs.date_creation BETWEEN $2 AND $3
                  GROUP BY cgm.id_group`,
                [ids, debut, fin],
            ),
            this.dataSource.query(
                `SELECT id_group, COUNT(*)::int AS nb_modeles_compatibles FROM compat_group_model WHERE id_group = ANY($1) GROUP BY id_group`,
                [ids],
            ),
            Promise.all(ids.map(async (id) => ({ id_group: id, fournisseurs: await this.fournisseursPourGroupe(id, debut, fin) }))),
        ]);

        const parRecherches = new Map<number, { nb_recherches: number; nb_magasins_demande: number }>(
            recherches.map((r: any) => [r.id_group, r]),
        );
        const parModeles = new Map<number, number>(modeles.map((m: any) => [m.id_group, m.nb_modeles_compatibles]));
        const parFournisseurs = new Map<number, any[]>(moinsChers.map((m: any) => [m.id_group, m.fournisseurs]));
        const nbMois = this.moisDansPeriode(debut, fin);

        return pieces
            .map((p) => {
                const r = parRecherches.get(p.id_group) ?? { nb_recherches: 0, nb_magasins_demande: 0 };
                const nbModeles = parModeles.get(p.id_group) ?? 0;
                const fournisseursPiece = parFournisseurs.get(p.id_group) ?? [];
                const consommation = p.qte_vendue + p.qte_reparation;
                // Weights: consumption counts most (it's real, already-happened usage), an unmet
                // search is the clearest "I needed this and didn't have it" signal, distinct stores
                // asking matters more than raw search count (one store retrying isn't new demand),
                // and compatibility breadth is a smaller tie-breaker.
                const score = consommation * 2 + r.nb_recherches * 3 + r.nb_magasins_demande * 5 + nbModeles * 0.5;
                return {
                    id_group: p.id_group,
                    nom_fr: p.nom_fr, nom_en: p.nom_en, nom_ar: p.nom_ar,
                    marque: p.marque, modele: p.modele, image: p.image,
                    qte_vendue: p.qte_vendue, qte_reparation: p.qte_reparation,
                    nb_magasins: p.nb_magasins,
                    nb_recherches_sans_stock: r.nb_recherches,
                    nb_magasins_demande: r.nb_magasins_demande,
                    nb_modeles_compatibles: nbModeles,
                    quantite_suggeree_mois: Math.ceil(consommation / nbMois),
                    prix_vente_moyen: p.prix_vente_moyen,
                    moins_cher_fournisseur: fournisseursPiece[0] ?? null,
                    score: Math.round(score * 10) / 10,
                };
            })
            .sort((a, b) => b.score - a.score);
    }
}
