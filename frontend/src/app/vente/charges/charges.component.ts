import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ChargeService } from '../../services/charge.service';
import { Charge } from '../../models/charge.model';
import { PaiementFournisseurService, FournisseurDu, PaiementFournisseur } from '../../services/paiement-fournisseur.service';
import { VenteService } from '../../services/vente.service';
import { Vente } from '../../models/vente.model';

@Component({
  selector: 'app-charges',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './charges.component.html',
  styleUrls: ['./charges.component.css']
})
export class ChargesComponent implements OnInit {
  charges: Charge[] = [];
  isModalOpen = false;
  searchTerm = '';

  formData: Partial<Charge> = this.initForm();

  constructor(
    private chargeService: ChargeService,
    private paiementService: PaiementFournisseurService,
    private venteService: VenteService,
    private translate: TranslateService,
  ) { }

  ngOnInit(): void {
    this.loadCharges();
    this.chargerFournisseurs();
    this.loadVentes();
  }

  // ── What's actually been earned this month, to compare against the objective ──

  ventes: Vente[] = [];
  /** False until the sales have loaded, so the card shows "…" instead of a misleading 0 meanwhile. */
  ventesChargees = false;

  loadVentes() {
    this.venteService.getVentes().subscribe({
      next: (data) => { this.ventes = data; this.ventesChargees = true; },
      error: (err) => console.error(err)
    });
  }

