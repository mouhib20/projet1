import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminAccessoriesAnalyticsService } from '../../services/admin-accessories-analytics.service';
import { MagasinService } from '../../services/magasin.service';
import { AuthService } from '../../services/auth.service';
import { articleImageUrl } from '../../services/article.service';
import {
    AccAnalyticsFiltres, AccAnalyticsPeriode, TopProduitAccessoire, ResumeAccessoires,
    FournisseurLigneAccessoire, RecommandationGrosAccessoire, ArticleNonLie, SuggestionProduit, DetailProduitAccessoire,
} from '../../models/admin-accessories-analytics.model';

type Onglet = 'resume' | 'top' | 'fournisseurs' | 'gros' | 'nonLies';

@Component({
    selector: 'app-accessories-analytics',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './accessories-analytics.component.html',
    styleUrls: ['./accessories-analytics.component.css']
})
export class AccessoriesAnalyticsComponent implements OnInit {
    activeTab: Onglet = 'resume';

    categories: string[] = [];
    marques: string[] = [];
    wilayas: string[] = [];

    filtres: AccAnalyticsFiltres = { periode: 'month' };

    loading = false;
    errorMsg = '';
    recalculating = false;
    recalcMsg = '';

    resume: ResumeAccessoires | null = null;
    topProduits: TopProduitAccessoire[] = [];
    fournisseurs: FournisseurLigneAccessoire[] = [];
    recommandations: RecommandationGrosAccessoire[] = [];
    nonLies: ArticleNonLie[] = [];

    detailOpenId: number | null = null;
    detail: DetailProduitAccessoire | null = null;
    detailLoading = false;

    // ── Manual link (tab 5) ──
    linkingArticleId: number | null = null;
    suggestions: SuggestionProduit[] = [];
    suggestionsLoading = false;

    constructor(
        private analyticsService: AdminAccessoriesAnalyticsService,
        private magasinService: MagasinService,
        public auth: AuthService,
        private router: Router,
    ) { }

    ngOnInit(): void {
        // One unfiltered load, just to populate the category/brand filter dropdowns - independent
        // of whatever the person later narrows the active tab's own filters to.
        this.analyticsService.getTopProduits({ periode: 'year' }).subscribe({
            next: (data) => {
                this.categories = [...new Set(data.map(p => p.categorie))].sort();
                this.marques = [...new Set(data.map(p => p.marque).filter((m): m is string => !!m))].sort();
            }
        });
        this.magasinService.getMagasins().subscribe({
            next: (stores) => { this.wilayas = [...new Set(stores.map(s => s.wilaya).filter((w): w is string => !!w))].sort(); }
        });
        this.load();
    }

    imageUrl(image?: string | null): string | null {
        return articleImageUrl(image);
    }

    setTab(tab: Onglet): void {
        this.activeTab = tab;
        this.detailOpenId = null;
        this.linkingArticleId = null;
        this.load();
    }

    setPeriode(p: AccAnalyticsPeriode): void {
        this.filtres = { ...this.filtres, periode: p };
        if (p !== 'custom') this.load();
    }

    applyFilters(): void {
        this.load();
    }

    load(): void {
        if (this.filtres.periode === 'custom' && (!this.filtres.dateDebut || !this.filtres.dateFin)) return;
        this.loading = true;
        this.errorMsg = '';
        this.detailOpenId = null;

        const onError = (err: any) => { this.loading = false; this.errorMsg = err.error?.message || 'ACC_ANALYTICS.ERR_LOAD'; };

        if (this.activeTab === 'resume') {
            this.analyticsService.getResume(this.filtres).subscribe({ next: (d) => { this.resume = d; this.loading = false; }, error: onError });
        } else if (this.activeTab === 'top') {
            this.analyticsService.getTopProduits(this.filtres).subscribe({ next: (d) => { this.topProduits = d; this.loading = false; }, error: onError });
        } else if (this.activeTab === 'fournisseurs') {
            this.analyticsService.getFournisseurs(this.filtres).subscribe({ next: (d) => { this.fournisseurs = d; this.loading = false; }, error: onError });
        } else if (this.activeTab === 'gros') {
            this.analyticsService.getRecommandationsGros(this.filtres).subscribe({ next: (d) => { this.recommandations = d; this.loading = false; }, error: onError });
        } else {
            this.analyticsService.getNonLies().subscribe({ next: (d) => { this.nonLies = d; this.loading = false; }, error: onError });
        }
    }

    recalculerMaintenant(): void {
        if (this.recalculating) return;
        this.recalculating = true;
        this.recalcMsg = '';
        this.analyticsService.recalculer().subscribe({
            next: () => { this.recalculating = false; this.recalcMsg = 'ACC_ANALYTICS.RECALC_SUCCESS'; this.load(); },
            error: (err) => { this.recalculating = false; this.recalcMsg = err.error?.message || 'ACC_ANALYTICS.RECALC_ERROR'; }
        });
    }

