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
import { StoreContextService } from '../store-context/store-context.service';

@Injectable()
export class ReparationsService {
    constructor(
        @InjectRepository(Reparation)
        private readonly reparationRepo: Repository<Reparation>,
        private readonly dataSource: DataSource,
        private readonly caisseService: CaisseService,
        private readonly storeContext: StoreContextService,
    ) { }

    findAll(): Promise<Reparation[]> {
        return this.reparationRepo.find({
            where: { id_magasin: this.storeContext.requireMagasinId() },
            relations: ['client', 'items', 'items.article'],
            order: { date_reception: 'DESC', id_reparation: 'DESC' },
        });
    }

    /** Tickets ready to be picked up (awaiting the checkout/"Vente avec reçu" step) - the minimal
     *  slice of repair data the offline POS needs for its repair-pickup cart lines. Incremental
     *  pull, same pattern as ArticlesService.syncDepuis / ClientsService.syncDepuis. */
    async pickupReady(since?: string): Promise<any[]> {
        const id_magasin = this.storeContext.requireMagasinId();
        return this.dataSource.query(
            `SELECT r.id_reparation, r.appareil, r.prix, r.statut, r.updated_at,
                    r.id_client, c.nom AS client_nom
               FROM reparation r LEFT JOIN client c ON c.id_client = r.id_client
              WHERE r.id_magasin = $1
                AND r.statut IN ('Livraison et réception', 'Terminé')
                ${since ? 'AND r.updated_at > $2' : ''}
              ORDER BY r.updated_at ASC`,
            since ? [id_magasin, since] : [id_magasin],
        );
    }

