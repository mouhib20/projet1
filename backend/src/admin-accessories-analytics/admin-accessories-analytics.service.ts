import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CaisseService } from '../caisse/caisse.service';

export type Periode = 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface Filtres {
    periode: Periode;
    dateDebut?: string;
    dateFin?: string;
    categorie?: string;
    marque?: string;
    wilaya?: string;
}

const FENETRE_RECALCUL_JOURS = 400;

@Injectable()
export class AdminAccessoriesAnalyticsService {
    private readonly logger = new Logger(AdminAccessoriesAnalyticsService.name);

    constructor(
        private readonly dataSource: DataSource,
        private readonly caisseService: CaisseService,
    ) { }

    // ── Access check ────────────────────────────────────────────

    private async superAdminRequis(authorization?: string): Promise<void> {
        const acteur = await this.caisseService.acteurRequis(authorization);
        if (acteur.role !== 'super_admin') throw new ForbiddenException('Action réservée à un super administrateur.');
    }

    // ── Period → calendar bounds (same convention as AdminAnalyticsService) ──

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

    private moisDansPeriode(debut: string, fin: string): number {
        const jours = (new Date(fin).getTime() - new Date(debut).getTime()) / 86_400_000;
        return Math.max(1, Math.round(jours / 30));
    }

    // ── Auto-link: builds/extends the shared accessoire_produit catalogue ────

    /** Matches unlinked accessory articles to a shared product, by barcode first (exact, most
     *  reliable), then by (category, cleaned brand, cleaned name) for anything left. Never touches
     *  an article that already has accessoire_produit_id set - a manual link (see lierArticle) is
     *  never revisited or overwritten by this pass. */
    private async relierProduitsNonLies(): Promise<void> {
        const parBarcode = await this.dataSource.query(
            `SELECT DISTINCT barcode FROM article WHERE type = 'accessory' AND accessoire_produit_id IS NULL AND barcode IS NOT NULL AND barcode != ''`,
        );
        for (const { barcode } of parBarcode) {
            const idProduit = await this.trouverOuCreerProduit({ barcode });
            await this.dataSource.query(
                `UPDATE article SET accessoire_produit_id = $1 WHERE type = 'accessory' AND accessoire_produit_id IS NULL AND barcode = $2`,
                [idProduit, barcode],
            );
        }

        const parNom = await this.dataSource.query(
            `SELECT sous_categorie AS categorie, LOWER(TRIM(COALESCE(marque, ''))) AS marque_norm,
                    LOWER(TRIM(regexp_replace(designation, '\\s+', ' ', 'g'))) AS nom_norm
               FROM article
              WHERE type = 'accessory' AND accessoire_produit_id IS NULL
              GROUP BY sous_categorie, marque_norm, nom_norm`,
        );
        for (const g of parNom) {
            const idProduit = await this.trouverOuCreerProduit({ categorie: g.categorie, marqueNorm: g.marque_norm, nomNorm: g.nom_norm });
            await this.dataSource.query(
                `UPDATE article SET accessoire_produit_id = $1
                   WHERE type = 'accessory' AND accessoire_produit_id IS NULL
                     AND sous_categorie = $2 AND LOWER(TRIM(COALESCE(marque, ''))) = $3
                     AND LOWER(TRIM(regexp_replace(designation, '\\s+', ' ', 'g'))) = $4`,
                [idProduit, g.categorie, g.marque_norm, g.nom_norm],
            );
        }
    }

