import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PerteReparation, VenteService } from '../../services/vente.service';
import { ArticleService } from '../../services/article.service';
import { PaiementFournisseurService } from '../../services/paiement-fournisseur.service';
import { ChargeService } from '../../services/charge.service';
import { PeriodeStats, VenteStats } from '../../models/vente-stats.model';
import { Vente } from '../../models/vente.model';
import { Charge } from '../../models/charge.model';

@Component({
  selector: 'app-statistiques',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './statistiques.component.html',
  styleUrls: ['./statistiques.component.css']
})
export class StatistiquesComponent implements OnInit {
  stats: VenteStats | null = null;
  loading = true;
  errorMsg = '';
  periode: PeriodeStats = 'month';

  readonly periodes: { valeur: PeriodeStats; label: string }[] = [
    { valeur: 'today', label: 'STATS.PERIOD_TODAY' },
    { valeur: 'week', label: 'STATS.PERIOD_WEEK' },
    { valeur: 'month', label: 'STATS.PERIOD_MONTH' },
    { valeur: 'year', label: 'STATS.PERIOD_YEAR' },
  ];

  constructor(
    private venteService: VenteService,
    private articleService: ArticleService,
    private paiementFournisseurService: PaiementFournisseurService,
    private chargeService: ChargeService,
    private translate: TranslateService,
  ) { }

