import { Injectable, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { FactureAchat } from './facture-achat.entity';
import { MouvementAchat } from '../mouvements-achat/mouvement-achat.entity';
import { Article } from '../articles/article.entity';
import { Fournisseur } from '../fournisseurs/fournisseur.entity';
import { StocksService } from '../stocks/stocks.service';

@Injectable()
export class FacturesAchatService {
    constructor(
        @InjectRepository(FactureAchat)
        private readonly factureRepo: Repository<FactureAchat>,
        private readonly dataSource: DataSource,
        private readonly stocksService: StocksService,
    ) { }

    findAll(): Promise<FactureAchat[]> {
        return this.factureRepo.find({ relations: ['fournisseur', 'mouvements_achat', 'mouvements_achat.article'] });
    }

    async findOne(id: number): Promise<FactureAchat> {
        const facture = await this.factureRepo.findOne({
            where: { id_facture: id },
            relations: ['fournisseur', 'mouvements_achat', 'mouvements_achat.article']
        });
        if (!facture) throw new NotFoundException(`Facture #${id} introuvable`);
        return facture;
    }

    async create(data: any): Promise<FactureAchat> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // 1. Create FactureAchat record with full financial details
            const facture = queryRunner.manager.create(FactureAchat, {
                reference: data.reference,
                date_facture: data.date_facture,
                total_ht: data.total_ht,
                total_tva: data.total_tva || 0,
                remise: data.remise || 0,
                net_a_payer: data.net_a_payer || data.total_ht,
                montant_paye: data.montant_paye || 0,
                reste_a_payer: data.reste_a_payer ?? (data.net_a_payer || data.total_ht),
                fournisseur: { id_fournisseur: data.fournisseurId }
            });

            const savedFacture = await queryRunner.manager.save(facture);

            // 2. Load fournisseur (no articles relation to avoid join table query)
            const fournisseur = await queryRunner.manager.findOne(Fournisseur, {
                where: { id_fournisseur: data.fournisseurId },
            });
            if (!fournisseur) throw new Error(`Fournisseur ${data.fournisseurId} introuvable`);


            // 3. Process each item line
            if (data.items && data.items.length > 0) {
                for (const item of data.items) {
                    let article: Article;

                    if (item.isNew && !item.articleId) {
                        // ---------- NEW ARTICLE ----------
                        if (!item.designation && (!item.marque || !item.modele)) {
                            throw new Error('Désignation ou Marque/Modèle obligatoires pour un nouvel article.');
                        }

                        // Generate designation if not provided
                        const generatedDesignation = item.designation ||
                            `${item.type || 'Pièce'} ${item.marque || ''} ${item.modele || ''}`.trim();

                        // Create the new article
                        article = queryRunner.manager.create(Article, {
                            designation: generatedDesignation,
                            barcode: item.barcode || null,
                            prix_achat: item.prix || 0,
                            prix_vente: item.prix_vente || 0,
                            quantite: item.qte,   // initial stock
                            type: item.type || 'part',
                            sous_categorie: item.sous_categorie || null,
                            marque: item.marque || null,
                            modele: item.modele || null,
                        });
                        article = await queryRunner.manager.save(article);

                        // Link new article to the fournisseur via raw SQL (avoids TypeORM column naming issues)
                        await queryRunner.query(
                            `INSERT IGNORE INTO fournisseur_articles (fournisseurId_fournisseur, articleId_article) VALUES (?, ?)`,
                            [data.fournisseurId, article.id_article]
                        );

                    } else {
                        // ---------- EXISTING ARTICLE ----------
                        article = await queryRunner.manager.findOne(Article, {
                            where: { id_article: item.articleId },
                        });
                        if (!article) throw new Error(`Article ${item.articleId} introuvable`);

                        // Increment stock quantity via StocksService
                        await this.stocksService.increaseStock(article.id_article, item.qte);
                        if (item.prix > 0) {
                            article.prix_achat = item.prix; // update purchase price to latest
                        }
                        if (item.prix_vente && item.prix_vente > 0) {
                            article.prix_vente = item.prix_vente; // update sale price to latest
                        }
                        await queryRunner.manager.save(article);
                    }

                    // 4. Create MouvementAchat for this line
                    const mouvement = queryRunner.manager.create(MouvementAchat, {
                        qte: item.qte,
                        prix: item.prix,
                        date_mouvement: savedFacture.date_facture,
                        fournisseur: { id_fournisseur: data.fournisseurId },
                        article: { id_article: article.id_article },
                        facture_achat: { id_facture: savedFacture.id_facture }
                    });
                    await queryRunner.manager.save(mouvement);
                }
            }

            // 5. Update Fournisseur solde: add reste_a_payer (amount still owed to supplier)
            const resteAPayer = data.reste_a_payer ?? (data.net_a_payer || data.total_ht);
            fournisseur.solde = Number(fournisseur.solde || 0) + Number(resteAPayer || 0);
            await queryRunner.manager.save(fournisseur);

            await queryRunner.commitTransaction();
            return this.findOne(savedFacture.id_facture);
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw new HttpException(err.message || 'Internal DB Error', HttpStatus.BAD_REQUEST);
        } finally {
            await queryRunner.release();
        }
    }
}
