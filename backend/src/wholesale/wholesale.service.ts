import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Utilisateur } from '../users/user.entity';
import { CaisseService, Acteur } from '../caisse/caisse.service';
import { StoreContextService } from '../store-context/store-context.service';

@Injectable()
export class WholesaleService {
    constructor(
        @InjectRepository(Utilisateur)
        private readonly usersRepo: Repository<Utilisateur>,
        private readonly dataSource: DataSource,
        private readonly caisseService: CaisseService,
        private readonly storeContext: StoreContextService,
    ) { }

    // ── Access checks ────────────────────────────────────────────

    private async superAdminRequis(authorization?: string): Promise<Acteur> {
        const acteur = await this.caisseService.acteurRequis(authorization);
        if (acteur.role !== 'super_admin') throw new ForbiddenException('Action réservée à un super administrateur.');
        return acteur;
    }

    /**
     * Managing the wholesale catalogue and processing orders: wholesale_editor accounts, or
     * super_admin - an independent role with no store of its own, same shape as compat_editor.
     */
    private async editeurRequis(authorization?: string): Promise<Acteur> {
        const acteur = await this.caisseService.acteurRequis(authorization);
        if (acteur.role !== 'wholesale_editor' && acteur.role !== 'super_admin') {
            throw new ForbiddenException('Action réservée aux gestionnaires de la vente en gros.');
        }
        return acteur;
    }

