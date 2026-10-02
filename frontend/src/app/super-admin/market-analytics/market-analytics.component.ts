import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AdminAnalyticsService } from '../../services/admin-analytics.service';
import { CompatService } from '../../services/compat.service';
import { MagasinService } from '../../services/magasin.service';
import { AuthService } from '../../services/auth.service';
import { articleImageUrl } from '../../services/article.service';
import { PartType, Brand } from '../../models/compat.model';
import {
    AnalyticsFiltres, AnalyticsPeriode, TopPiece, EcranPiece, FournisseurLigne, RecommandationGros, DetailPiece,
} from '../../models/admin-analytics.model';

type Onglet = 'top' | 'ecrans' | 'fournisseurs' | 'gros';

@Component({
    selector: 'app-market-analytics',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './market-analytics.component.html',
    styleUrls: ['./market-analytics.component.css']
})
export class MarketAnalyticsComponent implements OnInit {
    activeTab: Onglet = 'top';

    partTypes: PartType[] = [];
    brands: Brand[] = [];
    wilayas: string[] = [];

    filtres: AnalyticsFiltres = { periode: 'month' };

    loading = false;
    errorMsg = '';
    recalculating = false;
    recalcMsg = '';

    topPieces: TopPiece[] = [];
    ecrans: EcranPiece[] = [];
    fournisseurs: FournisseurLigne[] = [];
    recommandations: RecommandationGros[] = [];

    // ── Part detail drill-down (numbers only, no chart - per request) ──
    detailOpenId: number | null = null;
    detail: DetailPiece | null = null;
    detailLoading = false;

    constructor(
        private analyticsService: AdminAnalyticsService,
        private compatService: CompatService,
        private magasinService: MagasinService,
        public auth: AuthService,
        private translate: TranslateService,
        private router: Router,
    ) { }

    ngOnInit(): void {
        this.compatService.getPartTypesForSearch().subscribe({ next: (d) => this.partTypes = d });
        this.compatService.getBrandsForSearch().subscribe({ next: (d) => this.brands = d });
        this.magasinService.getMagasins().subscribe({
            next: (stores) => { this.wilayas = [...new Set(stores.map(s => s.wilaya).filter((w): w is string => !!w))].sort(); }
        });
        this.load();
    }

    partTypeName(pt: { nom_fr: string; nom_en: string; nom_ar: string }): string {
        const lang = this.translate.currentLang();
        if (lang === 'en') return pt.nom_en;
        if (lang === 'ar') return pt.nom_ar;
        return pt.nom_fr;
    }

    imageUrl(image?: string | null): string | null {
        return articleImageUrl(image);
    }

    setTab(tab: Onglet): void {
        this.activeTab = tab;
        this.detailOpenId = null;
        this.load();
    }

    setPeriode(p: AnalyticsPeriode): void {
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

        const onError = (err: any) => { this.loading = false; this.errorMsg = err.error?.message || 'MARKET_ANALYTICS.ERR_LOAD'; };

        if (this.activeTab === 'top') {
            this.analyticsService.getTopPieces(this.filtres).subscribe({ next: (d) => { this.topPieces = d; this.loading = false; }, error: onError });
        } else if (this.activeTab === 'ecrans') {
            this.analyticsService.getEcrans(this.filtres).subscribe({ next: (d) => { this.ecrans = d; this.loading = false; }, error: onError });
        } else if (this.activeTab === 'fournisseurs') {
            this.analyticsService.getFournisseurs(this.filtres).subscribe({ next: (d) => { this.fournisseurs = d; this.loading = false; }, error: onError });
        } else {
            this.analyticsService.getRecommandationsGros(this.filtres).subscribe({ next: (d) => { this.recommandations = d; this.loading = false; }, error: onError });
        }
    }

