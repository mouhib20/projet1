import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not, IsNull } from 'typeorm';
import { Reparation } from './reparation.entity';
import { ReparationItem } from './reparation-item.entity';
import { CreateReparationDto } from './dtos/create-reparation.dto';
import { Client } from '../clients/client.entity';
import { Article } from '../articles/article.entity';
import { Vente } from '../ventes/vente.entity';
import { CaisseService } from '../caisse/caisse.service';

@Injectable()
export class ReparationsService {
    constructor(
        @InjectRepository(Reparation)
        private readonly reparationRepo: Repository<Reparation>,
        private readonly dataSource: DataSource,
        private readonly caisseService: CaisseService,
    ) { }

    findAll(): Promise<Reparation[]> {
        return this.reparationRepo.find({
            relations: ['client', 'items', 'items.article'],
            order: { date_reception: 'DESC', id_reparation: 'DESC' },
        });
    }

    private static readonly TYPE_TO_CATEGORIE: Record<string, string> = {
        'Écran': 'afficheur',
        'Batterie': 'batterie',
        'Filtre': 'filtre',
    };

    /**
     * Returned phones (repairs declared as a return of an earlier ticket), each with the part
     * that failed — the one on the original ticket matching the reported problem — and the
     * supplier(s) it was bought from. Suppliers are read with raw SQL so the Fournisseurs
     * module is left untouched.
     */
    async findRetours(): Promise<any[]> {
        const retours = await this.reparationRepo.find({
            where: { retour_de: Not(IsNull()) },
            relations: ['client', 'items', 'items.article'],
            order: { id_reparation: 'DESC' },
        });

        const result: any[] = [];
        for (const retour of retours) {
            const origine = await this.reparationRepo.findOne({
                where: { id_reparation: retour.retour_de as number },
                relations: ['items', 'items.article'],
            });

            const probleme = (retour.description || '').split(',')[0].trim();
            const categorie = ReparationsService.TYPE_TO_CATEGORIE[probleme];
            const itemDefectueux = categorie
                ? (origine?.items || []).find(i => (i.article?.sous_categorie || '').toLowerCase().startsWith(categorie))
                : undefined;

            let pieceDefectueuse: any = null;
            if (itemDefectueux?.article) {
                const fournisseurs = await this.dataSource.query(
                    `SELECT f.id_fournisseur, f.nom, f.prenom, f.entreprise, f.type_articles
                     FROM fournisseur_articles fa
                     JOIN fournisseur f ON f.id_fournisseur = fa."fournisseurId_fournisseur"
                     WHERE fa."articleId_article" = $1`,
                    [itemDefectueux.article.id_article],
                );
                pieceDefectueuse = {
                    id_article: itemDefectueux.article.id_article,
                    designation: itemDefectueux.article.designation,
                    fournisseurs,
                };
            }

            result.push({ ...retour, ticket_origine: origine ? origine.id_reparation : retour.retour_de, piece_defectueuse: pieceDefectueuse });
        }
        return result;
    }

    async findOne(id: number): Promise<Reparation> {
        const reparation = await this.reparationRepo.findOne({
            where: { id_reparation: id },
            relations: ['client', 'items', 'items.article'],
        });
        if (!reparation) throw new NotFoundException(`Reparation #${id} introuvable`);
        return reparation;
    }

    async create(data: CreateReparationDto, authorization?: string): Promise<Reparation> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const client = await queryRunner.manager.findOne(Client, {
                where: { id_client: data.id_client }
            });
            if (!client) throw new NotFoundException(`Client #${data.id_client} introuvable`);

            let prixTotalItems = 0;
            const repItems: ReparationItem[] = [];

            if (data.items && data.items.length > 0) {
                for (const itemDto of data.items) {
                    const article = await queryRunner.manager.findOne(Article, {
                        where: { id_article: itemDto.id_article }
                    });
                    if (!article) throw new NotFoundException(`Article #${itemDto.id_article} introuvable`);

                    if (article.quantite < itemDto.qte) {
                        throw new BadRequestException(`Stock insuffisant pour "${article.designation}". Disponible: ${article.quantite}, demandé: ${itemDto.qte}`);
                    }

                    // Decrement stock
                    article.quantite -= itemDto.qte;
                    await queryRunner.manager.save(article);

                    const prixUnitaire = itemDto.prix ?? article.prix_vente ?? 0;
                    prixTotalItems += prixUnitaire * itemDto.qte;

                    const repItem = queryRunner.manager.create(ReparationItem, {
                        article: { id_article: article.id_article },
                        qte: itemDto.qte,
                        prix: prixUnitaire
                    });
                    repItems.push(repItem);
                }
            }

