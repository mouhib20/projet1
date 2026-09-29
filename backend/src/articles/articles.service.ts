import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Article } from './article.entity';
import { StoreContextService } from '../store-context/store-context.service';

@Injectable()
export class ArticlesService {
    constructor(
        @InjectRepository(Article)
        private readonly repo: Repository<Article>,
        private readonly dataSource: DataSource,
        private readonly storeContext: StoreContextService,
    ) { }

    findAll(): Promise<Article[]> {
        return this.repo.find({ where: { id_magasin: this.storeContext.requireMagasinId() }, order: { id_article: 'DESC' } });
    }

    /** Incremental pull for the offline POS cache: only rows touched since `since` (all of them if
     *  omitted, for the device's very first sync). Row deletions are not reconciled here (phase 1
     *  limitation - no deletion log yet), so a device also does an occasional full re-pull. */
    async syncDepuis(since?: string): Promise<Article[]> {
        const id_magasin = this.storeContext.requireMagasinId();
        return this.dataSource.query(
            `SELECT id_article, designation, prix_achat, prix_vente, barcode, marque, modele, type,
                    sous_categorie, quantite, qte_min, image, updated_at
               FROM article
              WHERE id_magasin = $1 ${since ? 'AND updated_at > $2' : ''}
              ORDER BY updated_at ASC`,
            since ? [id_magasin, since] : [id_magasin],
        );
    }

    async findOne(id: number): Promise<Article> {
        const article = await this.repo.findOneBy({ id_article: id, id_magasin: this.storeContext.requireMagasinId() });
        if (!article) throw new NotFoundException(`Article #${id} introuvable`);
        return article;
    }

    create(dto: Partial<Article>): Promise<Article> {
        if (!dto.designation || !String(dto.designation).trim()) {
            throw new BadRequestException('La désignation est obligatoire.');
        }
        const { id_magasin: _ignore, ...safeDto } = dto as any;
        const data: Partial<Article> = { ...safeDto, id_magasin: this.storeContext.requireMagasinId() };
        const article = this.repo.create(data);
        return this.repo.save(article);
    }

    async update(id: number, dto: Partial<Article>): Promise<Article> {
        await this.findOne(id);
        const { id_magasin: _ignore, ...safeDto } = dto as any;
        await this.repo.update(id, safeDto);
        return this.findOne(id);
    }

    async remove(id: number): Promise<void> {
        await this.findOne(id);
        await this.repo.delete(id);
    }

    /**
     * Cross-store barcode lookup — the one deliberate exception to store scoping in this
     * service. Used only to pre-fill a NEW article's descriptive fields when another store has
     * already registered the same barcode, so entering a purchase invoice is faster. Returns
     * only reference/descriptive fields (designation, marque, modele, type, sous_categorie,
     * image, barcode) — NEVER prix_achat, prix_vente, quantite, qte_min, id_magasin or
     * id_article, and never anything identifying which store registered it first. The article
     * actually created afterward is, as always, scoped to the caller's own store only.
     */
    async rechercheCatalogue(barcode: string): Promise<{
        designation: string; marque: string | null; modele: string | null;
        type: string | null; sous_categorie: string | null; image: string | null; barcode: string;
    } | null> {
        const trimmed = String(barcode ?? '').trim();
        if (!trimmed) return null;
        const rows = await this.dataSource.query(
            `SELECT designation, marque, modele, type, sous_categorie, image, barcode
               FROM article WHERE barcode = $1
              ORDER BY id_article DESC LIMIT 1`,
            [trimmed],
        );
        return rows[0] ?? null;
    }

    /** Parts sent back to a supplier, most recent first, with the problem that was reported. */
    findRetoursFournisseur(): Promise<any[]> {
        return this.dataSource.query(
            `SELECT rf.id, rf.id_article, a.designation, a.marque, a.modele, a.sous_categorie, a.type,
                    rf.qte, rf.probleme, rf.date_retour,
                    f.id_fournisseur, f.nom, f.prenom, f.entreprise, f.type_articles
             FROM retour_fournisseur rf
             LEFT JOIN article a ON a.id_article = rf.id_article
             LEFT JOIN fournisseur f ON f.id_fournisseur = rf.id_fournisseur
             WHERE rf.id_magasin = $1
             ORDER BY rf.id DESC`,
            [this.storeContext.requireMagasinId()],
        );
    }

    /** After-sales (SAV): defective accessories brought back by clients, most recent first. */
    findSav(): Promise<any[]> {
        return this.dataSource.query(
            `SELECT s.id, s.id_article, a.designation, a.marque, a.modele, s.qte, s.probleme,
                    s.degre_dommage, s.statut, s.date_retour, s.id_article_remplacement,
                    r.designation AS remplacement, c.id_client, c.nom AS client_nom, c.telephone AS client_telephone
             FROM sav_accessoire s
             LEFT JOIN article a ON a.id_article = s.id_article
             LEFT JOIN article r ON r.id_article = s.id_article_remplacement
             LEFT JOIN client c ON c.id_client = s.id_client
             WHERE s.id_magasin = $1
             ORDER BY s.id DESC`,
            [this.storeContext.requireMagasinId()],
        );
    }

