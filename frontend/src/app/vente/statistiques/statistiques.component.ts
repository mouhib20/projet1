import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PerteReparation, VenteService } from '../../services/vente.service';
import { ArticleService } from '../../services/article.service';
import { PaiementFournisseurService } from '../../services/paiement-fournisseur.service';
import { PeriodeStats, VenteStats } from '../../models/vente-stats.model';
import { Vente } from '../../models/vente.model';

@Component({
  selector: 'app-statistiques',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './statistiques.component.html',
  styleUrls: ['./statistiques.component.css']
})
export class StatistiquesComponent implements OnInit {
  stats: VenteStats | null = null;
  loading = true;
  errorMsg = '';
  periode: PeriodeStats = 'month';

  readonly periodes: { valeur: PeriodeStats; label: string }[] = [
    { valeur: 'today', label: "Aujourd'hui" },
    { valeur: 'week', label: 'Cette semaine' },
    { valeur: 'month', label: 'Ce mois' },
    { valeur: 'year', label: 'Cette année' },
  ];

  constructor(
    private venteService: VenteService,
    private articleService: ArticleService,
    private paiementFournisseurService: PaiementFournisseurService,
  ) { }

  ngOnInit(): void {
    this.loadStats();
    this.loadCapital();
  }

  // ── Capital: a snapshot, independent of the selected period ──

  valeurStock: number | null = null;
  /** Stock value split by kind: repair parts ('part') vs accessories ('accessory'). */
  valeurStockPieces: number | null = null;
  valeurStockAccessoires: number | null = null;
  detteFournisseurs: number | null = null;

  loadCapital(): void {
    this.articleService.getArticles().subscribe({
      next: (articles) => {
        const valeur = (a: { quantite?: number; prix_achat?: number }) => (Number(a.quantite) || 0) * (Number(a.prix_achat) || 0);
        this.valeurStock = articles.reduce((s, a) => s + valeur(a), 0);
        this.valeurStockPieces = articles.filter(a => a.type !== 'accessory').reduce((s, a) => s + valeur(a), 0);
        this.valeurStockAccessoires = articles.filter(a => a.type === 'accessory').reduce((s, a) => s + valeur(a), 0);
      },
      error: () => { this.valeurStock = 0; this.valeurStockPieces = 0; this.valeurStockAccessoires = 0; }
    });
    this.paiementFournisseurService.getDus().subscribe({
      next: (dus) => {
        this.detteFournisseurs = dus.reduce((s, f) => s + Math.max(0, Number(f.solde) || 0), 0);
      },
      error: () => { this.detteFournisseurs = 0; }
    });
  }

  setPeriod(periode: PeriodeStats): void {
    this.periode = periode;
    this.loadStats();
  }

  loadStats(): void {
    this.loading = true;
    this.errorMsg = '';
    this.venteService.getStats(this.periode).subscribe({
      next: (data) => {
        this.stats = data;
        this.loading = false;
      },
      error: () => {
        this.errorMsg = 'Impossible de charger les statistiques. Vérifiez que le backend est démarré.';
        this.loading = false;
      }
    });
  }

  get periodeLabel(): string {
    return this.periodes.find(p => p.valeur === this.periode)?.label || '';
  }

  // ── Repair detail: every repair sale line behind box 1's totals ──

  detailReparationsOuvert = false;
  detailReparationsChargement = false;
  detailReparationsErreur = '';
  detailReparationsLignes: (Vente & { benefice: number | null })[] = [];

  private jourDeVente(v: Vente): string {
    const d = String(v.date);
    return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : new Date(v.date).toISOString().slice(0, 10);
  }

  ouvrirDetailReparations(): void {
    if (!this.stats) return;
    this.detailReparationsOuvert = true;
    this.detailReparationsChargement = true;
    this.detailReparationsErreur = '';
    const { startDate, endDate } = this.stats;
    this.venteService.getVentes().subscribe({
      next: (ventes) => {
        this.detailReparationsLignes = ventes
          .filter(v => !v.article) // repair lines only (deposits and pickups)
          .filter(v => { const j = this.jourDeVente(v); return j >= startDate && j <= endDate; })
          .map(v => ({
            ...v,
            benefice: v.cout === null || v.cout === undefined ? null : (v.qte || 1) * (Number(v.prix || 0) - Number(v.cout || 0)),
          }))
          .sort((a, b) => this.jourDeVente(b).localeCompare(this.jourDeVente(a)) || (b.id_vente ?? 0) - (a.id_vente ?? 0));
        this.detailReparationsChargement = false;
      },
      error: () => {
        this.detailReparationsErreur = 'Impossible de charger le détail des réparations.';
        this.detailReparationsChargement = false;
      }
    });
  }

  fermerDetailReparations(): void {
    this.detailReparationsOuvert = false;
  }

  // ── Accessories detail: every accessory sale line behind box 2's totals ──

  detailAccessoiresOuvert = false;
  detailAccessoiresChargement = false;
  detailAccessoiresErreur = '';
  detailAccessoiresLignes: (Vente & { benefice: number })[] = [];

  ouvrirDetailAccessoires(): void {
    if (!this.stats) return;
    this.detailAccessoiresOuvert = true;
    this.detailAccessoiresChargement = true;
    this.detailAccessoiresErreur = '';
    const { startDate, endDate } = this.stats;
    this.venteService.getVentes().subscribe({
      next: (ventes) => {
        this.detailAccessoiresLignes = ventes
          .filter(v => v.article?.type === 'accessory')
          .filter(v => { const j = this.jourDeVente(v); return j >= startDate && j <= endDate; })
          .map(v => ({
            ...v,
            benefice: (v.qte || 1) * (Number(v.prix || 0) - Number(v.article.prix_achat || 0)),
          }))
          .sort((a, b) => this.jourDeVente(b).localeCompare(this.jourDeVente(a)) || (b.id_vente ?? 0) - (a.id_vente ?? 0));
        this.detailAccessoiresChargement = false;
      },
      error: () => {
        this.detailAccessoiresErreur = 'Impossible de charger le détail des accessoires.';
        this.detailAccessoiresChargement = false;
      }
    });
  }

  fermerDetailAccessoires(): void {
    this.detailAccessoiresOuvert = false;
  }

  // ── Losses detail: which supplier's part caused each warranty return ──

  detailPertesOuvert = false;
  detailPertesChargement = false;
  detailPertesErreur = '';
  detailPertesLignes: PerteReparation[] = [];

  ouvrirDetailPertes(): void {
    this.detailPertesOuvert = true;
    this.detailPertesChargement = true;
    this.detailPertesErreur = '';
    this.venteService.getPertesDetail(this.periode).subscribe({
      next: (lignes) => {
        this.detailPertesLignes = lignes;
        this.detailPertesChargement = false;
      },
      error: () => {
        this.detailPertesErreur = 'Impossible de charger le détail des pertes.';
        this.detailPertesChargement = false;
      }
    });
  }

  fermerDetailPertes(): void {
    this.detailPertesOuvert = false;
  }

  // ── Most used detail: parts used in repairs vs accessories sold (box 6) ──

  detailTopOuvert = false;
  topVue: 'pieces' | 'accessoires' = 'pieces';

  ouvrirDetailTop(vue: 'pieces' | 'accessoires' = 'pieces'): void {
    this.topVue = vue;
    this.detailTopOuvert = true;
  }

  fermerDetailTop(): void {
    this.detailTopOuvert = false;
  }
}