            const coutMainOeuvre = data.cout_main_oeuvre ?? 0;
            const prixFinalResultat = data.prix ?? (prixTotalItems + coutMainOeuvre);
            const acompte = data.acompte ?? 0;
            if (acompte > prixFinalResultat) {
                throw new BadRequestException("L'acompte ne peut pas dépasser le prix de la réparation.");
            }

            const reparation = queryRunner.manager.create(Reparation, {
                client: { id_client: data.id_client },
                appareil: data.appareil,
                description: data.description,
                cout_main_oeuvre: coutMainOeuvre,
                prix: prixFinalResultat,
                acompte,
                retour_de: data.retour_de ?? null,
                degre_dommage: data.degre_dommage ?? null,
                statut: data.statut ?? 'En attente',
                date_reception: data.date_reception ?? new Date(),
                items: repItems
            });

            const savedReparation = await queryRunner.manager.save(reparation);

            /* Note: items are saved in cascade since cascade is set on the relation */

            // The deposit is cash received today: record it as a sale so it counts in the day's
            // caisse and statistics. The pickup at the POS then only charges the remainder.
            if (acompte > 0) {
                const venteAcompte = queryRunner.manager.create(Vente, {
                    designation: `Acompte réparation — ${data.appareil || 'Appareil'}`,
                    qte: 1,
                    prix: acompte,
                    cout: 0, // the parts cost is booked on the pickup line
                    date: new Date().toISOString().split('T')[0],
                    client: { id_client: data.id_client },
                    article: null,
                    id_reparation_origine: savedReparation.id_reparation,
                });
                await queryRunner.manager.save(venteAcompte);
            }

            await queryRunner.commitTransaction();

            if (acompte > 0) {
                const acteur = await this.caisseService.acteurOuSysteme(authorization);
                await this.caisseService.enregistrerAuto(acteur, {
                    type: 'entree',
                    source: 'reparation',
                    montant: acompte,
                    motif: `Acompte réparation #${savedReparation.id_reparation} — ${data.appareil || 'Appareil'}`,
                    reference: 'reparation:' + savedReparation.id_reparation,
                });
            }
            return this.findOne(savedReparation.id_reparation);
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Attaches a part to an already-created ticket (used when the part needed is only
     * known once the repair is actually done, at the "Maintenance terminée" step) and
     * adds its price to the ticket's total.
     */
    async addItem(id: number, data: { id_article: number; qte?: number; prix?: number }): Promise<Reparation> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const rep = await queryRunner.manager.findOne(Reparation, { where: { id_reparation: id } });
            if (!rep) throw new NotFoundException(`Reparation #${id} introuvable`);

            const article = await queryRunner.manager.findOne(Article, { where: { id_article: data.id_article } });
            if (!article) throw new NotFoundException(`Article #${data.id_article} introuvable`);

            const qte = data.qte ?? 1;
            if (article.quantite < qte) {
                throw new BadRequestException(`Stock insuffisant pour "${article.designation}". Disponible: ${article.quantite}, demandé: ${qte}`);
            }

            article.quantite -= qte;
            await queryRunner.manager.save(article);

            const prixUnitaire = data.prix ?? article.prix_vente ?? 0;
            const item = queryRunner.manager.create(ReparationItem, {
                reparation: { id_reparation: id },
                article: { id_article: article.id_article },
                qte,
                prix: prixUnitaire,
            });
            await queryRunner.manager.save(item);

            // Note: the ticket's total price (rep.prix) is NOT changed here. It's the amount
            // already agreed with the client upfront; the part's price is only tracked for
            // profit purposes (agreed total − cost of parts used), not added to the total.

            await queryRunner.commitTransaction();
            return this.findOne(id);
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    async updateStatus(id: number, statut: string): Promise<Reparation> {
        const rep = await this.findOne(id);
        rep.statut = statut;
        await this.reparationRepo.save(rep);
        return rep;
    }