    /** Records a defective accessory brought back by a client. Stock is not touched here. */
    async creerSav(data: { id_article: number; id_client?: number; qte?: number; probleme: string; degre_dommage?: string }) {
        const probleme = (data.probleme || '').trim();
        if (!probleme) throw new BadRequestException("Décrivez le problème de l'accessoire.");
        const qte = data.qte ?? 1;
        if (!Number.isInteger(qte) || qte < 1) throw new BadRequestException('Quantité invalide.');
        if (data.degre_dommage && !['Léger', 'Moyen', 'Grave'].includes(data.degre_dommage)) {
            throw new BadRequestException('Degré de dommage invalide.');
        }
        const article = await this.findOne(data.id_article); // throws if not found or another store's
        if (article.type !== 'accessory') throw new BadRequestException("Cet article n'est pas un accessoire.");
        const rows = await this.dataSource.query(
            `INSERT INTO sav_accessoire (id_article, id_client, qte, probleme, degre_dommage, id_magasin) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [data.id_article, data.id_client || null, qte, probleme, data.degre_dommage || null, this.storeContext.requireMagasinId()],
        );
        return { id: rows[0].id };
    }

    /** Replaces a returned accessory with one from the stock: takes it out of stock and closes the SAV entry. */
    async remplacerSav(savId: number, idArticleRemplacement: number) {
        const id_magasin = this.storeContext.requireMagasinId();
        const [sav] = await this.dataSource.query(`SELECT id, qte, statut FROM sav_accessoire WHERE id = $1 AND id_magasin = $2`, [savId, id_magasin]);
        if (!sav) throw new NotFoundException(`SAV #${savId} introuvable`);
        if (sav.statut !== 'En attente') throw new BadRequestException('Ce retour a déjà été traité.');
        const remplacement = await this.findOne(idArticleRemplacement); // throws if not found or another store's
        if (remplacement.type !== 'accessory') throw new BadRequestException("L'article de remplacement doit être un accessoire.");
        if (remplacement.quantite < sav.qte) {
            throw new BadRequestException(`Stock insuffisant pour "${remplacement.designation}". Disponible: ${remplacement.quantite}, demandé: ${sav.qte}`);
        }
        await this.dataSource.transaction(async (manager) => {
            await manager.query(`UPDATE article SET quantite = quantite - $1 WHERE id_article = $2 AND id_magasin = $3`, [sav.qte, idArticleRemplacement, id_magasin]);
            await manager.query(
                `UPDATE sav_accessoire SET statut = 'Remplacé', id_article_remplacement = $1 WHERE id = $2 AND id_magasin = $3`,
                [idArticleRemplacement, savId, id_magasin],
            );
        });
        return { remplacement: remplacement.designation };
    }

    /**
     * Sends a defective part back to its supplier: takes it out of the stock and logs the
     * problem (retour_fournisseur). The supplier is the one linked to the article, if any.
     */
    async renvoyerAuFournisseur(
        articleId: number,
        data: { probleme: string; qte?: number },
    ): Promise<{ fournisseur: string | null }> {
        const id_magasin = this.storeContext.requireMagasinId();
        const probleme = (data.probleme || '').trim();
        if (!probleme) throw new BadRequestException('Décrivez le problème de la pièce.');
        const qte = data.qte ?? 1;
        const article = await this.findOne(articleId); // throws if not found or another store's
        if (!Number.isInteger(qte) || qte < 1) throw new BadRequestException('Quantité invalide.');
        if (article.quantite < qte) {
            throw new BadRequestException(`Stock insuffisant pour "${article.designation}". Disponible: ${article.quantite}, demandé: ${qte}`);
        }

        const fournisseurs = await this.dataSource.query(
            `SELECT f.id_fournisseur, f.nom, f.prenom, f.entreprise
             FROM fournisseur_articles fa
             JOIN fournisseur f ON f.id_fournisseur = fa."fournisseurId_fournisseur"
             WHERE fa."articleId_article" = $1 AND f.id_magasin = $2
             ORDER BY f.id_fournisseur`,
            [articleId, id_magasin],
        );
        const f = fournisseurs[0] ?? null;

        await this.dataSource.transaction(async (manager) => {
            await manager.query(`UPDATE article SET quantite = quantite - $1 WHERE id_article = $2 AND id_magasin = $3`, [qte, articleId, id_magasin]);
            await manager.query(
                `INSERT INTO retour_fournisseur (id_article, id_fournisseur, qte, probleme, id_magasin) VALUES ($1, $2, $3, $4, $5)`,
                [articleId, f ? f.id_fournisseur : null, qte, probleme, id_magasin],
            );
        });

        return { fournisseur: f ? (f.entreprise || `${f.nom} ${f.prenom || ''}`.trim()) : null };
    }

    /**
     * Records which supplier a (typically newly priced) article comes from, and charges
     * its purchase price to that supplier's balance (solde) — the shop now owes them for
     * it, just like a regular purchase invoice would.
     */
    async linkFournisseur(articleId: number, fournisseurId: number): Promise<void> {
        const id_magasin = this.storeContext.requireMagasinId();
        const article = await this.findOne(articleId); // throws if not found or another store's
        if (!fournisseurId) return;
        await this.dataSource.query(
            `INSERT INTO fournisseur_articles ("fournisseurId_fournisseur", "articleId_article")
             SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM fournisseur WHERE id_fournisseur = $1 AND id_magasin = $3)
             ON CONFLICT DO NOTHING`,
            [fournisseurId, articleId, id_magasin]
        );
        await this.dataSource.query(
            `UPDATE fournisseur SET solde = solde + $1 WHERE id_fournisseur = $2 AND id_magasin = $3`,
            [article.prix_achat || 0, fournisseurId, id_magasin]
        );
    }
}
