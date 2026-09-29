import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from '../articles/article.entity';
import { Fournisseur } from '../fournisseurs/fournisseur.entity';
import { FactureAchat } from '../factures-achat/facture-achat.entity';
import { StoreContextService } from '../store-context/store-context.service';

@Injectable()
export class DashboardService {
    constructor(
        @InjectRepository(Article)
        private readonly articleRepo: Repository<Article>,
        @InjectRepository(Fournisseur)
        private readonly fournisseurRepo: Repository<Fournisseur>,
        @InjectRepository(FactureAchat)
        private readonly factureRepo: Repository<FactureAchat>,
        private readonly storeContext: StoreContextService,
    ) { }

    async getStats() {
        const id_magasin = this.storeContext.requireMagasinId();

        const [totalArticles, totalFournisseurs, totalFactures] = await Promise.all([
            this.articleRepo.count({ where: { id_magasin } }),
            this.fournisseurRepo.count({ where: { id_magasin } }),
            this.factureRepo.count({ where: { id_magasin } }),
        ]);

        // Calculate total stock value (sum of quantite * prix_achat)
        const stockValueResult = await this.articleRepo
            .createQueryBuilder('a')
            .select('SUM(a.quantite * a.prix_achat)', 'total')
            .where('a.id_magasin = :id_magasin', { id_magasin })
            .getRawOne();
        const totalStockValue = parseFloat(stockValueResult?.total || '0');

        // Recent invoices (last 5)
        const recentFactures = await this.factureRepo.find({
            where: { id_magasin },
            relations: ['fournisseur'],
            order: { date_facture: 'DESC' },
            take: 5,
        });

        // Low stock articles (quantite <= qte_min)
        const lowStockArticles = await this.articleRepo
            .createQueryBuilder('a')
            .where('a.id_magasin = :id_magasin AND a.qte_min > 0 AND a.quantite <= a.qte_min', { id_magasin })
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
