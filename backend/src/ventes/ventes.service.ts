import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between } from 'typeorm';
import { Vente } from './vente.entity';
import { Article } from '../articles/article.entity';
import { Reparation } from '../reparations/reparation.entity';
import { StocksService } from '../stocks/stocks.service';
import { ClientsService } from '../clients/clients.service';
import { CaisseService } from '../caisse/caisse.service';

@Injectable()
export class VentesService {
    constructor(
        @InjectRepository(Vente)
        private readonly venteRepo: Repository<Vente>,
        private readonly dataSource: DataSource,
        private readonly stocksService: StocksService,
        private readonly clientsService: ClientsService,
        private readonly caisseService: CaisseService,
    ) { }

    findAll(): Promise<Vente[]> {
        return this.venteRepo.find({
            relations: ['client', 'article'],
            order: { id_vente: 'DESC' },
        });
    }

    async findOne(id: number): Promise<Vente> {
        const vente = await this.venteRepo.findOne({
            where: { id_vente: id },
            relations: ['client', 'article'],
        });
        if (!vente) throw new NotFoundException(`Vente #${id} introuvable`);
        return vente;
    }

    async create(data: any, authorization?: string): Promise<Vente> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // 1. Load the article and check stock
            const article = await queryRunner.manager.findOne(Article, {
                where: { id_article: data.articleId },
            });
            if (!article) throw new NotFoundException(`Article ${data.articleId} introuvable`);

            const qte = data.qte || 1;
            if (article.quantite < qte) {
                throw new BadRequestException(
                    `Stock insuffisant pour "${article.designation}". Disponible: ${article.quantite}, demandé: ${qte}`
                );
            }

            // 2. Decrement stock inside this transaction, so a failed sale gives it back
            article.quantite -= qte;
            await queryRunner.manager.save(article);

            // 3. Create the Vente record
            const vente = queryRunner.manager.create(Vente, {
                designation: data.designation || article.designation,
                qte: qte,
                prix: data.prix ?? article.prix_vente ?? 0,
                date: data.date || new Date().toISOString().split('T')[0],
                client: data.clientId ? { id_client: data.clientId } : null,
                article: { id_article: article.id_article },
            });

            const savedVente = await queryRunner.manager.save(vente);

            await queryRunner.commitTransaction();

