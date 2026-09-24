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

                    const vente = queryRunner.manager.create(Vente, {
                        designation: item.designation || `Réparation — ${rep.appareil || 'Appareil'}`,
                        qte: item.qte || 1,
                        prix: discountedUnitPrice,
                        date,
                        client: data.clientId ? { id_client: data.clientId } : null,
                        article: null,
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

    /**
     * Sales statistics over a rolling window (revenue trend, best sellers, estimated
     * profit, growth vs. the previous equivalent period). Profit is estimated using each
     * article's CURRENT purchase price (Vente does not snapshot historical cost).
     */
    async getStats(days = 14) {
        const today = new Date();
        const start = new Date();
        start.setDate(today.getDate() - (days - 1));
        const startStr = start.toISOString().split('T')[0];
        const endStr = today.toISOString().split('T')[0];

        const ventes = await this.venteRepo.find({
            where: { date: Between(start, today) },
            relations: ['article'],
        });

        let totalRevenue = 0;
        let totalCogs = 0;
        const revenueByDayMap = new Map<string, number>();
        const productMap = new Map<number, { designation: string; qte: number; revenue: number }>();

        const dayKey = (d: string | Date) => typeof d === 'string' ? d : new Date(d).toISOString().split('T')[0];

        for (const v of ventes) {
            const lineRevenue = (v.qte || 0) * (Number(v.prix) || 0);
            totalRevenue += lineRevenue;
            totalCogs += (v.qte || 0) * (Number(v.article?.prix_achat) || 0);

            const key = dayKey(v.date);
            revenueByDayMap.set(key, (revenueByDayMap.get(key) || 0) + lineRevenue);

            if (v.article) {
                const id = v.article.id_article;
                const entry = productMap.get(id) || { designation: v.article.designation, qte: 0, revenue: 0 };
                entry.qte += v.qte || 0;
                entry.revenue += lineRevenue;
                productMap.set(id, entry);
            }
        }

        const revenueByDay: { date: string; total: number }[] = [];
        for (let i = 0; i < days; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            const key = d.toISOString().split('T')[0];
            revenueByDay.push({ date: key, total: revenueByDayMap.get(key) || 0 });
        }

        const topProducts = [...productMap.entries()]
            .map(([articleId, v]) => ({ articleId, ...v }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 8);

        // Previous equivalent period, for a growth percentage
        const prevEnd = new Date(start);
        prevEnd.setDate(start.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevEnd.getDate() - (days - 1));
        const prevVentes = await this.venteRepo.find({
            where: { date: Between(prevStart, prevEnd) },
        });
        const prevRevenue = prevVentes.reduce((s, v) => s + (v.qte || 0) * (Number(v.prix) || 0), 0);

        const totalTickets = ventes.length;

        return {
            days,
            startDate: startStr,
            endDate: endStr,
            totalRevenue,
            totalTickets,
            avgBasket: totalTickets > 0 ? totalRevenue / totalTickets : 0,
            estimatedProfit: totalRevenue - totalCogs,
            growthPercent: prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null,
            revenueByDay,
            topProducts,
        };
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
