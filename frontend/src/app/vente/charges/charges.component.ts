import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ChargeService } from '../../services/charge.service';
import { Charge } from '../../models/charge.model';
import { PaiementFournisseurService, FournisseurDu, PaiementFournisseur } from '../../services/paiement-fournisseur.service';

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

  constructor(private chargeService: ChargeService, private paiementService: PaiementFournisseurService) { }

  ngOnInit(): void {
    this.loadCharges();
    this.chargerFournisseurs();
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

  loadCharges() {
    this.chargeService.getCharges().subscribe({
      next: (data) => {
        this.charges = data;
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

  /** Totals of each month, split by type, most recent first. */
  get depensesParMois(): { key: string; label: string; nombre: number; mensuelles: number; journalieres: number; total: number; enCours: boolean }[] {
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
      .map(([key, m]) => ({ key, label: this.libelleMois(key), ...m, total: m.mensuelles + m.journalieres, enCours: key === this.moisCourant }));
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

  /** Daily expenses: average per day over the complete days since the first one (empty days count 0). */
  get moyenneJournalieres(): { parJour: number; nbJours: number; provisoire: boolean } {
    const liste = this.charges.filter(c => this.typeDe(c) === 'journaliere');
    if (liste.length === 0) return { parJour: 0, nbJours: 0, provisoire: false };
    const today = this.aujourdhui;
    const premier = liste.map(c => this.jourDe(c)).sort()[0];
    const nbJours = this.joursEntre(premier, today); // days from the first expense up to yesterday
    if (nbJours <= 0) {
      const total = liste.reduce((s, c) => s + Number(c.montant || 0), 0);
      return { parJour: total, nbJours: 1, provisoire: true };
    }
    const total = liste.filter(c => this.jourDe(c) < today).reduce((s, c) => s + Number(c.montant || 0), 0);
    return { parJour: total / nbJours, nbJours, provisoire: false };
  }

  /** What must be earned each month: monthly expenses + daily expenses over a 30-day month. */
  get objectifMensuel(): number {
    return this.moyenneMensuelles.moyenne + this.moyenneJournalieres.parJour * 30;
  }

  get objectifJournalier(): number {
    return this.objectifMensuel / 30;
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
    if (!this.paiement.id_fournisseur) { this.paiementErreur = 'Choisissez le fournisseur.'; return; }
    if (!this.paiement.montant || this.paiement.montant <= 0) { this.paiementErreur = 'Saisissez un montant supérieur à 0.'; return; }
    if (this.resteApresPaiement < -0.0005) { this.paiementErreur = 'Le montant dépasse ce qui est dû à ce fournisseur.'; return; }
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
        this.paiementMessage = `Paiement enregistré pour ${res.fournisseur} : il reste ${res.reste_du} à payer.`;
        this.chargerFournisseurs();
      },
      error: (err) => {
        this.paiementEnCours = false;
        this.paiementErreur = err.error?.message || "Erreur lors de l'enregistrement du paiement.";
      }
    });
  }

  annulerPaiement(p: PaiementFournisseur) {
    if (!confirm(`Annuler ce paiement de ${p.montant} à ${this.nomFournisseur(p)} ? Le montant sera de nouveau dû.`)) return;
    this.paiementService.annuler(p.id).subscribe({
      next: () => this.chargerFournisseurs(),
      error: (err) => { this.paiementErreur = err.error?.message || "Impossible d'annuler le paiement."; }
    });
  }

  openModal() {
    this.formData = this.initForm();
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
  }

  saveCharge() {
    if (!this.formData.description || !this.formData.montant || this.formData.montant <= 0) {
      alert('Veuillez fournir une description et un montant valide.');
      return;
    }

    // Only daily expenses can be paid from the caisse
    if (this.formData.type_depense !== 'journaliere') this.formData.paye_caisse = false;

    this.chargeService.createCharge(this.formData as Charge).subscribe({
      next: () => {
        this.loadCharges();
        this.closeModal();
      },
      error: (err) => {
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