    recalculerMaintenant(): void {
        if (this.recalculating) return;
        this.recalculating = true;
        this.recalcMsg = '';
        this.analyticsService.recalculer().subscribe({
            next: () => { this.recalculating = false; this.recalcMsg = 'MARKET_ANALYTICS.RECALC_SUCCESS'; this.load(); },
            error: (err) => { this.recalculating = false; this.recalcMsg = err.error?.message || 'MARKET_ANALYTICS.RECALC_ERROR'; }
        });
    }

    toggleDetail(piece: TopPiece | EcranPiece): void {
        if (this.detailOpenId === piece.id_group) { this.detailOpenId = null; this.detail = null; return; }
        this.detailOpenId = piece.id_group;
        this.detail = null;
        this.detailLoading = true;
        this.analyticsService.getDetailPiece(piece.id_group, this.filtres).subscribe({
            next: (d) => { this.detail = d; this.detailLoading = false; },
            error: () => { this.detailLoading = false; }
        });
    }

    waLink(telephone: string): string {
        return `https://wa.me/${telephone.replace(/[^0-9]/g, '')}`;
    }

    // ── CSV export, built client-side from whatever the current tab already loaded ──
    exportCsv(): void {
        let rows: string[][] = [];
        let filename = 'export.csv';

        if (this.activeTab === 'top') {
            rows = [
                ['Type', 'Marque', 'Modele', 'QteVendue', 'QteReparation', 'NbMagasins', 'PrixAchatMoyen', 'PrixAchatMin', 'PrixAchatMax', 'PrixVenteMoyen', 'PrixVenteMin', 'PrixVenteMax'],
                ...this.topPieces.map(p => [this.partTypeName(p), p.marque || '', p.modele || '', String(p.qte_vendue), String(p.qte_reparation), String(p.nb_magasins), String(p.prix_achat_moyen ?? ''), String(p.prix_achat_min ?? ''), String(p.prix_achat_max ?? ''), String(p.prix_vente_moyen ?? ''), String(p.prix_vente_min ?? ''), String(p.prix_vente_max ?? '')]),
            ];
            filename = 'pieces-les-plus-vendues.csv';
        } else if (this.activeTab === 'ecrans') {
            rows = [
                ['Marque', 'Modele', 'QteVendue', 'NbMagasins', 'NbModelesCompatibles', 'PrixVenteMoyen'],
                ...this.ecrans.map(p => [p.marque || '', p.modele || '', String(p.qte_vendue), String(p.nb_magasins), String(p.nb_modeles_compatibles), String(p.prix_vente_moyen ?? '')]),
            ];
            filename = 'ecrans.csv';
        } else if (this.activeTab === 'fournisseurs') {
            rows = [
                ['Nom', 'Telephone', 'Type', 'Marque', 'Modele', 'PrixMoyen', 'MoinsCher', 'NbMagasins', 'DerniereDate'],
                ...this.fournisseurs.map(f => [f.nom, f.telephone, this.partTypeName(f), f.marque || '', f.modele || '', String(f.prix_moyen), f.moins_cher ? 'oui' : '', String(f.nb_magasins), f.derniere_date]),
            ];
            filename = 'fournisseurs.csv';
        } else {
            rows = [
                ['Type', 'Marque', 'Modele', 'Score', 'QteVendue', 'QteReparation', 'NbRecherchesSansStock', 'NbMagasinsDemande', 'NbModelesCompatibles', 'QuantiteSuggereeMois', 'MoinsCherFournisseur'],
                ...this.recommandations.map(r => [this.partTypeName(r), r.marque || '', r.modele || '', String(r.score), String(r.qte_vendue), String(r.qte_reparation), String(r.nb_recherches_sans_stock), String(r.nb_magasins_demande), String(r.nb_modeles_compatibles), String(r.quantite_suggeree_mois), r.moins_cher_fournisseur ? `${r.moins_cher_fournisseur.nom} (${r.moins_cher_fournisseur.telephone})` : '']),
            ];
            filename = 'recommandations-gros.csv';
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

    logout(): void {
        this.auth.logout();
    }
}