  /** Local calendar day (YYYY-MM-DD) of a sale, same rule as the sales history page. */
  private jourDeVente(v: Vente): string {
    const d = String(v.date);
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const dt = new Date(v.date);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  /**
   * Profit of one sale line: price minus its cost (the article's purchase price, or, for a repair
   * line, the parts cost kept on the line). Older lines with no known cost are left out (null),
   * same rule as the sales-history page.
   */
  private beneficeVente(v: Vente): number | null {
    const cout = v.article ? v.article.prix_achat : v.cout;
    if (cout === null || cout === undefined) return null;
    return (v.qte || 1) * (Number(v.prix || 0) - (Number(cout) || 0));
  }

  private beneficeListe(liste: Vente[]): number {
    return liste.reduce((s, v) => s + (this.beneficeVente(v) ?? 0), 0);
  }

  get beneficeAujourdhui(): number {
    return this.beneficeListe(this.ventes.filter(v => this.jourDeVente(v) === this.aujourdhui));
  }

  get beneficeMoisCourant(): number {
    return this.beneficeListe(this.ventes.filter(v => this.jourDeVente(v).slice(0, 7) === this.moisCourant));
  }

  initForm(): Partial<Charge> {
    return {
      description: '',
      montant: 0,
      paye_caisse: true,
      type_depense: 'mensuelle',
      date_charge: new Date().toISOString().split('T')[0]
    };
  }

  /** False until the expenses have loaded, so the totals show "…" instead of a misleading 0 meanwhile. */
  chargesChargees = false;

  loadCharges() {
    this.chargeService.getCharges().subscribe({
      next: (data) => {
        this.charges = data;
        this.chargesChargees = true;
      },
      error: (err) => console.error(err)
    });
  }

  get filteredCharges(): Charge[] {
    if (!this.searchTerm) return this.charges;
    const term = this.searchTerm.toLowerCase();
    return this.charges.filter(c =>
      (c.description || '').toLowerCase().includes(term)
    );
  }

  get totalAmount(): number {
    return this.charges.reduce((sum, c) => sum + Number(c.montant || 0), 0);
  }

  // ── Summary: how much must be earned to cover the expenses ──
  // Two kinds of expenses: monthly (rent, salaries…) averaged per month, and daily (small daily
  // costs) averaged per day then scaled to a 30-day month. The need is the sum of both.

  private typeDe(c: Charge): 'mensuelle' | 'journaliere' {
    return c.type_depense === 'journaliere' ? 'journaliere' : 'mensuelle';
  }

  /** Local day (YYYY-MM-DD) of an expense. */
  private jourDe(c: Charge): string {
    const s = String(c.date_charge);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(c.date_charge);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private get aujourdhui(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private get moisCourant(): string {
    return this.aujourdhui.slice(0, 7);
  }

  private libelleMois(key: string): string {
    const nom = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return nom.charAt(0).toUpperCase() + nom.slice(1);
  }

  private joursEntre(a: string, b: string): number {
    const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
    return Math.round((t(b) - t(a)) / 86400000);
  }

  /** Profit made that month (same rule as beneficeMoisCourant, for any month key). */
  private beneficeDuMois(moisKey: string): number {
    return this.beneficeListe(this.ventes.filter(v => this.jourDeVente(v).slice(0, 7) === moisKey));
  }

  /** Totals of each month, split by type, most recent first. */
  get depensesParMois(): { key: string; label: string; nombre: number; mensuelles: number; journalieres: number; total: number; benefice: number; resultat: number; enCours: boolean }[] {
    const mois = new Map<string, { nombre: number; mensuelles: number; journalieres: number }>();
    for (const c of this.charges) {
      const k = this.jourDe(c).slice(0, 7);
      const m = mois.get(k) || { nombre: 0, mensuelles: 0, journalieres: 0 };
      m.nombre += 1;
      if (this.typeDe(c) === 'journaliere') m.journalieres += Number(c.montant || 0);
      else m.mensuelles += Number(c.montant || 0);
      mois.set(k, m);
    }
    return [...mois.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, m]) => {
        const total = m.mensuelles + m.journalieres;
        const benefice = this.beneficeDuMois(key);
        return { key, label: this.libelleMois(key), ...m, total, benefice, resultat: benefice - total, enCours: key === this.moisCourant };
      });
  }

  /** Which months are expanded to show their day-by-day detail. */
  private moisOuverts = new Set<string>();

  basculerMois(key: string): void {
    if (this.moisOuverts.has(key)) this.moisOuverts.delete(key);
    else this.moisOuverts.add(key);
  }

  moisEstOuvert(key: string): boolean {
    return this.moisOuverts.has(key);
  }

  private libelleJour(jour: string): string {
    const nom = new Date(+jour.slice(0, 4), +jour.slice(5, 7) - 1, +jour.slice(8, 10))
      .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return nom.charAt(0).toUpperCase() + nom.slice(1);
  }

  nbJoursDansMois(moisKey: string): number {
    return new Date(+moisKey.slice(0, 4), +moisKey.slice(5, 7), 0).getDate();
  }

  /**
   * For one month: every one of its days (up to today for the current month — future days have no
   * share yet), with the monthly-type expenses (rent, salaries…) of that month spread evenly across
   * all its days, plus whatever daily-type expenses were entered on that exact day.
   */
  joursDuMois(moisKey: string): { jour: string; label: string; charges: Charge[]; partMensuelle: number; journalieres: number; total: number }[] {
    const parJour = new Map<string, Charge[]>();
    let totalMensuelles = 0;
    for (const c of this.charges) {
      const j = this.jourDe(c);
      if (!j.startsWith(moisKey)) continue;
      if (this.typeDe(c) === 'mensuelle') { totalMensuelles += Number(c.montant || 0); continue; }
      if (!parJour.has(j)) parJour.set(j, []);
      parJour.get(j)!.push(c);
    }
    const nbJours = this.nbJoursDansMois(moisKey);
    const partMensuelle = totalMensuelles / nbJours;
    const dernierJour = moisKey === this.moisCourant ? +this.aujourdhui.slice(8, 10) : nbJours;

    const jours: { jour: string; label: string; charges: Charge[]; partMensuelle: number; journalieres: number; total: number }[] = [];
    for (let n = dernierJour; n >= 1; n--) {
      const jour = `${moisKey}-${String(n).padStart(2, '0')}`;
      const charges = parJour.get(jour) || [];
      const journalieres = charges.reduce((s, c) => s + Number(c.montant || 0), 0);
      jours.push({ jour, label: this.libelleJour(jour), charges, partMensuelle, journalieres, total: partMensuelle + journalieres });
    }
    return jours;
  }

  /** Monthly expenses: average over the complete months since the first one (empty months count 0). */
  get moyenneMensuelles(): { moyenne: number; nbMois: number; provisoire: boolean } {
    const liste = this.charges.filter(c => this.typeDe(c) === 'mensuelle');
    if (liste.length === 0) return { moyenne: 0, nbMois: 0, provisoire: false };
    const courant = this.moisCourant;
    const premier = liste.map(c => this.jourDe(c).slice(0, 7)).sort()[0];
    if (premier >= courant) {
      const total = liste.reduce((s, c) => s + Number(c.montant || 0), 0);
      return { moyenne: total, nbMois: 1, provisoire: true };
    }
    const nbMois = (+courant.slice(0, 4) - +premier.slice(0, 4)) * 12 + (+courant.slice(5, 7) - +premier.slice(5, 7));
    const total = liste.filter(c => this.jourDe(c).slice(0, 7) < courant).reduce((s, c) => s + Number(c.montant || 0), 0);
    return { moyenne: total / nbMois, nbMois, provisoire: false };
  }

  /**
   * Daily expenses: average per day over the complete days since the first one (empty days count 0),
   * then used to project a month. With very little history (few days, or a single expense so far)
   * that projection is not trustworthy — it is marked "provisoire" instead of shown as a firm number,
   * the same way the monthly average is while only the current month exists.
   */
  get moyenneJournalieres(): { parJour: number; nbJours: number; nbDepenses: number; total: number; provisoire: boolean } {
    const liste = this.charges.filter(c => this.typeDe(c) === 'journaliere');
    const nbDepenses = liste.length;
    if (nbDepenses === 0) return { parJour: 0, nbJours: 0, nbDepenses: 0, total: 0, provisoire: false };
    const today = this.aujourdhui;
    const premier = liste.map(c => this.jourDe(c)).sort()[0];
    const nbJours = this.joursEntre(premier, today); // days from the first expense up to yesterday
    if (nbJours <= 0) {
      const total = liste.reduce((s, c) => s + Number(c.montant || 0), 0);
      return { parJour: total, nbJours: 1, nbDepenses, total, provisoire: true };
    }
    const total = liste.filter(c => this.jourDe(c) < today).reduce((s, c) => s + Number(c.montant || 0), 0);
    // Under a week of history: too little to trust a whole month's projection from it
    const provisoire = nbJours < 7;
    return { parJour: total / nbJours, nbJours, nbDepenses, total, provisoire };
  }

  /** What must be earned each month: monthly expenses + daily expenses over a 30-day month. */
  get objectifMensuel(): number {
    return this.moyenneMensuelles.moyenne + this.moyenneJournalieres.parJour * 30;
  }

  /** How many days of the current month are left, today included. */
  get joursRestantsMois(): number {
    const nbJours = this.nbJoursDansMois(this.moisCourant);
    const jourActuel = +this.aujourdhui.slice(8, 10);
    return Math.max(1, nbJours - jourActuel + 1);
  }

  /**
   * How much profit is still needed, per remaining day of the month (today included), to reach
   * this month's objective (what's already been spent) by the end of the month. Once the objective
   * is already reached, there is nothing left to catch up on.
   */
  get objectifJournalier(): number {
    const resteAGagner = Math.max(0, this.depensesMoisCourant - this.beneficeMoisCourant);
    return resteAGagner / this.joursRestantsMois;
  }

  get depensesMoisCourant(): number {
    return this.depensesParMois.find(m => m.enCours)?.total ?? 0;
  }

  // ── Supplier payments: what is owed to each supplier, and paying them ──

  readonly Number = Number;
  fournisseursDus: FournisseurDu[] = [];
  paiements: PaiementFournisseur[] = [];
  paiementOuvert = false;
  paiement = { id_fournisseur: null as number | null, montant: null as number | null, date: new Date().toISOString().split('T')[0], note: '', paye_caisse: false };
  paiementEnCours = false;
  paiementErreur = '';
  paiementMessage = '';

  chargerFournisseurs() {
    this.paiementService.getDus().subscribe({ next: (d) => this.fournisseursDus = d, error: (e) => console.error(e) });
    this.paiementService.getHistorique().subscribe({ next: (h) => this.paiements = h, error: (e) => console.error(e) });
  }

  get totalDu(): number {
    return this.fournisseursDus.reduce((s, f) => s + Math.max(0, Number(f.solde) || 0), 0);
  }

  nomFournisseur(f: { entreprise?: string; nom: string; prenom?: string }): string {
    return f.entreprise || `${f.nom} ${f.prenom || ''}`.trim();
  }

  categories(f: { type_articles?: string }): string[] {
    return (f.type_articles || '').split(',').map(s => s.trim()).filter(Boolean);
  }

  get fournisseurChoisi(): FournisseurDu | undefined {
    return this.fournisseursDus.find(f => f.id_fournisseur === this.paiement.id_fournisseur);
  }

  get resteApresPaiement(): number {
    return (Number(this.fournisseurChoisi?.solde) || 0) - (Number(this.paiement.montant) || 0);
  }

  ouvrirPaiement(f?: FournisseurDu) {
    this.paiementErreur = '';
    this.paiementMessage = '';
    this.paiement = {
      id_fournisseur: f ? f.id_fournisseur : null,
      montant: f ? Number(f.solde) || null : null,
      date: new Date().toISOString().split('T')[0],
      note: '',
      paye_caisse: false
    };
    this.paiementOuvert = true;
  }

  fermerPaiement() {
    this.paiementOuvert = false;
  }

  /** Picking another supplier proposes to pay everything that is owed to it. */
  onFournisseurPaiementChange() {
    const f = this.fournisseurChoisi;
    this.paiement.montant = f ? (Number(f.solde) || null) : null;
  }

  toutPayer() {
    this.paiement.montant = Number(this.fournisseurChoisi?.solde) || null;
  }

  enregistrerPaiement() {
    this.paiementErreur = '';
    this.paiementMessage = '';
    if (!this.paiement.id_fournisseur) { this.paiementErreur = 'CHARGES.ERR_CHOOSE_SUPPLIER'; return; }
    if (!this.paiement.montant || this.paiement.montant <= 0) { this.paiementErreur = 'CHARGES.ERR_INVALID_AMOUNT'; return; }
    if (this.resteApresPaiement < -0.0005) { this.paiementErreur = 'CHARGES.ERR_AMOUNT_EXCEEDS_DUE'; return; }
    this.paiementEnCours = true;
    this.paiementService.payer({
      id_fournisseur: this.paiement.id_fournisseur,
      montant: this.paiement.montant,
      date: this.paiement.date,
      note: this.paiement.note,
      paye_caisse: this.paiement.paye_caisse
    }).subscribe({
      next: (res) => {
        this.paiementEnCours = false;
        this.paiementOuvert = false;
        this.paiementMessage = this.translate.instant('CHARGES.SUCCESS_PAYMENT', { supplier: res.fournisseur, remaining: res.reste_du });
        this.chargerFournisseurs();
      },
      error: (err) => {
        this.paiementEnCours = false;
        this.paiementErreur = err.error?.message || 'CHARGES.ERR_PAYMENT_SAVE';
      }
    });
  }

  annulerPaiement(p: PaiementFournisseur) {
    if (!confirm(this.translate.instant('CHARGES.CONFIRM_CANCEL_PAYMENT', { amount: p.montant, name: this.nomFournisseur(p) }))) return;
    this.paiementService.annuler(p.id).subscribe({
      next: () => this.chargerFournisseurs(),
      error: (err) => { this.paiementErreur = err.error?.message || 'CHARGES.ERR_CANCEL_PAYMENT'; }
    });
  }

  openModal() {
    this.formData = this.initForm();
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
  }

  /** True while the expense is being saved: further taps are ignored (no duplicate expenses). */
  savingCharge = false;

  saveCharge() {
    if (this.savingCharge) return;
    if (!this.formData.description || !this.formData.montant || this.formData.montant <= 0) {
      alert('Veuillez fournir une description et un montant valide.');
      return;
    }

    // Only daily expenses can be paid from the caisse
    if (this.formData.type_depense !== 'journaliere') this.formData.paye_caisse = false;

    this.savingCharge = true;
    this.chargeService.createCharge(this.formData as Charge).subscribe({
      next: () => {
        this.savingCharge = false;
        this.loadCharges();
        this.closeModal();
      },
      error: (err) => {
        this.savingCharge = false;
        console.error(err);
        alert('Erreur lors de la création de la charge.');
      }
    });
  }

  deleteCharge(id: number) {
    if (confirm('Voulez-vous vraiment supprimer cette charge ?')) {
      this.chargeService.deleteCharge(id).subscribe({
        next: () => this.loadCharges(),
        error: (err) => console.error(err)
      });
    }
  }
}
