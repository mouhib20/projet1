import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VenteService } from '../../services/vente.service';
import { ArticleService } from '../../services/article.service';
import { PaiementFournisseurService } from '../../services/paiement-fournisseur.service';
import { PeriodeStats, VenteStats } from '../../models/vente-stats.model';

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
}
