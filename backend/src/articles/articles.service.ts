import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Article } from './article.entity';

@Injectable()
export class ArticlesService {
    constructor(
        @InjectRepository(Article)
        private readonly repo: Repository<Article>,
        private readonly dataSource: DataSource,
    ) { }

    findAll(): Promise<Article[]> {
        return this.repo.find({ order: { id_article: 'DESC' } });
    }

    async findOne(id: number): Promise<Article> {
        const article = await this.repo.findOneBy({ id_article: id });
        if (!article) throw new NotFoundException(`Article #${id} introuvable`);
        return article;
    }

    create(dto: Partial<Article>): Promise<Article> {
        if (!dto.designation || !String(dto.designation).trim()) {
            throw new BadRequestException('La désignation est obligatoire.');
        }
        const article = this.repo.create(dto);
        return this.repo.save(article);
    }

    async update(id: number, dto: Partial<Article>): Promise<Article> {
        await this.findOne(id);
        await this.repo.update(id, dto);
        return this.findOne(id);
    }

    async remove(id: number): Promise<void> {
        await this.findOne(id);
        await this.repo.delete(id);
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
             ORDER BY rf.id DESC`,
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
             ORDER BY s.id DESC`,
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
        const article = await this.findOne(data.id_article);
        if (article.type !== 'accessory') throw new BadRequestException("Cet article n'est pas un accessoire.");
        const rows = await this.dataSource.query(
            `INSERT INTO sav_accessoire (id_article, id_client, qte, probleme, degre_dommage) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [data.id_article, data.id_client || null, qte, probleme, data.degre_dommage || null],
        );
        return { id: rows[0].id };
    }

    /** Replaces a returned accessory with one from the stock: takes it out of stock and closes the SAV entry. */
    async remplacerSav(savId: number, idArticleRemplacement: number) {
        const [sav] = await this.dataSource.query(`SELECT id, qte, statut FROM sav_accessoire WHERE id = $1`, [savId]);
        if (!sav) throw new NotFoundException(`SAV #${savId} introuvable`);
        if (sav.statut !== 'En attente') throw new BadRequestException('Ce retour a déjà été traité.');
        const remplacement = await this.findOne(idArticleRemplacement);
        if (remplacement.type !== 'accessory') throw new BadRequestException("L'article de remplacement doit être un accessoire.");
        if (remplacement.quantite < sav.qte) {
            throw new BadRequestException(`Stock insuffisant pour "${remplacement.designation}". Disponible: ${remplacement.quantite}, demandé: ${sav.qte}`);
        }
        await this.dataSource.transaction(async (manager) => {
            await manager.query(`UPDATE article SET quantite = quantite - $1 WHERE id_article = $2`, [sav.qte, idArticleRemplacement]);
            await manager.query(
                `UPDATE sav_accessoire SET statut = 'Remplacé', id_article_remplacement = $1 WHERE id = $2`,
                [idArticleRemplacement, savId],
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
        const probleme = (data.probleme || '').trim();
        if (!probleme) throw new BadRequestException('Décrivez le problème de la pièce.');
        const qte = data.qte ?? 1;
        const article = await this.findOne(articleId);
        if (!Number.isInteger(qte) || qte < 1) throw new BadRequestException('Quantité invalide.');
        if (article.quantite < qte) {
            throw new BadRequestException(`Stock insuffisant pour "${article.designation}". Disponible: ${article.quantite}, demandé: ${qte}`);
        }

        const fournisseurs = await this.dataSource.query(
            `SELECT f.id_fournisseur, f.nom, f.prenom, f.entreprise
             FROM fournisseur_articles fa
             JOIN fournisseur f ON f.id_fournisseur = fa."fournisseurId_fournisseur"
             WHERE fa."articleId_article" = $1
             ORDER BY f.id_fournisseur`,
            [articleId],
        );
        const f = fournisseurs[0] ?? null;

        await this.dataSource.transaction(async (manager) => {
            await manager.query(`UPDATE article SET quantite = quantite - $1 WHERE id_article = $2`, [qte, articleId]);
            await manager.query(
                `INSERT INTO retour_fournisseur (id_article, id_fournisseur, qte, probleme) VALUES ($1, $2, $3, $4)`,
                [articleId, f ? f.id_fournisseur : null, qte, probleme],
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
        const article = await this.findOne(articleId);
        if (!fournisseurId) return;
        await this.dataSource.query(
            `INSERT INTO fournisseur_articles ("fournisseurId_fournisseur", "articleId_article") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [fournisseurId, articleId]
        );
        await this.dataSource.query(
            `UPDATE fournisseur SET solde = solde + $1 WHERE id_fournisseur = $2`,
            [article.prix_achat || 0, fournisseurId]
        );
    }
}
