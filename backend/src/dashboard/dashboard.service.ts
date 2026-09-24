import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Article } from '../articles/article.entity';
import { Fournisseur } from '../fournisseurs/fournisseur.entity';
import { FactureAchat } from '../factures-achat/facture-achat.entity';

@Injectable()
export class DashboardService {
    constructor(
        @InjectRepository(Article)
        private readonly articleRepo: Repository<Article>,
        @InjectRepository(Fournisseur)
        private readonly fournisseurRepo: Repository<Fournisseur>,
        @InjectRepository(FactureAchat)
        private readonly factureRepo: Repository<FactureAchat>,
    ) { }

    async getStats() {
        const [totalArticles, totalFournisseurs, totalFactures] = await Promise.all([
            this.articleRepo.count(),
            this.fournisseurRepo.count(),
            this.factureRepo.count(),
        ]);

        // Calculate total stock value (sum of quantite * prix_achat)
        const stockValueResult = await this.articleRepo
            .createQueryBuilder('a')
            .select('SUM(a.quantite * a.prix_achat)', 'total')
            .getRawOne();
        const totalStockValue = parseFloat(stockValueResult?.total || '0');

        // Recent invoices (last 5)
        const recentFactures = await this.factureRepo.find({
            relations: ['fournisseur'],
            order: { date_facture: 'DESC' },
            take: 5,
        });

        // Low stock articles (quantite <= qte_min)
        const lowStockArticles = await this.articleRepo
            .createQueryBuilder('a')
            .where('a.qte_min > 0 AND a.quantite <= a.qte_min')
            .orderBy('a.quantite', 'ASC')
            .take(10)
            .getMany();

        return {
            totalArticles,
            totalFournisseurs,
            totalFactures,
            totalStockValue,
            recentFactures,
            lowStockArticles,
        };
    }
}