    /** Exposes the editor-role check for the controller's upload-image route, which needs it
     *  before returning the uploaded file's URL. */
    async verifierEditeur(authorization?: string): Promise<void> {
        await this.editeurRequis(authorization);
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

    // ── Wholesale-editor accounts (super_admin only) ────────────

    async creerEditeur(dto: { nom: string; username: string; password: string }, authorization?: string): Promise<Omit<Utilisateur, 'password'>> {
        await this.superAdminRequis(authorization);
        const nom = String(dto.nom ?? '').trim();
        const username = String(dto.username ?? '').trim();
        const password = String(dto.password ?? '');
        if (!nom) throw new BadRequestException('Le nom est obligatoire.');
        if (!username) throw new BadRequestException("Le nom d'utilisateur est obligatoire.");
        if (password.length < 6) throw new BadRequestException('Le mot de passe doit contenir au moins 6 caractères.');

        const existant = await this.usersRepo.findOne({ where: { username } });
        if (existant) throw new BadRequestException(`Le nom d'utilisateur "${username}" est déjà utilisé.`);

        const editeur = await this.usersRepo.save(this.usersRepo.create({
            nom, username, password: await bcrypt.hash(password, 10),
            role: 'wholesale_editor', actif: true, id_magasin: null,
        }));
        const { password: _pw, ...reste } = editeur;
        return reste;
    }

    async listerEditeurs(authorization?: string): Promise<Omit<Utilisateur, 'password'>[]> {
        await this.superAdminRequis(authorization);
        const editeurs = await this.usersRepo.find({ where: { role: 'wholesale_editor' }, order: { id: 'DESC' } });
        return editeurs.map(({ password, ...reste }) => reste);
    }

    async suspendreEditeur(id: number, actif: boolean, authorization?: string): Promise<void> {
        await this.superAdminRequis(authorization);
        const editeur = await this.usersRepo.findOne({ where: { id, role: 'wholesale_editor' } });
        if (!editeur) throw new NotFoundException(`Éditeur #${id} introuvable`);
        await this.usersRepo.update(id, { actif: !!actif });
    }

    // ── Catalogue (shared, read for every store) ────────────────

    /** Reserved = sum of confirmed quantities across orders not yet sent/cancelled/received. */
    private static readonly ETATS_RESERVES = ['confirmee', 'ajustee', 'en_preparation'];

    async getCatalogue(q?: string): Promise<any[]> {
        const like = `%${String(q ?? '').trim()}%`;
        const rows = await this.dataSource.query(
            `SELECT wl.id AS id_listing, wl.designation, wl.marque, wl.modele, wl.barcode, wl.image,
                    wl.type, wl.sous_categorie, wl.prix_gros, wl.qte_min, wl.quantite AS quantite_totale,
                    COALESCE((
                        SELECT SUM(ol.qte_confirmee) FROM wholesale_order_line ol
                          JOIN wholesale_order o ON o.id = ol.id_order
                         WHERE ol.id_listing = wl.id AND o.statut = ANY($2)
                    ), 0) AS reserve
               FROM wholesale_listing wl
              WHERE wl.visible = true
                AND (wl.designation ILIKE $1 OR wl.marque ILIKE $1 OR wl.modele ILIKE $1 OR wl.barcode ILIKE $1)
              ORDER BY wl.designation`,
            [like, WholesaleService.ETATS_RESERVES],
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

        return this.dataSource.transaction(async (m) => {
            let total = 0;
            const aInserer: { id_listing: number; qte: number; prix: number }[] = [];
            for (const l of dto.lignes) {
                const [listing] = await m.query(
                    `SELECT id, prix_gros, qte_min, visible, quantite FROM wholesale_listing WHERE id = $1`,
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
                const disponible = Number(listing.quantite) - Number(reserve);
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

    /** wholesale_editor / super_admin see every order; any store sees only its own. */
    async listerCommandes(authorization?: string): Promise<any[]> {
        const id_magasin = this.storeContext.getMagasinId();
        const acteur = await this.caisseService.acteurRequis(authorization);
        const estEditeur = acteur.role === 'wholesale_editor' || acteur.role === 'super_admin';

        const rows = await this.dataSource.query(
            `SELECT o.id, o.id_magasin_demandeur, mag.nom AS magasin_nom, o.statut, o.total, o.note,
                    o.methode_reception, o.date_creation, o.date_confirmation, o.date_envoi, o.date_reception
               FROM wholesale_order o
               JOIN magasin mag ON mag.id_magasin = o.id_magasin_demandeur
              ${estEditeur ? '' : 'WHERE o.id_magasin_demandeur = $1'}
              ORDER BY o.date_creation DESC`,
            estEditeur ? [] : [id_magasin],
        );
        for (const o of rows) {
            o.lignes = await this.dataSource.query(
                `SELECT ol.id, ol.id_listing, ol.qte_demandee, ol.qte_confirmee, ol.prix_unitaire,
                        wl.designation, wl.marque, wl.modele, wl.image
                   FROM wholesale_order_line ol
                   JOIN wholesale_listing wl ON wl.id = ol.id_listing
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
                `SELECT ol.qte_confirmee, ol.prix_unitaire, wl.designation, wl.marque, wl.modele, wl.barcode,
                        wl.image, wl.type, wl.sous_categorie, wl.qte_min
                   FROM wholesale_order_line ol
                   JOIN wholesale_listing wl ON wl.id = ol.id_listing
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

    // ── Orders: wholesale-editor side ───────────────────────────

    async confirmerCommande(id: number, lignes: { id_ligne: number; qte_confirmee: number }[], authorization?: string): Promise<void> {
        const acteur = await this.editeurRequis(authorization);
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
        await this.editeurRequis(authorization);
        const [order] = await this.dataSource.query(`SELECT statut FROM wholesale_order WHERE id = $1`, [id]);
        if (!order) throw new NotFoundException(`Commande #${id} introuvable`);
        if (order.statut !== 'confirmee') throw new BadRequestException('Cette commande doit être confirmée avant de démarrer la préparation.');
        await this.changerStatut(id, 'en_preparation', authorization);
    }

    /** Deducts the wholesale catalogue's own stock for real, row-locked. */
    async envoyerCommande(id: number, authorization?: string): Promise<void> {
        const acteur = await this.editeurRequis(authorization);
        await this.dataSource.transaction(async (m) => {
            const [order] = await m.query(`SELECT * FROM wholesale_order WHERE id = $1 FOR UPDATE`, [id]);
            if (!order) throw new NotFoundException(`Commande #${id} introuvable`);
            if (order.statut !== 'en_preparation') throw new BadRequestException("Cette commande doit être en préparation avant l'envoi.");

            const lignes = await m.query(
                `SELECT qte_confirmee, id_listing FROM wholesale_order_line WHERE id_order = $1`,
                [id],
            );
            for (const l of lignes) {
                const [listing] = await m.query(
                    `SELECT quantite, designation FROM wholesale_listing WHERE id = $1 FOR UPDATE`,
                    [l.id_listing],
                );
                if (!listing || Number(listing.quantite) < Number(l.qte_confirmee)) {
                    throw new BadRequestException(`Stock insuffisant pour "${listing?.designation || l.id_listing}".`);
                }
                await m.query(`UPDATE wholesale_listing SET quantite = quantite - $1 WHERE id = $2`, [l.qte_confirmee, l.id_listing]);
            }
            await m.query(`UPDATE wholesale_order SET statut = 'envoyee', date_envoi = now() WHERE id = $1`, [id]);
            await m.query(
                `INSERT INTO wholesale_order_event (id_order, par, statut_avant, statut_apres) VALUES ($1, $2, $3, 'envoyee')`,
                [id, acteur.id, order.statut],
            );
        });
    }

    // ── Product catalogue management (wholesale-editor side) ────

    async listerOffres(authorization?: string): Promise<any[]> {
        await this.editeurRequis(authorization);
        return this.dataSource.query(`SELECT * FROM wholesale_listing ORDER BY designation`);
    }

    async creerOffre(
        dto: {
            designation: string; marque?: string; modele?: string; barcode?: string; image?: string;
            type?: string; sous_categorie?: string; quantite?: number; prix_gros: number; qte_min?: number;
        },
        authorization?: string,
    ): Promise<{ id: number }> {
        await this.editeurRequis(authorization);
        const designation = String(dto.designation ?? '').trim();
        if (!designation) throw new BadRequestException('La désignation est obligatoire.');
        if (!(Number(dto.prix_gros) > 0)) throw new BadRequestException('Le prix de gros doit être supérieur à 0.');
        const rows = await this.dataSource.query(
            `INSERT INTO wholesale_listing (designation, marque, modele, barcode, image, type, sous_categorie, quantite, prix_gros, qte_min)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [designation, dto.marque || null, dto.modele || null, dto.barcode || null, dto.image || null,
                dto.type || null, dto.sous_categorie || null, dto.quantite || 0, dto.prix_gros, dto.qte_min || 1],
        );
        return { id: rows[0].id };
    }

    async modifierOffre(
        id: number,
        dto: {
            designation?: string; marque?: string; modele?: string; barcode?: string; image?: string;
            type?: string; sous_categorie?: string; quantite?: number; prix_gros?: number; qte_min?: number; visible?: boolean;
        },
        authorization?: string,
    ): Promise<void> {
        await this.editeurRequis(authorization);
        const res = await this.dataSource.query(
            `UPDATE wholesale_listing SET
                designation = COALESCE($2, designation), marque = COALESCE($3, marque), modele = COALESCE($4, modele),
                barcode = COALESCE($5, barcode), image = COALESCE($6, image), type = COALESCE($7, type),
                sous_categorie = COALESCE($8, sous_categorie), quantite = COALESCE($9, quantite),
                prix_gros = COALESCE($10, prix_gros), qte_min = COALESCE($11, qte_min), visible = COALESCE($12, visible)
             WHERE id = $1`,
            [id, dto.designation ?? null, dto.marque ?? null, dto.modele ?? null, dto.barcode ?? null, dto.image ?? null,
                dto.type ?? null, dto.sous_categorie ?? null, dto.quantite ?? null, dto.prix_gros ?? null, dto.qte_min ?? null, dto.visible ?? null],
        );
        const affected = Array.isArray(res) ? res[1] : 0;
        if (!affected) throw new NotFoundException(`Offre #${id} introuvable`);
    }

    async supprimerOffre(id: number, authorization?: string): Promise<void> {
        await this.editeurRequis(authorization);
        const res = await this.dataSource.query(`DELETE FROM wholesale_listing WHERE id = $1`, [id]);
        const affected = Array.isArray(res) ? res[1] : 0;
        if (!affected) throw new NotFoundException(`Offre #${id} introuvable`);
    }
}
