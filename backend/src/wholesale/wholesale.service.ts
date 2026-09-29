import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CaisseService, Acteur } from '../caisse/caisse.service';
import { StoreContextService } from '../store-context/store-context.service';

@Injectable()
export class WholesaleService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly caisseService: CaisseService,
        private readonly storeContext: StoreContextService,
    ) { }

    // ── Access checks ────────────────────────────────────────────

    /** The store currently flagged as THE wholesale supplier, or null if none is set. */
    private async grossisteId(): Promise<number | null> {
        const [row] = await this.dataSource.query(`SELECT id_magasin FROM magasin WHERE est_grossiste = true LIMIT 1`);
        return row ? row.id_magasin : null;
    }

    /**
     * Managing listings/all orders is restricted to employees of the ONE store currently
     * flagged as the wholesale supplier - checked by store identity, not a separate role
     * (mirrors CompatibilityService.editeurRequis, but compares store id instead of user role).
     */
    private async estMagasinGrossisteRequis(authorization?: string): Promise<{ id_magasin: number; acteur: Acteur }> {
        const acteur = await this.caisseService.acteurRequis(authorization);
        const id_magasin = this.storeContext.requireMagasinId();
        const grossisteId = await this.grossisteId();
        if (!grossisteId || id_magasin !== grossisteId) {
            throw new ForbiddenException('Action réservée aux employés du magasin de gros.');
        }
        return { id_magasin, acteur };
    }

    /** The order, provided it belongs to the caller's own store; never leaks another store's order. */
    private async commandeDuDemandeur(id: number): Promise<any> {
        const id_magasin = this.storeContext.requireMagasinId();
        const [order] = await this.dataSource.query(`SELECT * FROM wholesale_order WHERE id = $1`, [id]);
        if (!order || order.id_magasin_demandeur !== id_magasin) throw new NotFoundException(`Commande #${id} introuvable`);
        return order;
    }

    private async changerStatut(id: number, nouveauStatut: string, authorization?: string): Promise<void> {
        const acteur = await this.caisseService.acteurRequis(authorization);
        await this.dataSource.transaction(async (m) => {
            const [order] = await m.query(`SELECT statut FROM wholesale_order WHERE id = $1 FOR UPDATE`, [id]);
            if (!order) throw new NotFoundException(`Commande #${id} introuvable`);
            await m.query(`UPDATE wholesale_order SET statut = $2 WHERE id = $1`, [id, nouveauStatut]);
            await m.query(
                `INSERT INTO wholesale_order_event (id_order, par, statut_avant, statut_apres) VALUES ($1, $2, $3, $4)`,
                [id, acteur.id, order.statut, nouveauStatut],
            );
        });
    }

    // ── Catalogue (shared, read for every store) ────────────────

    /** Reserved = sum of confirmed quantities across orders not yet sent/cancelled/received. */
    private static readonly ETATS_RESERVES = ['confirmee', 'ajustee', 'en_preparation'];

    async getCatalogue(q?: string): Promise<any[]> {
        const grossisteId = await this.grossisteId();
        if (!grossisteId) return [];
        const like = `%${String(q ?? '').trim()}%`;
        const rows = await this.dataSource.query(
            `SELECT wl.id AS id_listing, wl.prix_gros, wl.qte_min, a.id_article, a.designation, a.marque,
                    a.modele, a.barcode, a.image, a.type, a.sous_categorie, a.quantite AS quantite_totale,
                    COALESCE((
                        SELECT SUM(ol.qte_confirmee) FROM wholesale_order_line ol
                          JOIN wholesale_order o ON o.id = ol.id_order
                         WHERE ol.id_listing = wl.id AND o.statut = ANY($3)
                    ), 0) AS reserve
               FROM wholesale_listing wl
               JOIN article a ON a.id_article = wl.id_article
              WHERE wl.visible = true AND a.id_magasin = $1
                AND (a.designation ILIKE $2 OR a.marque ILIKE $2 OR a.modele ILIKE $2 OR a.barcode ILIKE $2)
              ORDER BY a.designation`,
            [grossisteId, like, WholesaleService.ETATS_RESERVES],
        );
        return rows.map((r: any) => ({
            ...r,
            quantite_disponible: Math.max(0, Number(r.quantite_totale) - Number(r.reserve)),
        }));
    }

    // ── Orders: requesting side (any store) ─────────────────────

    async creerCommande(
        dto: { lignes: { id_listing: number; qte: number }[]; note?: string; methode_reception?: string },
        authorization?: string,
    ): Promise<{ id: number }> {
        const id_magasin = this.storeContext.requireMagasinId();
        const acteur = await this.caisseService.acteurRequis(authorization);
        if (!dto.lignes || dto.lignes.length === 0) throw new BadRequestException('Le panier est vide.');

        const grossisteId = await this.grossisteId();
        if (!grossisteId) throw new BadRequestException("Aucun magasin de gros n'est configuré actuellement.");
        if (id_magasin === grossisteId) throw new BadRequestException('Le magasin de gros ne peut pas commander de lui-même.');

        return this.dataSource.transaction(async (m) => {
            let total = 0;
            const aInserer: { id_listing: number; qte: number; prix: number }[] = [];
            for (const l of dto.lignes) {
                const [listing] = await m.query(
                    `SELECT wl.id, wl.prix_gros, wl.qte_min, wl.visible, a.quantite AS quantite_totale
                       FROM wholesale_listing wl JOIN article a ON a.id_article = wl.id_article
                      WHERE wl.id = $1`,
                    [l.id_listing],
                );
                if (!listing || !listing.visible) throw new NotFoundException(`Offre #${l.id_listing} introuvable`);
                if (l.qte < listing.qte_min) {
                    throw new BadRequestException(`La quantité minimale pour cette pièce est ${listing.qte_min}.`);
                }
                const [{ reserve }] = await m.query(
                    `SELECT COALESCE(SUM(ol.qte_confirmee), 0) AS reserve
                       FROM wholesale_order_line ol JOIN wholesale_order o ON o.id = ol.id_order
                      WHERE ol.id_listing = $1 AND o.statut = ANY($2)`,
                    [l.id_listing, WholesaleService.ETATS_RESERVES],
                );
                const disponible = Number(listing.quantite_totale) - Number(reserve);
                if (l.qte > disponible) {
                    throw new BadRequestException(`Stock insuffisant pour cette pièce. Disponible : ${disponible}.`);
                }
                total += l.qte * Number(listing.prix_gros);
                aInserer.push({ id_listing: l.id_listing, qte: l.qte, prix: Number(listing.prix_gros) });
            }

            const [order] = await m.query(
                `INSERT INTO wholesale_order (id_magasin_demandeur, total, note, methode_reception, cree_par)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [id_magasin, total, dto.note?.trim() || null, dto.methode_reception?.trim() || null, acteur.id],
            );
            for (const l of aInserer) {
                await m.query(
                    `INSERT INTO wholesale_order_line (id_order, id_listing, qte_demandee, prix_unitaire) VALUES ($1, $2, $3, $4)`,
                    [order.id, l.id_listing, l.qte, l.prix],
                );
            }
            await m.query(
                `INSERT INTO wholesale_order_event (id_order, par, statut_apres) VALUES ($1, $2, 'en_attente')`,
                [order.id, acteur.id],
            );
            return { id: order.id };
        });
    }

    /** The wholesale store's own staff see every order; any other store sees only its own. */
    async listerCommandes(authorization?: string): Promise<any[]> {
        const id_magasin = this.storeContext.requireMagasinId();
        await this.caisseService.acteurRequis(authorization);
        const grossisteId = await this.grossisteId();
        const estGrossiste = grossisteId != null && id_magasin === grossisteId;

        const rows = await this.dataSource.query(
            `SELECT o.id, o.id_magasin_demandeur, mag.nom AS magasin_nom, o.statut, o.total, o.note,
                    o.methode_reception, o.date_creation, o.date_confirmation, o.date_envoi, o.date_reception
               FROM wholesale_order o
               JOIN magasin mag ON mag.id_magasin = o.id_magasin_demandeur
              ${estGrossiste ? '' : 'WHERE o.id_magasin_demandeur = $1'}
              ORDER BY o.date_creation DESC`,
            estGrossiste ? [] : [id_magasin],
        );
        for (const o of rows) {
            o.lignes = await this.dataSource.query(
                `SELECT ol.id, ol.id_listing, ol.qte_demandee, ol.qte_confirmee, ol.prix_unitaire,
                        a.designation, a.marque, a.modele, a.image
                   FROM wholesale_order_line ol
                   JOIN wholesale_listing wl ON wl.id = ol.id_listing
                   JOIN article a ON a.id_article = wl.id_article
                  WHERE ol.id_order = $1`,
                [o.id],
            );
        }
        return rows;
    }

    async accepterAjustement(id: number, authorization?: string): Promise<void> {
        await this.caisseService.acteurRequis(authorization);
        const order = await this.commandeDuDemandeur(id);
        if (order.statut !== 'ajustee') throw new BadRequestException("Cette commande n'attend pas de validation d'ajustement.");
        await this.changerStatut(id, 'confirmee', authorization);
    }

    async annulerCommande(id: number, authorization?: string): Promise<void> {
        await this.caisseService.acteurRequis(authorization);
        const order = await this.commandeDuDemandeur(id);
        if (!['en_attente', 'ajustee', 'confirmee'].includes(order.statut)) {
            throw new BadRequestException('Cette commande ne peut plus être annulée (déjà en préparation ou au-delà).');
        }
        await this.changerStatut(id, 'annulee', authorization);
    }

    async confirmerReception(id: number, authorization?: string): Promise<void> {
        const acteur = await this.caisseService.acteurRequis(authorization);
        const id_magasin = this.storeContext.requireMagasinId();
        await this.dataSource.transaction(async (m) => {
            const [order] = await m.query(
                `SELECT * FROM wholesale_order WHERE id = $1 AND id_magasin_demandeur = $2 FOR UPDATE`,
                [id, id_magasin],
            );
            if (!order) throw new NotFoundException(`Commande #${id} introuvable`);
            if (order.statut !== 'envoyee') throw new BadRequestException("Cette commande n'a pas encore été envoyée.");

            const lignes = await m.query(
                `SELECT ol.qte_confirmee, ol.prix_unitaire, a.designation, a.marque, a.modele, a.barcode,
                        a.image, a.type, a.sous_categorie, a.qte_min
                   FROM wholesale_order_line ol
                   JOIN wholesale_listing wl ON wl.id = ol.id_listing
                   JOIN article a ON a.id_article = wl.id_article
                  WHERE ol.id_order = $1`,
                [id],
            );
            for (const l of lignes) {
                let existant: any = null;
                if (l.barcode) {
                    [existant] = await m.query(
                        `SELECT id_article FROM article WHERE id_magasin = $1 AND barcode = $2`,
                        [id_magasin, l.barcode],
                    );
                }
                if (existant) {
                    await m.query(
                        `UPDATE article SET quantite = quantite + $1, prix_achat = $2 WHERE id_article = $3`,
                        [l.qte_confirmee, l.prix_unitaire, existant.id_article],
                    );
                } else {
                    await m.query(
                        `INSERT INTO article (designation, marque, modele, barcode, image, type, sous_categorie, quantite, qte_min, prix_achat, id_magasin)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                        [l.designation, l.marque, l.modele, l.barcode, l.image, l.type, l.sous_categorie, l.qte_confirmee, l.qte_min ?? 3, l.prix_unitaire, id_magasin],
                    );
                }
            }
            await m.query(`UPDATE wholesale_order SET statut = 'recue', date_reception = now() WHERE id = $1`, [id]);
            await m.query(
                `INSERT INTO wholesale_order_event (id_order, par, statut_avant, statut_apres) VALUES ($1, $2, $3, 'recue')`,
                [id, acteur.id, order.statut],
            );
        });
    }

    // ── Orders: wholesale store's own side ──────────────────────

    async confirmerCommande(id: number, lignes: { id_ligne: number; qte_confirmee: number }[], authorization?: string): Promise<void> {
        const { acteur } = await this.estMagasinGrossisteRequis(authorization);
        await this.dataSource.transaction(async (m) => {
            const [order] = await m.query(`SELECT * FROM wholesale_order WHERE id = $1 FOR UPDATE`, [id]);
            if (!order) throw new NotFoundException(`Commande #${id} introuvable`);
            if (order.statut !== 'en_attente') throw new BadRequestException('Cette commande a déjà été traitée.');

            let ajustement = false;
            let total = 0;
            for (const l of lignes) {
                const [ligne] = await m.query(`SELECT * FROM wholesale_order_line WHERE id = $1 AND id_order = $2`, [l.id_ligne, id]);
                if (!ligne) throw new NotFoundException(`Ligne #${l.id_ligne} introuvable`);
                if (l.qte_confirmee < 0 || l.qte_confirmee > ligne.qte_demandee) {
                    throw new BadRequestException('La quantité confirmée est invalide.');
                }
                if (l.qte_confirmee < ligne.qte_demandee) ajustement = true;
                total += l.qte_confirmee * Number(ligne.prix_unitaire);
                await m.query(`UPDATE wholesale_order_line SET qte_confirmee = $1 WHERE id = $2`, [l.qte_confirmee, l.id_ligne]);
            }
            const nouveauStatut = ajustement ? 'ajustee' : 'confirmee';
            await m.query(
                `UPDATE wholesale_order SET statut = $2, total = $3, date_confirmation = now() WHERE id = $1`,
                [id, nouveauStatut, total],
            );
            await m.query(
                `INSERT INTO wholesale_order_event (id_order, par, statut_avant, statut_apres) VALUES ($1, $2, $3, $4)`,
                [id, acteur.id, order.statut, nouveauStatut],
            );
        });
    }

    async demarrerPreparation(id: number, authorization?: string): Promise<void> {
        await this.estMagasinGrossisteRequis(authorization);
        const [order] = await this.dataSource.query(`SELECT statut FROM wholesale_order WHERE id = $1`, [id]);
        if (!order) throw new NotFoundException(`Commande #${id} introuvable`);
        if (order.statut !== 'confirmee') throw new BadRequestException('Cette commande doit être confirmée avant de démarrer la préparation.');
        await this.changerStatut(id, 'en_preparation', authorization);
    }

    /** Deducts the wholesale store's own stock for real, row-locked (two sends can't both succeed on the last unit). */
    async envoyerCommande(id: number, authorization?: string): Promise<void> {
        const { acteur } = await this.estMagasinGrossisteRequis(authorization);
        await this.dataSource.transaction(async (m) => {
            const [order] = await m.query(`SELECT * FROM wholesale_order WHERE id = $1 FOR UPDATE`, [id]);
            if (!order) throw new NotFoundException(`Commande #${id} introuvable`);
            if (order.statut !== 'en_preparation') throw new BadRequestException("Cette commande doit être en préparation avant l'envoi.");

            const lignes = await m.query(
                `SELECT ol.qte_confirmee, wl.id_article FROM wholesale_order_line ol
                   JOIN wholesale_listing wl ON wl.id = ol.id_listing WHERE ol.id_order = $1`,
                [id],
            );
            for (const l of lignes) {
                const [article] = await m.query(
                    `SELECT quantite, designation FROM article WHERE id_article = $1 FOR UPDATE`,
                    [l.id_article],
                );
                if (!article || Number(article.quantite) < Number(l.qte_confirmee)) {
                    throw new BadRequestException(`Stock insuffisant pour "${article?.designation || l.id_article}".`);
                }
                await m.query(`UPDATE article SET quantite = quantite - $1 WHERE id_article = $2`, [l.qte_confirmee, l.id_article]);
            }
            await m.query(`UPDATE wholesale_order SET statut = 'envoyee', date_envoi = now() WHERE id = $1`, [id]);
            await m.query(
                `INSERT INTO wholesale_order_event (id_order, par, statut_avant, statut_apres) VALUES ($1, $2, $3, 'envoyee')`,
                [id, acteur.id, order.statut],
            );
        });
    }

    // ── Listings management (wholesale store's own side) ────────

    async listerOffres(authorization?: string): Promise<any[]> {
        await this.estMagasinGrossisteRequis(authorization);
        return this.dataSource.query(
            `SELECT wl.id, wl.prix_gros, wl.qte_min, wl.visible, a.id_article, a.designation, a.marque, a.modele, a.quantite, a.image
               FROM wholesale_listing wl JOIN article a ON a.id_article = wl.id_article
              ORDER BY a.designation`,
        );
    }

    async creerOffre(dto: { id_article: number; prix_gros: number; qte_min?: number }, authorization?: string): Promise<{ id: number }> {
        const { id_magasin } = await this.estMagasinGrossisteRequis(authorization);
        const [article] = await this.dataSource.query(
            `SELECT id_article FROM article WHERE id_article = $1 AND id_magasin = $2`,
            [dto.id_article, id_magasin],
        );
        if (!article) throw new NotFoundException(`Article #${dto.id_article} introuvable`);
        if (!(Number(dto.prix_gros) > 0)) throw new BadRequestException('Le prix de gros doit être supérieur à 0.');
        const rows = await this.dataSource.query(
            `INSERT INTO wholesale_listing (id_article, prix_gros, qte_min) VALUES ($1, $2, $3) RETURNING id`,
            [dto.id_article, dto.prix_gros, dto.qte_min || 1],
        );
        return { id: rows[0].id };
    }

    async modifierOffre(id: number, dto: { prix_gros?: number; qte_min?: number; visible?: boolean }, authorization?: string): Promise<void> {
        await this.estMagasinGrossisteRequis(authorization);
        const res = await this.dataSource.query(
            `UPDATE wholesale_listing SET
                prix_gros = COALESCE($2, prix_gros), qte_min = COALESCE($3, qte_min), visible = COALESCE($4, visible)
             WHERE id = $1`,
            [id, dto.prix_gros ?? null, dto.qte_min ?? null, dto.visible ?? null],
        );
        const affected = Array.isArray(res) ? res[1] : 0;
        if (!affected) throw new NotFoundException(`Offre #${id} introuvable`);
    }

    async supprimerOffre(id: number, authorization?: string): Promise<void> {
        await this.estMagasinGrossisteRequis(authorization);
        const res = await this.dataSource.query(`DELETE FROM wholesale_listing WHERE id = $1`, [id]);
        const affected = Array.isArray(res) ? res[1] : 0;
        if (!affected) throw new NotFoundException(`Offre #${id} introuvable`);
    }
}
