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
    this.loadHistorique();
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

  // ── Sales history, grouped by day → month → year (same view as the Ventes page) ──

  historique: Vente[] = [];
  historiqueChargement = true;
  private dossiersOuverts = new Set<string>(['aujourdhui']);

  loadHistorique(): void {
    this.historiqueChargement = true;
    this.venteService.getVentes().subscribe({
      next: (ventes) => { this.historique = ventes; this.historiqueChargement = false; },
      error: () => { this.historiqueChargement = false; }
    });
  }

  dossierOuvert(key: string): boolean {
    return this.dossiersOuverts.has(key);
  }

  basculerDossier(key: string): void {
    if (this.dossiersOuverts.has(key)) this.dossiersOuverts.delete(key);
    else this.dossiersOuverts.add(key);
  }

  trackByKey(_: number, item: { key: string }): string {
    return item.key;
  }

  beneficeVente(v: Vente): number | null {
    const cout = v.article ? v.article.prix_achat : v.cout;
    if (cout === null || cout === undefined) return null;
    return (v.qte || 1) * ((Number(v.prix) || 0) - (Number(cout) || 0));
  }

  beneficeListe(liste: Vente[]): number {
    return liste.reduce((s, v) => s + (this.beneficeVente(v) ?? 0), 0);
  }

  private totalListe(liste: Vente[]): number {
    return liste.reduce((s, v) => s + (v.qte || 1) * (v.prix || 0), 0);
  }

  private trier(liste: Vente[]): Vente[] {
    return [...liste].sort((a, b) =>
      this.jourDeVente(b).localeCompare(this.jourDeVente(a)) || (b.id_vente ?? 0) - (a.id_vente ?? 0));
  }

  /** One folder per calendar day, most recent first. */
  private parJour(liste: Vente[]) {
    const jours = new Map<string, Vente[]>();
    for (const v of this.trier(liste)) {
      const j = this.jourDeVente(v);
      if (!jours.has(j)) jours.set(j, []);
      jours.get(j)!.push(v);
    }
    return [...jours.entries()].map(([jour, ventes]) => {
      const nom = new Date(+jour.slice(0, 4), +jour.slice(5, 7) - 1, +jour.slice(8, 10))
        .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      return { key: 'j' + jour, label: nom.charAt(0).toUpperCase() + nom.slice(1), ventes, total: this.totalListe(ventes) };
    });
  }

  /** Today's sales, this month's earlier sales, then one folder per year holding its months. */
  get historiqueGroupes() {
    const aujourdhui = this.jourDeVente({ date: new Date().toISOString() } as Vente);
    const moisCourant = aujourdhui.slice(0, 7);
    const anneeCourante = aujourdhui.slice(0, 4);

    const duJour: Vente[] = [];
    const ceMois: Vente[] = [];
    const parMois = new Map<string, Vente[]>();

    for (const v of this.historique) {
      const jour = this.jourDeVente(v);
      if (jour === aujourdhui) duJour.push(v);
      else if (jour.startsWith(moisCourant)) ceMois.push(v);
      else {
        const m = jour.slice(0, 7);
        if (!parMois.has(m)) parMois.set(m, []);
        parMois.get(m)!.push(v);
      }
    }

    const annees = new Map<string, { key: string; label: string; ventes: Vente[]; total: number; mois: any[] }>();
    for (const m of [...parMois.keys()].sort().reverse()) {
      const annee = m.slice(0, 4);
      if (!annees.has(annee)) {
        annees.set(annee, { key: 'a' + annee, label: annee === anneeCourante ? `${annee} (cette année)` : annee, ventes: [], total: 0, mois: [] });
      }
      const ventes = this.trier(parMois.get(m)!);
      const nom = new Date(+annee, +m.slice(5, 7) - 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
      const groupe = annees.get(annee)!;
      groupe.ventes.push(...ventes);
      groupe.mois.push({ key: 'm' + m, label: nom.charAt(0).toUpperCase() + nom.slice(1), ventes, total: this.totalListe(ventes), jours: this.parJour(ventes) });
    }
    const listeAnnees = [...annees.values()].map(a => ({ ...a, total: this.totalListe(a.ventes) }));

    return {
      aujourdhui: { ventes: this.trier(duJour), total: this.totalListe(duJour) },
      ceMois: { ventes: this.trier(ceMois), total: this.totalListe(ceMois), jours: this.parJour(ceMois) },
      annees: listeAnnees,
    };
  }
}