    /** Tickets still in progress (not yet ready for pickup) - the offline reparation page's local
     *  cache, used both to render the ticket list offline and to decide which tickets are eligible
     *  for the offline "maintenance terminée" status change (see
     *  ReparationComponent.peutMarquerPretHorsLigne). Includes client_nom/prix/date_reception, same
     *  as pickupReady(), so the offline list renders identically to the live one. Items are
     *  aggregated in SQL to keep the payload lean, same spirit as findRetours()'s manual joins. */
    async activeSync(since?: string): Promise<any[]> {
        const id_magasin = this.storeContext.requireMagasinId();
        return this.dataSource.query(
            `SELECT r.id_reparation, r.appareil, r.description, r.statut, r.id_client, r.updated_at,
                    r.prix, r.date_reception, c.nom AS client_nom,
                    COALESCE(json_agg(json_build_object(
                        'id_article', ri.id_article, 'qte', ri.qte, 'prix', ri.prix,
                        'sous_categorie', a.sous_categorie
                    )) FILTER (WHERE ri.id_article IS NOT NULL), '[]') AS items
               FROM reparation r
               LEFT JOIN client c ON c.id_client = r.id_client
               LEFT JOIN reparation_item ri ON ri.id_reparation = r.id_reparation
               LEFT JOIN article a ON a.id_article = ri.id_article
              WHERE r.id_magasin = $1 AND r.statut IN ('En attente', 'En cours')
                ${since ? 'AND r.updated_at > $2' : ''}
              GROUP BY r.id_reparation, c.nom
              ORDER BY r.updated_at ASC`,
            since ? [id_magasin, since] : [id_magasin],
        );
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
        const id_magasin = this.storeContext.requireMagasinId();
        const retours = await this.reparationRepo.find({
            where: { retour_de: Not(IsNull()), id_magasin },
            relations: ['client', 'items', 'items.article'],
            order: { id_reparation: 'DESC' },
        });

        const result: any[] = [];
        for (const retour of retours) {
            const origine = await this.reparationRepo.findOne({
                where: { id_reparation: retour.retour_de as number, id_magasin },
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
            where: { id_reparation: id, id_magasin: this.storeContext.requireMagasinId() },
            relations: ['client', 'items', 'items.article'],
        });
        if (!reparation) throw new NotFoundException(`Reparation #${id} introuvable`);
        return reparation;
    }

    /** Present only when this create is being replayed from an offline device's outbox - makes
     *  the call idempotent and allows stock to go negative instead of being rejected, exactly
     *  like VentesService.checkout(). See that method for the fuller rationale. */
    async create(data: CreateReparationDto, authorization?: string): Promise<Reparation & { avertissements?: string[] }> {
        const id_magasin = this.storeContext.requireMagasinId();

        if (data.client_id) {
            const [existant] = await this.dataSource.query(
                `SELECT resultat FROM sync_operation_log WHERE client_id = $1 AND id_magasin = $2`,
                [data.client_id, id_magasin],
            );
            if (existant) {
                const reparation = await this.findOne(existant.resultat?.id_reparation);
                return { ...reparation, avertissements: existant.resultat?.avertissements || [] };
            }
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const avertissements: string[] = [];
            const client = await queryRunner.manager.findOne(Client, {
                where: { id_client: data.id_client, id_magasin }
            });
            if (!client) throw new NotFoundException(`Client #${data.id_client} introuvable`);

            let prixTotalItems = 0;
            const repItems: ReparationItem[] = [];

            if (data.items && data.items.length > 0) {
                for (const itemDto of data.items) {
                    const article = await queryRunner.manager.findOne(Article, {
                        where: { id_article: itemDto.id_article, id_magasin },
                        lock: { mode: 'pessimistic_write' },
                    });
                    if (!article) throw new NotFoundException(`Article #${itemDto.id_article} introuvable`);

                    if (article.quantite < itemDto.qte) {
                        if (!data.client_id) {
                            throw new BadRequestException(`Stock insuffisant pour "${article.designation}". Disponible: ${article.quantite}, demandé: ${itemDto.qte}`);
                        }
                        // Offline ticket being replayed: the part was already physically taken -
                        // honour it and let the stock go negative, but flag it for the store owner.
                        avertissements.push(
                            `Stock devenu négatif pour "${article.designation}" après synchronisation (disponible : ${article.quantite}, utilisé : ${itemDto.qte}).`
                        );
                    }

                    // Decrement stock
                    article.quantite -= itemDto.qte;
                    await queryRunner.manager.save(article);

                    const prixUnitaire = itemDto.prix ?? article.prix_vente ?? 0;
                    prixTotalItems += prixUnitaire * itemDto.qte;

                    const repItem = queryRunner.manager.create(ReparationItem, {
                        article: { id_article: article.id_article },
                        qte: itemDto.qte,
                        prix: prixUnitaire,
                        id_magasin,
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
                items: repItems,
                id_magasin,
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
                    id_magasin,
                });
                await queryRunner.manager.save(venteAcompte);
            }

            if (data.client_id) {
                const acteur = await this.caisseService.acteurOuSysteme(authorization);
                await queryRunner.query(
                    `INSERT INTO sync_operation_log (client_id, id_magasin, id_utilisateur, type, resultat, avertissement)
                     VALUES ($1, $2, $3, 'reparation_create', $4, $5)`,
                    [data.client_id, id_magasin, acteur.id, JSON.stringify({ id_reparation: savedReparation.id_reparation, avertissements }), avertissements.join(' ') || null],
                );
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
            const reparationComplete = await this.findOne(savedReparation.id_reparation);
            return { ...reparationComplete, avertissements };
        } catch (err) {
            await queryRunner.rollbackTransaction();
            // Two near-simultaneous sync retries of the same offline ticket raced each other; the
            // other one won and already recorded it (unique client_id) - return its result instead
            // of surfacing a spurious error for what is, from the client's point of view, a success.
            if (data.client_id && (err as any)?.code === '23505') {
                return this.create(data, authorization);
            }
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
        const id_magasin = this.storeContext.requireMagasinId();
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const rep = await queryRunner.manager.findOne(Reparation, { where: { id_reparation: id, id_magasin } });
            if (!rep) throw new NotFoundException(`Reparation #${id} introuvable`);

            const article = await queryRunner.manager.findOne(Article, { where: { id_article: data.id_article, id_magasin }, lock: { mode: 'pessimistic_write' } });
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
                id_magasin,
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

        const id_magasin = this.storeContext.requireMagasinId();
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const rep = await queryRunner.manager.findOne(Reparation, {
                where: { id_reparation: id, id_magasin },
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
                id_magasin,
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
        const id_magasin = this.storeContext.requireMagasinId();
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const reparation = await queryRunner.manager.findOne(Reparation, {
                where: { id_reparation: id, id_magasin },
                relations: ['items', 'items.article'],
            });
            if (!reparation) throw new NotFoundException(`Reparation #${id} introuvable`);

            // Restore stock
            if (reparation.items && reparation.items.length > 0) {
                for (const item of reparation.items) {
                    if (item.article) {
                        const article = await queryRunner.manager.findOne(Article, {
                            where: { id_article: item.article.id_article, id_magasin },
                            lock: { mode: 'pessimistic_write' },
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
        const id_magasin = this.storeContext.requireMagasinId();
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        let montantRembourse = 0;
        let savedReparation: Reparation;
        try {
            const reparation = await queryRunner.manager.findOne(Reparation, {
                where: { id_reparation: id, id_magasin },
                relations: ['items', 'items.article', 'client'],
            });
            if (!reparation) throw new NotFoundException(`Reparation #${id} introuvable`);
            if (reparation.statut !== 'En attente' && reparation.statut !== 'En cours') {
                throw new BadRequestException("Seul un ticket encore en attente/en cours peut être annulé (le téléphone a déjà été rendu ou vendu).");
            }

            // Give back the parts reserved for this ticket
            for (const item of reparation.items || []) {
                if (!item.article) continue;
                const article = await queryRunner.manager.findOne(Article, { where: { id_article: item.article.id_article, id_magasin }, lock: { mode: 'pessimistic_write' } });
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