    private async trouverOuCreerProduit(cle: { barcode?: string; categorie?: string; marqueNorm?: string; nomNorm?: string }): Promise<number> {
        if (cle.barcode) {
            const [existant] = await this.dataSource.query(`SELECT id FROM accessoire_produit WHERE barcode = $1 LIMIT 1`, [cle.barcode]);
            if (existant) return existant.id;
            const [article] = await this.dataSource.query(
                `SELECT designation, marque, sous_categorie, image FROM article WHERE barcode = $1 AND type = 'accessory' LIMIT 1`,
                [cle.barcode],
            );
            const [cree] = await this.dataSource.query(
                `INSERT INTO accessoire_produit (categorie, marque, nom, barcode, image) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [article.sous_categorie, article.marque, article.designation, cle.barcode, article.image],
            );
            return cree.id;
        }

        const [existant] = await this.dataSource.query(
            `SELECT id FROM accessoire_produit
               WHERE categorie = $1 AND LOWER(TRIM(COALESCE(marque, ''))) = $2 AND LOWER(TRIM(regexp_replace(nom, '\\s+', ' ', 'g'))) = $3
               LIMIT 1`,
            [cle.categorie, cle.marqueNorm, cle.nomNorm],
        );
        if (existant) return existant.id;
        const [article] = await this.dataSource.query(
            `SELECT designation, marque, sous_categorie, image FROM article
               WHERE sous_categorie = $1 AND LOWER(TRIM(COALESCE(marque, ''))) = $2
                 AND LOWER(TRIM(regexp_replace(designation, '\\s+', ' ', 'g'))) = $3 AND type = 'accessory'
               LIMIT 1`,
            [cle.categorie, cle.marqueNorm, cle.nomNorm],
        );
        const [cree] = await this.dataSource.query(
            `INSERT INTO accessoire_produit (categorie, marque, nom, image) VALUES ($1, $2, $3, $4) RETURNING id`,
            [article.sous_categorie, article.marque, article.designation, article.image],
        );
        return cree.id;
    }

    // ── Nightly rebuild ────────────────────────────────────────────

    async recalculerResumeQuotidien(authorization?: string): Promise<{ fenetreJours: number }> {
        if (authorization !== undefined) await this.superAdminRequis(authorization);

        await this.relierProduitsNonLies();

        const depuis = new Date();
        depuis.setDate(depuis.getDate() - FENETRE_RECALCUL_JOURS);
        const depuisStr = depuis.toISOString().slice(0, 10);

        await this.dataSource.transaction(async (m) => {
            await m.query(`DELETE FROM accessoire_resume_quotidien WHERE date_jour >= $1`, [depuisStr]);

            await m.query(
                `INSERT INTO accessoire_resume_quotidien (date_jour, id_produit, id_magasin, qte_vendue, montant_vente_total, prix_vente_min, prix_vente_max)
                 SELECT v.date, a.accessoire_produit_id, v.id_magasin, SUM(v.qte), SUM(v.qte * v.prix), MIN(v.prix), MAX(v.prix)
                   FROM vente v JOIN article a ON a.id_article = v.id_article
                  WHERE a.accessoire_produit_id IS NOT NULL AND v.date >= $1
                  GROUP BY v.date, a.accessoire_produit_id, v.id_magasin
                 ON CONFLICT (date_jour, id_produit, id_magasin) DO UPDATE SET
                    qte_vendue = EXCLUDED.qte_vendue, montant_vente_total = EXCLUDED.montant_vente_total,
                    prix_vente_min = EXCLUDED.prix_vente_min, prix_vente_max = EXCLUDED.prix_vente_max`,
                [depuisStr],
            );

            await m.query(
                `INSERT INTO accessoire_resume_quotidien (date_jour, id_produit, id_magasin, montant_achat_total, qte_achat_total, prix_achat_min, prix_achat_max)
                 SELECT mv.date_mouvement, a.accessoire_produit_id, mv.id_magasin, SUM(mv.qte * mv.prix), SUM(mv.qte), MIN(mv.prix), MAX(mv.prix)
                   FROM mouvement_achat mv JOIN article a ON a.id_article = mv.id_article
                  WHERE a.accessoire_produit_id IS NOT NULL AND mv.date_mouvement >= $1
                  GROUP BY mv.date_mouvement, a.accessoire_produit_id, mv.id_magasin
                 ON CONFLICT (date_jour, id_produit, id_magasin) DO UPDATE SET
                    montant_achat_total = EXCLUDED.montant_achat_total, qte_achat_total = EXCLUDED.qte_achat_total,
                    prix_achat_min = EXCLUDED.prix_achat_min, prix_achat_max = EXCLUDED.prix_achat_max`,
                [depuisStr],
            );

            // Today's out-of-stock snapshot - a point-in-time read of the CURRENT quantite, not a
            // historical reconstruction (see the migration comment on accessoire_resume_quotidien).
            await m.query(
                `INSERT INTO accessoire_resume_quotidien (date_jour, id_produit, id_magasin, en_rupture)
                 SELECT CURRENT_DATE, a.accessoire_produit_id, a.id_magasin, (SUM(a.quantite) = 0)
                   FROM article a
                  WHERE a.type = 'accessory' AND a.accessoire_produit_id IS NOT NULL
                  GROUP BY a.accessoire_produit_id, a.id_magasin
                 ON CONFLICT (date_jour, id_produit, id_magasin) DO UPDATE SET en_rupture = EXCLUDED.en_rupture`,
            );
        });

        this.logger.log(`Résumé accessoires recalculé (fenêtre de ${FENETRE_RECALCUL_JOURS} jours).`);
        return { fenetreJours: FENETRE_RECALCUL_JOURS };
    }

    @Cron(CronExpression.EVERY_DAY_AT_4AM)
    async recalculNocturne(): Promise<void> {
        await this.recalculerResumeQuotidien();
    }

    // ── Tab 1: summary by category ─────────────────────────────────

    async resume(filtres: Filtres, authorization?: string): Promise<any> {
        await this.superAdminRequis(authorization);
        const { debut, fin } = this.bornesPeriode(filtres);
        const parCategorie = await this.dataSource.query(
            `SELECT p.categorie,
                    COALESCE(SUM(r.qte_vendue), 0)::int AS qte_vendue,
                    COALESCE(SUM(r.montant_vente_total), 0)::numeric AS revenus,
                    COALESCE(SUM(r.montant_vente_total - r.montant_achat_total), 0)::numeric AS profit
               FROM accessoire_resume_quotidien r
               JOIN accessoire_produit p ON p.id = r.id_produit
               LEFT JOIN magasin mag ON mag.id_magasin = r.id_magasin
              WHERE r.date_jour BETWEEN $1 AND $2
                AND ($3::text IS NULL OR p.marque = $3)
                AND ($4::text IS NULL OR mag.wilaya = $4)
              GROUP BY p.categorie
              ORDER BY qte_vendue DESC`,
            [debut, fin, filtres.marque ?? null, filtres.wilaya ?? null],
        );
        for (const c of parCategorie) {
            c.marge_pct = c.revenus > 0 ? Math.round((c.profit / c.revenus) * 1000) / 10 : null;
            const [meilleur] = await this.dataSource.query(
                `SELECT p.nom, p.marque, SUM(r.qte_vendue)::int AS qte_vendue
                   FROM accessoire_resume_quotidien r JOIN accessoire_produit p ON p.id = r.id_produit
                  WHERE p.categorie = $1 AND r.date_jour BETWEEN $2 AND $3
                  GROUP BY p.id, p.nom, p.marque ORDER BY qte_vendue DESC LIMIT 1`,
                [c.categorie, debut, fin],
            );
            c.meilleur_produit = meilleur ?? null;
        }

        const produits = await this.topProduits(filtres, authorization);
        const top10Qte = [...produits].sort((a, b) => b.qte_vendue - a.qte_vendue).slice(0, 10);
        const top10Profit = [...produits].sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0)).slice(0, 10);

        return { parCategorie, top10Qte, top10Profit };
    }

    // ── Tab 2: top products ─────────────────────────────────────────

    async topProduits(filtres: Filtres, authorization?: string): Promise<any[]> {
        await this.superAdminRequis(authorization);
        const { debut, fin } = this.bornesPeriode(filtres);
        const lignes = await this.dataSource.query(
            `SELECT p.id AS id_produit, p.categorie, p.marque, p.nom, p.barcode, p.image,
                    COALESCE(SUM(r.qte_vendue), 0)::int AS qte_vendue,
                    COUNT(DISTINCT CASE WHEN r.qte_vendue > 0 THEN r.id_magasin END)::int AS nb_magasins,
                    COALESCE(SUM(r.montant_vente_total), 0)::numeric AS revenus,
                    COALESCE(SUM(r.montant_vente_total - r.montant_achat_total), 0)::numeric AS profit,
                    CASE WHEN SUM(r.qte_achat_total) > 0 THEN ROUND(SUM(r.montant_achat_total) / SUM(r.qte_achat_total), 2) END AS prix_achat_moyen,
                    MIN(r.prix_achat_min) AS prix_achat_min,
                    MAX(r.prix_achat_max) AS prix_achat_max,
                    CASE WHEN SUM(r.qte_vendue) > 0 THEN ROUND(SUM(r.montant_vente_total) / SUM(r.qte_vendue), 2) END AS prix_vente_moyen,
                    MIN(r.prix_vente_min) AS prix_vente_min,
                    MAX(r.prix_vente_max) AS prix_vente_max
               FROM accessoire_resume_quotidien r
               JOIN accessoire_produit p ON p.id = r.id_produit
               LEFT JOIN magasin mag ON mag.id_magasin = r.id_magasin
              WHERE r.date_jour BETWEEN $1 AND $2
                AND ($3::text IS NULL OR p.categorie = $3)
                AND ($4::text IS NULL OR p.marque = $4)
                AND ($5::text IS NULL OR mag.wilaya = $5)
              GROUP BY p.id, p.categorie, p.marque, p.nom, p.barcode, p.image
              ORDER BY qte_vendue DESC`,
            [debut, fin, filtres.categorie ?? null, filtres.marque ?? null, filtres.wilaya ?? null],
        );
        for (const l of lignes) {
            l.marge_pct = l.revenus > 0 ? Math.round((l.profit / l.revenus) * 1000) / 10 : null;
            const fournisseurs = await this.fournisseursPourProduit(l.id_produit, debut, fin);
            l.moins_cher_fournisseur = fournisseurs[0] ?? null;
        }
        return lignes;
    }

    async detailProduit(idProduit: number, filtres: Filtres, authorization?: string): Promise<{ parMois: any[]; fournisseurs: any[] }> {
        await this.superAdminRequis(authorization);
        const { debut, fin } = this.bornesPeriode(filtres);
        const parMois = await this.dataSource.query(
            `SELECT to_char(date_trunc('month', r.date_jour), 'YYYY-MM') AS mois,
                    COALESCE(SUM(r.qte_vendue), 0)::int AS qte_vendue,
                    COUNT(DISTINCT CASE WHEN r.qte_vendue > 0 THEN r.id_magasin END)::int AS nb_magasins
               FROM accessoire_resume_quotidien r
              WHERE r.id_produit = $1 AND r.date_jour BETWEEN $2 AND $3
              GROUP BY date_trunc('month', r.date_jour)
              ORDER BY date_trunc('month', r.date_jour)`,
            [idProduit, debut, fin],
        );
        const fournisseurs = await this.fournisseursPourProduit(idProduit, debut, fin);
        return { parMois, fournisseurs };
    }

    private async fournisseursPourProduit(idProduit: number, debut: string, fin: string): Promise<any[]> {
        return this.dataSource.query(
            `SELECT f.tel AS telephone,
                    (array_agg(f.nom ORDER BY mv.date_mouvement DESC))[1] AS nom,
                    ROUND(AVG(mv.prix), 2) AS prix_moyen,
                    COUNT(DISTINCT mv.id_magasin)::int AS nb_magasins,
                    MAX(mv.date_mouvement) AS derniere_date
               FROM mouvement_achat mv
               JOIN fournisseur f ON f.id_fournisseur = mv.id_fournisseur
               JOIN article a ON a.id_article = mv.id_article
              WHERE a.accessoire_produit_id = $1 AND mv.date_mouvement BETWEEN $2 AND $3 AND f.tel IS NOT NULL AND f.tel != ''
              GROUP BY f.tel
              ORDER BY prix_moyen ASC`,
            [idProduit, debut, fin],
        );
    }

    // ── Tab 3: suppliers ─────────────────────────────────────────────

    async fournisseurs(filtres: Filtres, authorization?: string): Promise<any[]> {
        await this.superAdminRequis(authorization);
        const { debut, fin } = this.bornesPeriode(filtres);
        const lignes = await this.dataSource.query(
            `SELECT f.tel AS telephone,
                    (array_agg(f.nom ORDER BY mv.date_mouvement DESC))[1] AS nom,
                    p.id AS id_produit, p.categorie, p.marque, p.nom AS nom_produit,
                    ROUND(AVG(mv.prix), 2) AS prix_moyen,
                    COUNT(DISTINCT mv.id_magasin)::int AS nb_magasins,
                    MAX(mv.date_mouvement) AS derniere_date
               FROM mouvement_achat mv
               JOIN fournisseur f ON f.id_fournisseur = mv.id_fournisseur
               JOIN article a ON a.id_article = mv.id_article
               JOIN accessoire_produit p ON p.id = a.accessoire_produit_id
               LEFT JOIN magasin mag ON mag.id_magasin = mv.id_magasin
              WHERE a.accessoire_produit_id IS NOT NULL AND mv.date_mouvement BETWEEN $1 AND $2
                AND f.tel IS NOT NULL AND f.tel != ''
                AND ($3::text IS NULL OR p.categorie = $3)
                AND ($4::text IS NULL OR p.marque = $4)
                AND ($5::text IS NULL OR mag.wilaya = $5)
              GROUP BY f.tel, p.id, p.categorie, p.marque, p.nom
              ORDER BY f.tel, prix_moyen ASC`,
            [debut, fin, filtres.categorie ?? null, filtres.marque ?? null, filtres.wilaya ?? null],
        );
        const moinsCherParProduit = new Map<number, number>();
        for (const l of lignes) {
            const courant = moinsCherParProduit.get(l.id_produit);
            if (courant === undefined || l.prix_moyen < courant) moinsCherParProduit.set(l.id_produit, l.prix_moyen);
        }
        return lignes.map((l: any) => ({ ...l, moins_cher: l.prix_moyen === moinsCherParProduit.get(l.id_produit) }));
    }

    // ── Tab 4: what to stock wholesale ─────────────────────────────

    async recommandationsGros(filtres: Filtres, authorization?: string): Promise<any[]> {
        await this.superAdminRequis(authorization);
        const { debut, fin } = this.bornesPeriode(filtres);
        const produits = await this.topProduits(filtres, authorization);
        if (!produits.length) return [];

        const ids = produits.map((p) => p.id_produit);
        const [ruptures, tendance] = await Promise.all([
            this.dataSource.query(
                `SELECT id_produit, COUNT(*)::int AS jours_rupture
                   FROM accessoire_resume_quotidien
                  WHERE id_produit = ANY($1) AND date_jour BETWEEN $2 AND $3 AND en_rupture
                  GROUP BY id_produit`,
                [ids, debut, fin],
            ),
            this.tendanceVentes(ids),
        ]);
        const parRupture = new Map<number, number>(ruptures.map((r: any) => [r.id_produit, r.jours_rupture]));
        const nbMois = this.moisDansPeriode(debut, fin);

        return produits
            .map((p) => {
                const joursRupture = parRupture.get(p.id_produit) ?? 0;
                const tend = tendance.get(p.id_produit) ?? 'stable';
                // Weights: real sales volume counts most, margin matters a lot for accessories
                // (per the spec - profit varies wildly between products), stock-outs are a direct
                // unmet-demand signal, and an upward trend is a smaller forward-looking bonus.
                const score = p.qte_vendue * 2 + (p.marge_pct ?? 0) * 0.3 + joursRupture * 4 + (tend === 'hausse' ? 10 : 0);
                return {
                    id_produit: p.id_produit, categorie: p.categorie, marque: p.marque, nom: p.nom, image: p.image,
                    qte_vendue: p.qte_vendue, nb_magasins: p.nb_magasins, marge_pct: p.marge_pct,
                    jours_rupture: joursRupture, tendance: tend,
                    quantite_suggeree_mois: Math.ceil(p.qte_vendue / nbMois),
                    prix_vente_moyen: p.prix_vente_moyen,
                    moins_cher_fournisseur: p.moins_cher_fournisseur,
                    score: Math.round(score * 10) / 10,
                };
            })
            .sort((a, b) => b.score - a.score);
    }

    /** First half vs second half of the last 90 days, by total qty sold - a simple, documented
     *  trend signal rather than a full time-series regression. */
    private async tendanceVentes(ids: number[]): Promise<Map<number, 'hausse' | 'baisse' | 'stable'>> {
        const fin = new Date();
        const milieu = new Date(fin); milieu.setDate(milieu.getDate() - 45);
        const debut = new Date(fin); debut.setDate(debut.getDate() - 90);
        const [premiereMoitie, deuxiemeMoitie] = await Promise.all([
            this.dataSource.query(
                `SELECT id_produit, COALESCE(SUM(qte_vendue), 0)::int AS qte FROM accessoire_resume_quotidien WHERE id_produit = ANY($1) AND date_jour BETWEEN $2 AND $3 GROUP BY id_produit`,
                [ids, debut.toISOString().slice(0, 10), milieu.toISOString().slice(0, 10)],
            ),
            this.dataSource.query(
                `SELECT id_produit, COALESCE(SUM(qte_vendue), 0)::int AS qte FROM accessoire_resume_quotidien WHERE id_produit = ANY($1) AND date_jour > $2 AND date_jour <= $3 GROUP BY id_produit`,
                [ids, milieu.toISOString().slice(0, 10), fin.toISOString().slice(0, 10)],
            ),
        ]);
        const avant = new Map<number, number>(premiereMoitie.map((r: any) => [r.id_produit, r.qte]));
        const apres = new Map<number, number>(deuxiemeMoitie.map((r: any) => [r.id_produit, r.qte]));
        const resultat = new Map<number, 'hausse' | 'baisse' | 'stable'>();
        for (const id of ids) {
            const a = avant.get(id) ?? 0;
            const b = apres.get(id) ?? 0;
            if (a === 0 && b === 0) { resultat.set(id, 'stable'); continue; }
            if (b > a * 1.15) resultat.set(id, 'hausse');
            else if (b < a * 0.85) resultat.set(id, 'baisse');
            else resultat.set(id, 'stable');
        }
        return resultat;
    }

    // ── Tab 5: unlinked articles + manual link ──────────────────────

    async nonLies(authorization?: string): Promise<any[]> {
        await this.superAdminRequis(authorization);
        return this.dataSource.query(
            `SELECT id_article, designation, marque, sous_categorie, barcode, image, id_magasin
               FROM article WHERE type = 'accessory' AND accessoire_produit_id IS NULL
               ORDER BY designation`,
        );
    }

    async suggestionsPourArticle(idArticle: number, authorization?: string): Promise<any[]> {
        await this.superAdminRequis(authorization);
        const [article] = await this.dataSource.query(`SELECT sous_categorie, designation FROM article WHERE id_article = $1`, [idArticle]);
        if (!article) throw new NotFoundException(`Article #${idArticle} introuvable`);
        return this.dataSource.query(
            `SELECT id, categorie, marque, nom, barcode, image
               FROM accessoire_produit
              WHERE categorie = $1 AND nom ILIKE $2
              ORDER BY nom LIMIT 10`,
            [article.sous_categorie, `%${article.designation.trim()}%`],
        );
    }

    /** Links one article to an existing product (idProduit given) or a brand-new one (created from
     *  the article's own fields). Writes directly to article.accessoire_produit_id, which the
     *  nightly auto-link pass never revisits once set - the manual decision sticks. */
    async lierArticle(idArticle: number, idProduit: number | undefined, authorization?: string): Promise<{ id_produit: number }> {
        await this.superAdminRequis(authorization);
        const [article] = await this.dataSource.query(`SELECT designation, marque, sous_categorie, barcode, image FROM article WHERE id_article = $1 AND type = 'accessory'`, [idArticle]);
        if (!article) throw new NotFoundException(`Article accessoire #${idArticle} introuvable`);

        let cible = idProduit;
        if (cible) {
            const [existant] = await this.dataSource.query(`SELECT id FROM accessoire_produit WHERE id = $1`, [cible]);
            if (!existant) throw new NotFoundException(`Produit #${cible} introuvable`);
        } else {
            const nom = article.designation?.trim();
            if (!nom) throw new BadRequestException("Le nom de l'article est requis pour créer un nouveau produit.");
            const [cree] = await this.dataSource.query(
                `INSERT INTO accessoire_produit (categorie, marque, nom, barcode, image) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [article.sous_categorie, article.marque, nom, article.barcode || null, article.image],
            );
            cible = cree.id;
        }

        await this.dataSource.query(`UPDATE article SET accessoire_produit_id = $1 WHERE id_article = $2`, [cible, idArticle]);
        return { id_produit: cible! };
    }
}