    toggleDetail(p: TopProduitAccessoire): void {
        if (this.detailOpenId === p.id_produit) { this.detailOpenId = null; this.detail = null; return; }
        this.detailOpenId = p.id_produit;
        this.detail = null;
        this.detailLoading = true;
        this.analyticsService.getDetailProduit(p.id_produit, this.filtres).subscribe({
            next: (d) => { this.detail = d; this.detailLoading = false; },
            error: () => { this.detailLoading = false; }
        });
    }

    waLink(telephone: string): string {
        return `https://wa.me/${telephone.replace(/[^0-9]/g, '')}`;
    }

    // ── Tab 5: manual link ──

    startLink(article: ArticleNonLie): void {
        this.linkingArticleId = article.id_article;
        this.suggestions = [];
        this.suggestionsLoading = true;
        this.analyticsService.getSuggestions(article.id_article).subscribe({
            next: (d) => { this.suggestions = d; this.suggestionsLoading = false; },
            error: () => { this.suggestionsLoading = false; }
        });
    }

    cancelLink(): void {
        this.linkingArticleId = null;
    }

    linkToSuggestion(s: SuggestionProduit): void {
        if (!this.linkingArticleId) return;
        this.analyticsService.lier(this.linkingArticleId, s.id).subscribe({
            next: () => { this.nonLies = this.nonLies.filter(a => a.id_article !== this.linkingArticleId); this.linkingArticleId = null; },
            error: (err) => { this.errorMsg = err.error?.message || 'ACC_ANALYTICS.ERR_LINK'; }
        });
    }

    linkAsNewProduct(article: ArticleNonLie): void {
        this.analyticsService.lier(article.id_article, undefined).subscribe({
            next: () => { this.nonLies = this.nonLies.filter(a => a.id_article !== article.id_article); this.linkingArticleId = null; },
            error: (err) => { this.errorMsg = err.error?.message || 'ACC_ANALYTICS.ERR_LINK'; }
        });
    }

    // ── CSV export, built client-side from whatever the current tab already loaded ──
    exportCsv(): void {
        let rows: string[][] = [];
        let filename = 'export.csv';

        if (this.activeTab === 'resume' && this.resume) {
            rows = [
                ['Categorie', 'QteVendue', 'Revenus', 'Profit', 'MargePct', 'MeilleurProduit'],
                ...this.resume.parCategorie.map(c => [c.categorie, String(c.qte_vendue), String(c.revenus), String(c.profit), String(c.marge_pct ?? ''), c.meilleur_produit ? `${c.meilleur_produit.marque ?? ''} ${c.meilleur_produit.nom}` : '']),
            ];
            filename = 'resume-categories.csv';
        } else if (this.activeTab === 'top') {
            rows = [
                ['Categorie', 'Marque', 'Nom', 'Barcode', 'QteVendue', 'NbMagasins', 'PrixAchatMoyen', 'PrixVenteMoyen', 'MargePct'],
                ...this.topProduits.map(p => [p.categorie, p.marque || '', p.nom, p.barcode || '', String(p.qte_vendue), String(p.nb_magasins), String(p.prix_achat_moyen ?? ''), String(p.prix_vente_moyen ?? ''), String(p.marge_pct ?? '')]),
            ];
            filename = 'produits-les-plus-vendus.csv';
        } else if (this.activeTab === 'fournisseurs') {
            rows = [
                ['Nom', 'Telephone', 'Categorie', 'Marque', 'Produit', 'PrixMoyen', 'MoinsCher', 'NbMagasins', 'DerniereDate'],
                ...this.fournisseurs.map(f => [f.nom, f.telephone, f.categorie, f.marque || '', f.nom_produit, String(f.prix_moyen), f.moins_cher ? 'oui' : '', String(f.nb_magasins), f.derniere_date]),
            ];
            filename = 'fournisseurs.csv';
        } else if (this.activeTab === 'gros') {
            rows = [
                ['Categorie', 'Marque', 'Produit', 'Score', 'QteVendue', 'MargePct', 'JoursRupture', 'Tendance', 'QuantiteSuggereeMois', 'MoinsCherFournisseur'],
                ...this.recommandations.map(r => [r.categorie, r.marque || '', r.nom, String(r.score), String(r.qte_vendue), String(r.marge_pct ?? ''), String(r.jours_rupture), r.tendance, String(r.quantite_suggeree_mois), r.moins_cher_fournisseur ? `${r.moins_cher_fournisseur.nom} (${r.moins_cher_fournisseur.telephone})` : '']),
            ];
            filename = 'recommandations-gros-accessoires.csv';
        } else {
            rows = [
                ['Designation', 'Marque', 'Categorie', 'Barcode'],
                ...this.nonLies.map(a => [a.designation, a.marque || '', a.sous_categorie, a.barcode || '']),
            ];
            filename = 'accessoires-non-lies.csv';
        }

        const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    goBack(): void {
        this.router.navigate(['/super-admin/stores']);
    }

    goToMarketAnalytics(): void {
        this.router.navigate(['/super-admin/market-analytics']);
    }

    logout(): void {
        this.auth.logout();
    }
}