    /**
     * Finalizes the ticket as "Vente avec reçu": records the amount received, closes the
     * ticket, and creates a matching Vente record so the pickup/payment counts as a real
     * sale (shows up in the sales history, revenue and statistics, like a POS transaction).
     */
    async finaliserVente(id: number, montant_recu: number): Promise<Reparation> {
        if (montant_recu === undefined || montant_recu === null || montant_recu < 0) {
            throw new BadRequestException('Le montant reçu est invalide.');
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const rep = await queryRunner.manager.findOne(Reparation, {
                where: { id_reparation: id },
                relations: ['client'],
            });
            if (!rep) throw new NotFoundException(`Reparation #${id} introuvable`);

            rep.montant_recu = montant_recu;
            rep.statut = 'Vente avec reçu';
            await queryRunner.manager.save(rep);

            const [{ cout }] = await queryRunner.query(
                `SELECT COALESCE(SUM(ri.qte * COALESCE(a.prix_achat, 0)), 0) AS cout
                   FROM reparation_item ri LEFT JOIN article a ON a.id_article = ri.id_article
                  WHERE ri.id_reparation = $1`,
                [id],
            );
            const vente = queryRunner.manager.create(Vente, {
                designation: `Réparation — ${rep.appareil || 'Appareil'}`,
                qte: 1,
                prix: montant_recu,
                cout: Number(cout) || 0,
                date: new Date().toISOString().split('T')[0],
                client: rep.client ? { id_client: rep.client.id_client } : null,
                article: null,
                id_reparation_origine: id,
            });
            await queryRunner.manager.save(vente);

            await queryRunner.commitTransaction();
            return this.findOne(id);
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    async remove(id: number): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const reparation = await queryRunner.manager.findOne(Reparation, {
                where: { id_reparation: id },
                relations: ['items', 'items.article'],
            });
            if (!reparation) throw new NotFoundException(`Reparation #${id} introuvable`);

            // Restore stock
            if (reparation.items && reparation.items.length > 0) {
                for (const item of reparation.items) {
                    if (item.article) {
                        const article = await queryRunner.manager.findOne(Article, {
                            where: { id_article: item.article.id_article }
                        });
                        if (article) {
                            article.quantite += item.qte;
                            await queryRunner.manager.save(article);
                        }
                    }
                }
            }

            await queryRunner.manager.delete(Reparation, id);
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Returns the phone to the client instead of continuing the repair (part unavailable,
     * disagreement…). Only while the ticket is still "En attente"/"En cours" — once maintenance is
     * done the phone has already been worked on. The parts reserved for it go back to stock, the
     * ticket is kept in the list as "Annulé" (not deleted, so the record stays), and any deposit
     * already taken is handed back: its sale line is removed and the amount leaves the caisse.
     */
    async annuler(id: number, motif: string | undefined, authorization?: string): Promise<Reparation> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        let montantRembourse = 0;
        let savedReparation: Reparation;
        try {
            const reparation = await queryRunner.manager.findOne(Reparation, {
                where: { id_reparation: id },
                relations: ['items', 'items.article', 'client'],
            });
            if (!reparation) throw new NotFoundException(`Reparation #${id} introuvable`);
            if (reparation.statut !== 'En attente' && reparation.statut !== 'En cours') {
                throw new BadRequestException("Seul un ticket encore en attente/en cours peut être annulé (le téléphone a déjà été rendu ou vendu).");
            }

            // Give back the parts reserved for this ticket
            for (const item of reparation.items || []) {
                if (!item.article) continue;
                const article = await queryRunner.manager.findOne(Article, { where: { id_article: item.article.id_article } });
                if (article) {
                    article.quantite += item.qte;
                    await queryRunner.manager.save(article);
                }
            }

            // Undo the deposit sale line, if any, and remember how much to hand back
            const ventesAcompte = await queryRunner.manager.find(Vente, { where: { id_reparation_origine: id } });
            for (const v of ventesAcompte) montantRembourse += (v.qte || 1) * Number(v.prix || 0);
            if (ventesAcompte.length > 0) await queryRunner.manager.remove(ventesAcompte);

            reparation.statut = 'Annulé';
            reparation.description = motif
                ? `${reparation.description ? reparation.description + ' — ' : ''}Annulé : ${motif}`
                : reparation.description;
            savedReparation = await queryRunner.manager.save(reparation);

            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }

        if (montantRembourse > 0) {
            const acteur = await this.caisseService.acteurOuSysteme(authorization);
            await this.caisseService.enregistrerAuto(acteur, {
                type: 'sortie',
                source: 'reparation',
                montant: montantRembourse,
                motif: `Remboursement acompte — ticket #${id} annulé (${savedReparation.appareil || 'Appareil'})`,
                reference: 'reparation:' + id,
            });
        }
        return this.findOne(id);
    }
}