            const acteur = await this.caisseService.acteurOuSysteme(authorization);
            await this.caisseService.enregistrerAuto(acteur, {
                type: 'entree',
                source: 'vente',
                montant: qte * Number(savedVente.prix || 0),
                motif: `Vente #${savedVente.id_vente}`,
                reference: 'vente:' + savedVente.id_vente,
            });
            return this.findOne(savedVente.id_vente);
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Multi-item POS checkout: creates one Vente line per cart item inside a single
     * transaction. A cart-level discount (remise) is distributed proportionally across
     * the lines' unit prices, since Vente has no invoice-level header of its own.
     */
    async checkout(data: {
        clientId?: number | null;
        remise?: number;
        montantSolde?: number;
        date?: string;
        items: { articleId?: number | null; reparationId?: number | null; designation?: string; qte: number; prix: number }[];
    }, authorization?: string): Promise<Vente[]> {
        if (!data.items || data.items.length === 0) {
            throw new BadRequestException('Le panier est vide.');
        }
        let montantSoldeUtilise = 0;

        if (data.montantSolde && data.montantSolde > 0 && !data.clientId) {
            throw new BadRequestException('Un client doit être sélectionné pour utiliser un solde.');
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const totalHt = data.items.reduce((sum, i) => sum + (i.qte || 0) * (i.prix || 0), 0);
            const remise = data.remise || 0;
            const ratio = totalHt > 0 ? Math.min(1, remise / totalHt) : 0;
            const date = data.date || new Date().toISOString().split('T')[0];
            const savedIds: number[] = [];

            for (const item of data.items) {
                if (item.reparationId) {
                    // Repair pickup line: no stock/article involved, just closes out the ticket
                    const rep = await queryRunner.manager.findOne(Reparation, {
                        where: { id_reparation: item.reparationId },
                    });
                    if (!rep) throw new NotFoundException(`Ticket de réparation ${item.reparationId} introuvable`);

                    const unitPrice = item.prix ?? rep.prix ?? 0;
                    const discountedUnitPrice = Math.round(unitPrice * (1 - ratio) * 1000) / 1000;

                    rep.statut = 'Vente avec reçu';
                    rep.montant_recu = discountedUnitPrice;
                    await queryRunner.manager.save(rep);

                    // Cost of the parts used in this repair, kept on the line so its profit can be shown
                    const [{ cout }] = await queryRunner.query(
                        `SELECT COALESCE(SUM(ri.qte * COALESCE(a.prix_achat, 0)), 0) AS cout
                           FROM reparation_item ri LEFT JOIN article a ON a.id_article = ri.id_article
                          WHERE ri.id_reparation = $1`,
                        [item.reparationId],
                    );
                    const vente = queryRunner.manager.create(Vente, {
                        designation: item.designation || `Réparation — ${rep.appareil || 'Appareil'}`,
                        qte: item.qte || 1,
                        prix: discountedUnitPrice,
                        cout: Number(cout) || 0,
                        date,
                        client: data.clientId ? { id_client: data.clientId } : null,
                        article: null,
                        id_reparation_origine: item.reparationId,
                    });
                    const saved = await queryRunner.manager.save(vente);
                    savedIds.push(saved.id_vente);
                    continue;
                }

                const article = await queryRunner.manager.findOne(Article, {
                    where: { id_article: item.articleId as number },
                });
                if (!article) throw new NotFoundException(`Article ${item.articleId} introuvable`);

                const qte = item.qte || 1;
                if (article.quantite < qte) {
                    throw new BadRequestException(
                        `Stock insuffisant pour "${article.designation}". Disponible: ${article.quantite}, demandé: ${qte}`
                    );
                }

                // Decrement inside this transaction only, so a refused sale gives the stock back
                article.quantite -= qte;
                await queryRunner.manager.save(article);

                const unitPrice = item.prix ?? article.prix_vente ?? 0;
                const discountedUnitPrice = Math.round(unitPrice * (1 - ratio) * 1000) / 1000;

                const vente = queryRunner.manager.create(Vente, {
                    designation: article.designation,
                    qte,
                    prix: discountedUnitPrice,
                    date,
                    client: data.clientId ? { id_client: data.clientId } : null,
                    article: { id_article: article.id_article },
                });
                const saved = await queryRunner.manager.save(vente);
                savedIds.push(saved.id_vente);
            }

            // Optionally settle part (or all) of the total using the client's deposited balance
            if (data.montantSolde && data.montantSolde > 0 && data.clientId) {
                const netTotal = Math.max(0, totalHt - remise);
                const montantSolde = Math.min(data.montantSolde, netTotal);
                await this.clientsService.utiliserSolde(data.clientId, montantSolde);
                montantSoldeUtilise = montantSolde;
                // Paid from the client's balance, not cash: the caisse must not expect it in the drawer
                await queryRunner.query(
                    `INSERT INTO client_solde_usage (id_client, montant, date) VALUES ($1, $2, $3)`,
                    [data.clientId, montantSolde, date],
                );
            }

            await queryRunner.commitTransaction();
            const ventes = await Promise.all(savedIds.map(id => this.findOne(id)));

            // Cash that actually entered the drawer: the sale total minus the part paid from a client balance
            const total = ventes.reduce((s, v) => s + (v.qte || 1) * Number(v.prix || 0), 0);
            const acteur = await this.caisseService.acteurOuSysteme(authorization);
            await this.caisseService.enregistrerAuto(acteur, {
                type: 'entree',
                source: 'vente',
                montant: total - montantSoldeUtilise,
                motif: `Vente ${ventes.map(v => '#' + v.id_vente).join(', ')}`,
                reference: 'vente:' + savedIds.join(','),
            });
            return ventes;
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    /** Local calendar day (YYYY-MM-DD) of a Date — never toISOString(), which shifts to UTC and can
     *  land on the wrong day around midnight depending on the server's timezone. */
    private jourLocal(d: Date): string {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    /** Calendar-aligned bounds of a period, today included, plus how bars should be grouped. */
    private bornesPeriode(period: 'today' | 'week' | 'month' | 'year'): { start: Date; end: Date; granularite: 'jour' | 'mois' } {
        const now = new Date();
        const aujourdhui = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let start: Date;
        if (period === 'today') {
            start = aujourdhui;
        } else if (period === 'week') {
            const jour = aujourdhui.getDay(); // 0=dimanche..6=samedi
            const depuisLundi = jour === 0 ? 6 : jour - 1;
            start = new Date(aujourdhui);
            start.setDate(start.getDate() - depuisLundi);
        } else if (period === 'month') {
            start = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1);
        } else {
            start = new Date(aujourdhui.getFullYear(), 0, 1);
        }
        return { start, end: aujourdhui, granularite: period === 'year' ? 'mois' : 'jour' };
    }

    /**
     * Sales statistics over a calendar period (today / this week / this month / this year, up to
     * today), with the revenue trend, best sellers, real profit (price minus cost — the article's
     * current purchase price, or, for a repair line, the parts cost kept on the line) and growth
     * versus the immediately preceding period of the same length.
     */
    async getStats(period: 'today' | 'week' | 'month' | 'year' = 'month') {
        const { start, end, granularite } = this.bornesPeriode(period);
        const startStr = this.jourLocal(start);
        const endStr = this.jourLocal(end);
        const joursPeriode = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

        const ventes = await this.venteRepo.find({
            where: { date: Between(start, end) },
            relations: ['article'],
        });

        let totalRevenue = 0;
        let totalCogs = 0;
        // Repair lines (deposits and pickups) have no article: tracked separately, from the parts
        // cost kept on the line. A line whose cost was never recorded (pre-existing tickets) counts
        // its revenue but not its cost/profit, same convention as the sales-history and expenses pages.
        let reparationsRevenue = 0;
        let reparationsCout = 0;
        let reparationsPertes = 0;
        // Accessories sold, tracked apart from repair parts and other articles
        let accessoiresRevenue = 0;
        let accessoiresCout = 0;
        const revenueByDayMap = new Map<string, number>();
        const productMap = new Map<number, { designation: string; qte: number; revenue: number }>();

        const dayKey = (d: string | Date) => typeof d === 'string' ? d : this.jourLocal(new Date(d));

        for (const v of ventes) {
            const lineRevenue = (v.qte || 0) * (Number(v.prix) || 0);
            totalRevenue += lineRevenue;
            totalCogs += (v.qte || 0) * (Number(v.article ? v.article.prix_achat : v.cout) || 0);

            const key = granularite === 'mois' ? dayKey(v.date).slice(0, 7) : dayKey(v.date);
            revenueByDayMap.set(key, (revenueByDayMap.get(key) || 0) + lineRevenue);

            if (v.article) {
                const id = v.article.id_article;
                const entry = productMap.get(id) || { designation: v.article.designation, qte: 0, revenue: 0 };
                entry.qte += v.qte || 0;
                entry.revenue += lineRevenue;
                productMap.set(id, entry);

                if (v.article.type === 'accessory') {
                    accessoiresRevenue += lineRevenue;
                    accessoiresCout += (v.qte || 0) * (Number(v.article.prix_achat) || 0);
                }
            } else {
                reparationsRevenue += lineRevenue;
                if (v.cout !== null && v.cout !== undefined) {
                    const lineCout = (v.qte || 0) * Number(v.cout);
                    reparationsCout += lineCout;
                    if (lineRevenue < lineCout) reparationsPertes += lineCout - lineRevenue;
                }
            }
        }

        // Loss specific to repairs: a client brings the phone back because the part just replaced
        // was defective, and the free replacement (no new charge) still uses real, paid-for stock.
        // Only tickets not yet checked out are counted here: once checked out (even for 0), the
        // matching Vente line is already counted above (its price is below its cost) — counting
        // both would double the same loss.
        const retourLigne = await this.dataSource.query(
            `SELECT COALESCE(SUM(ri.qte * COALESCE(a.prix_achat, 0)), 0) AS total
               FROM reparation r
               JOIN reparation_item ri ON ri.id_reparation = r.id_reparation
               LEFT JOIN article a ON a.id_article = ri.id_article
              WHERE r.retour_de IS NOT NULL AND r.date_reception BETWEEN $1 AND $2
                AND r.statut NOT IN ('Vente avec reçu', 'Livré')`,
            [startStr, endStr],
        );
        reparationsPertes += Number(retourLigne[0]?.total) || 0;

        const revenueByDay: { date: string; total: number }[] = [];
        if (granularite === 'jour') {
            for (let i = 0; i < joursPeriode; i++) {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                const key = this.jourLocal(d);
                revenueByDay.push({ date: key, total: revenueByDayMap.get(key) || 0 });
            }
        } else {
            for (let m = 0; m <= end.getMonth(); m++) {
                const key = `${end.getFullYear()}-${String(m + 1).padStart(2, '0')}`;
                revenueByDay.push({ date: key, total: revenueByDayMap.get(key) || 0 });
            }
        }

        const topProducts = [...productMap.entries()]
            .map(([articleId, v]) => ({ articleId, ...v }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 8);

        // Immediately preceding period of the same length, for a growth percentage
        const prevEnd = new Date(start);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevEnd.getDate() - (joursPeriode - 1));
        const prevVentes = await this.venteRepo.find({
            where: { date: Between(prevStart, prevEnd) },
        });
        const prevRevenue = prevVentes.reduce((s, v) => s + (v.qte || 0) * (Number(v.prix) || 0), 0);

        const totalTickets = ventes.length;

        return {
            period,
            granularite,
            startDate: startStr,
            endDate: endStr,
            totalRevenue,
            totalTickets,
            avgBasket: totalTickets > 0 ? totalRevenue / totalTickets : 0,
            totalCogs,
            estimatedProfit: totalRevenue - totalCogs,
            growthPercent: prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null,
            revenueByDay,
            topProducts,
            reparations: {
                revenue: reparationsRevenue,
                cout: reparationsCout,
                benefice: reparationsRevenue - reparationsCout,
                pertes: reparationsPertes,
            },
            accessoires: {
                revenue: accessoiresRevenue,
                cout: accessoiresCout,
                benefice: accessoiresRevenue - accessoiresCout,
            },
        };
    }

    /**
     * Detail behind the repair losses, one row per case:
     *  - a part replaced free of charge on a warranty return (client brought the phone back, the
     *    part just fitted was defective) — the part itself and its cost are exact.
     *  - a repair checked out for less than its parts cost, with no return — the shortfall is
     *    exact, but "part" lists every part used on that ticket (the ticket as a whole was
     *    discounted, not one specific part), so brand/model/supplier are only shown when the
     *    ticket used a single part.
     * Either way, the supplier shown is from that part's most recent purchase.
     */
    async getPertesDetail(period: 'today' | 'week' | 'month' | 'year' = 'month') {
        const { start, end } = this.bornesPeriode(period);
        const startStr = this.jourLocal(start);
        const endStr = this.jourLocal(end);

        const fournisseurJoin = `
               LEFT JOIN LATERAL (
                   SELECT ma."id_fournisseur" AS id_fournisseur
                     FROM mouvement_achat ma
                    WHERE ma."id_article" = a.id_article
                    ORDER BY ma.date_mouvement DESC
                    LIMIT 1
               ) dernier_achat ON true
               LEFT JOIN fournisseur f ON f.id_fournisseur = dernier_achat.id_fournisseur`;

        const retours = await this.dataSource.query(
            `SELECT r.id_reparation, r.appareil, r.date_reception, r.degre_dommage, 'retour' AS raison,
                    ri.qte, a.id_article, a.designation, a.marque, a.modele, a.sous_categorie, a.type,
                    a.prix_achat, f.nom AS fournisseur_nom, f.prenom AS fournisseur_prenom,
                    f.entreprise AS fournisseur_entreprise
               FROM reparation r
               JOIN reparation_item ri ON ri.id_reparation = r.id_reparation
               LEFT JOIN article a ON a.id_article = ri.id_article
               ${fournisseurJoin}
              WHERE r.retour_de IS NOT NULL AND r.date_reception BETWEEN $1 AND $2
                AND r.statut NOT IN ('Vente avec reçu', 'Livré')
              ORDER BY r.date_reception DESC, r.id_reparation DESC`,
            [startStr, endStr],
        );

        // Repairs checked out (with a matching Vente line) for less than their parts cost, no return
        const ecarts = await this.dataSource.query(
            `SELECT r.id_reparation, r.appareil, v.date::text AS date_reception, NULL AS degre_dommage,
                    'ecart_prix' AS raison, v.cout - (v.qte * v.prix) AS manque_a_gagner,
                    (SELECT COUNT(*) FROM reparation_item WHERE id_reparation = r.id_reparation) AS nb_pieces,
                    ri.qte, a.id_article, a.designation, a.marque, a.modele, a.sous_categorie, a.type,
                    a.prix_achat, f.nom AS fournisseur_nom, f.prenom AS fournisseur_prenom,
                    f.entreprise AS fournisseur_entreprise
               FROM vente v
               JOIN reparation r ON r.id_reparation = v."id_reparation_origine"
               LEFT JOIN reparation_item ri ON ri.id_reparation = r.id_reparation
               LEFT JOIN article a ON a.id_article = ri.id_article
               ${fournisseurJoin}
              WHERE v.id_article IS NULL AND v.cout IS NOT NULL
                AND v.prix < v.cout AND r.retour_de IS NULL
                AND v.date BETWEEN $1 AND $2
              ORDER BY v.date DESC, r.id_reparation DESC`,
            [startStr, endStr],
        );

        const nomFournisseur = (l: any) => l.fournisseur_entreprise || (l.fournisseur_nom ? `${l.fournisseur_nom} ${l.fournisseur_prenom || ''}`.trim() : null);

        const lignesRetour = retours.map((l: any) => ({
            id_reparation: l.id_reparation,
            appareil: l.appareil,
            date: l.date_reception,
            raison: 'retour' as const,
            degre_dommage: l.degre_dommage,
            piece: l.id_article ? { designation: l.designation, marque: l.marque, modele: l.modele, nature: l.sous_categorie, type: l.type } : null,
            cout: (Number(l.qte) || 0) * (Number(l.prix_achat) || 0),
            manque_a_gagner: (Number(l.qte) || 0) * (Number(l.prix_achat) || 0),
            fournisseur: nomFournisseur(l),
        }));

        // One row per reparation for the "ecart_prix" case (a ticket can have several parts)
        const parReparation = new Map<number, any[]>();
        for (const l of ecarts) {
            if (!parReparation.has(l.id_reparation)) parReparation.set(l.id_reparation, []);
            parReparation.get(l.id_reparation)!.push(l);
        }
        const lignesEcart = [...parReparation.values()].map((items) => {
            const premier = items[0];
            const pieceUnique = Number(premier.nb_pieces) === 1 && premier.id_article;
            return {
                id_reparation: premier.id_reparation,
                appareil: premier.appareil,
                date: premier.date_reception,
                raison: 'ecart_prix' as const,
                degre_dommage: null,
                piece: pieceUnique
                    ? { designation: premier.designation, marque: premier.marque, modele: premier.modele, nature: premier.sous_categorie, type: premier.type }
                    : { designation: items.map((i) => i.designation).filter(Boolean).join(', ') || 'Pièces multiples', marque: null, modele: null, nature: null, type: null },
                cout: items.reduce((s, i) => s + (Number(i.qte) || 0) * (Number(i.prix_achat) || 0), 0),
                manque_a_gagner: Number(premier.manque_a_gagner) || 0,
                fournisseur: pieceUnique ? nomFournisseur(premier) : null,
            };
        });

        return [...lignesRetour, ...lignesEcart].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id_reparation - a.id_reparation);
    }

    async remove(id: number, authorization?: string): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        let remboursement = 0;

        try {
            const vente = await queryRunner.manager.findOne(Vente, {
                where: { id_vente: id },
                relations: ['article'],
            });
            if (!vente) throw new NotFoundException(`Vente #${id} introuvable`);

            // Restore stock
            if (vente.article) {
                const article = await queryRunner.manager.findOne(Article, {
                    where: { id_article: vente.article.id_article },
                });
                if (article) {
                    article.quantite += vente.qte || 1;
                    await queryRunner.manager.save(article);
                }
            }

            remboursement = (vente.qte || 1) * Number(vente.prix || 0);
            await queryRunner.manager.delete(Vente, id);
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }

        // Cancelling a sale gives the money back: it leaves the drawer
        const acteur = await this.caisseService.acteurOuSysteme(authorization);
        await this.caisseService.enregistrerAuto(acteur, {
            type: 'sortie',
            source: 'retour',
            montant: remboursement,
            motif: `Annulation vente #${id}`,
            reference: 'vente-annul:' + id,
        });
    }
}