  ngOnInit(): void {
    this.loadStats();
    this.loadCapital();
    this.loadHistorique();
    this.loadDepenses();
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
        this.errorMsg = 'STATS.ERR_LOAD_STATS';
        this.loading = false;
      }
    });
  }

  get periodeLabel(): string {
    const key = this.periodes.find(p => p.valeur === this.periode)?.label || '';
    return key ? this.translate.instant(key) : '';
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
        this.detailReparationsErreur = 'STATS.ERR_LOAD_REPAIR_DETAIL';
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
        this.detailAccessoiresErreur = 'STATS.ERR_LOAD_ACCESSORY_DETAIL';
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
        this.detailPertesErreur = 'STATS.ERR_LOAD_LOSS_DETAIL';
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

  /** Locale tag matching the active UI language, for date/month name formatting. */
  private localeTag(): string {
    const lang = this.translate.getCurrentLang() || this.translate.getBrowserLang() || 'fr';
    return lang === 'ar' ? 'ar-TN' : lang === 'en' ? 'en-US' : 'fr-FR';
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
        .toLocaleDateString(this.localeTag(), { weekday: 'long', day: 'numeric', month: 'long' });
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
        annees.set(annee, { key: 'a' + annee, label: annee === anneeCourante ? this.translate.instant('STATS.CURRENT_YEAR_SUFFIX', { year: annee }) : annee, ventes: [], total: 0, mois: [] });
      }
      const ventes = this.trier(parMois.get(m)!);
      const nom = new Date(+annee, +m.slice(5, 7) - 1, 1).toLocaleDateString(this.localeTag(), { month: 'long' });
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

  // ── Expenses, grouped by month → day (same view as the Dépenses page) ──

  depenses: Charge[] = [];
  depensesChargement = true;

  loadDepenses(): void {
    this.depensesChargement = true;
    this.chargeService.getCharges().subscribe({
      next: (charges) => { this.depenses = charges; this.depensesChargement = false; },
      error: () => { this.depensesChargement = false; }
    });
  }

  private typeDeCharge(c: Charge): 'mensuelle' | 'journaliere' {
    return c.type_depense === 'journaliere' ? 'journaliere' : 'mensuelle';
  }

  /** Local day (YYYY-MM-DD) of an expense. */
  private jourDeCharge(c: Charge): string {
    const s = String(c.date_charge);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(c.date_charge);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private get aujourdhuiStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private get moisCourantStr(): string {
    return this.aujourdhuiStr.slice(0, 7);
  }

  private libelleMoisCharge(key: string): string {
    const nom = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, 1).toLocaleDateString(this.localeTag(), { month: 'long', year: 'numeric' });
    return nom.charAt(0).toUpperCase() + nom.slice(1);
  }

  private libelleJourCharge(jour: string): string {
    const nom = new Date(+jour.slice(0, 4), +jour.slice(5, 7) - 1, +jour.slice(8, 10))
      .toLocaleDateString(this.localeTag(), { weekday: 'long', day: 'numeric', month: 'long' });
    return nom.charAt(0).toUpperCase() + nom.slice(1);
  }

  /** Profit made that month, from the sales history already loaded. */
  private beneficeDuMoisCharge(moisKey: string): number {
    return this.beneficeListe(this.historique.filter(v => this.jourDeVente(v).slice(0, 7) === moisKey));
  }

  /** Totals of each month, split by type, most recent first. */
  get depensesParMois(): { key: string; label: string; nombre: number; mensuelles: number; journalieres: number; total: number; benefice: number; resultat: number; enCours: boolean }[] {
    const mois = new Map<string, { nombre: number; mensuelles: number; journalieres: number }>();
    for (const c of this.depenses) {
      const k = this.jourDeCharge(c).slice(0, 7);
      const m = mois.get(k) || { nombre: 0, mensuelles: 0, journalieres: 0 };
      m.nombre += 1;
      if (this.typeDeCharge(c) === 'journaliere') m.journalieres += Number(c.montant || 0);
      else m.mensuelles += Number(c.montant || 0);
      mois.set(k, m);
    }
    return [...mois.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, m]) => {
        const total = m.mensuelles + m.journalieres;
        const benefice = this.beneficeDuMoisCharge(key);
        return { key, label: this.libelleMoisCharge(key), ...m, total, benefice, resultat: benefice - total, enCours: key === this.moisCourantStr };
      });
  }

  /** Which expense months are expanded to show their day-by-day detail. */
  private moisDepensesOuverts = new Set<string>();

  basculerMoisDepenses(key: string): void {
    if (this.moisDepensesOuverts.has(key)) this.moisDepensesOuverts.delete(key);
    else this.moisDepensesOuverts.add(key);
  }

  moisDepensesEstOuvert(key: string): boolean {
    return this.moisDepensesOuverts.has(key);
  }

  nbJoursDansMoisCharge(moisKey: string): number {
    return new Date(+moisKey.slice(0, 4), +moisKey.slice(5, 7), 0).getDate();
  }

  /** For one expense month: every one of its days, monthly-type expenses spread evenly across them. */
  joursDuMoisCharge(moisKey: string): { jour: string; label: string; charges: Charge[]; partMensuelle: number; journalieres: number; total: number }[] {
    const parJour = new Map<string, Charge[]>();
    let totalMensuelles = 0;
    for (const c of this.depenses) {
      const j = this.jourDeCharge(c);
      if (!j.startsWith(moisKey)) continue;
      if (this.typeDeCharge(c) === 'mensuelle') { totalMensuelles += Number(c.montant || 0); continue; }
      if (!parJour.has(j)) parJour.set(j, []);
      parJour.get(j)!.push(c);
    }
    const nbJours = this.nbJoursDansMoisCharge(moisKey);
    const partMensuelle = totalMensuelles / nbJours;
    const dernierJour = moisKey === this.moisCourantStr ? +this.aujourdhuiStr.slice(8, 10) : nbJours;

    const jours: { jour: string; label: string; charges: Charge[]; partMensuelle: number; journalieres: number; total: number }[] = [];
    for (let n = dernierJour; n >= 1; n--) {
      const jour = `${moisKey}-${String(n).padStart(2, '0')}`;
      const charges = parJour.get(jour) || [];
      const journalieres = charges.reduce((s, c) => s + Number(c.montant || 0), 0);
      jours.push({ jour, label: this.libelleJourCharge(jour), charges, partMensuelle, journalieres, total: partMensuelle + journalieres });
    }
    return jours;
  }
}
