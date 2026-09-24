import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { VenteService } from '../../services/vente.service';
import { ClientService } from '../../services/client.service';
import { ArticleService, ArticleForm, articleImageUrl } from '../../services/article.service';
import { AuthService } from '../../services/auth.service';
import { PosBridgeService } from '../../services/pos-bridge.service';
import { Vente } from '../../models/vente.model';
import { Client } from '../../models/client.model';
import { CaisseComponent } from '../caisse/caisse.component';

export interface PosCartItem {
  articleId?: number;
  reparationId?: number;
  designation: string;
  image?: string;
  qte: number;
  prix: number;
  prix_achat: number;
  maxStock: number;
}

@Component({
  selector: 'app-operations',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, CaisseComponent],
  templateUrl: './operations.component.html',
  styleUrls: ['./operations.component.css']
})
export class OperationsComponent implements OnInit {
  ventes: Vente[] = [];
  clients: Client[] = [];
  articles: ArticleForm[] = [];

  isClientModalOpen = false;
  searchTerm = '';

  clientForm: Partial<Client> = { nom: '', telephone: '' };

  // ── POS (Vente Rapide) ──────────────────────────────────────
  activeView: 'list' | 'pos' | 'caisse' = 'list';
  posSearchTerm = '';
  posShowResults = false;
  posCart: PosCartItem[] = [];
  posClientId: number | undefined;
  posRemiseAmount = 0;
  posRemiseType: 'fixed' | 'percent' = 'fixed';
  posMontantSolde = 0;
  posSaving = false;

  constructor(
    private venteService: VenteService,
    private clientService: ClientService,
    private articleService: ArticleService,
    private posBridge: PosBridgeService,
    public auth: AuthService
  ) { }

  ngOnInit(): void {
    this.loadVentes();
    this.loadClients();
    this.loadArticles();
    this.consumePendingRepair();
  }

  /** Picks up a repair ticket handed off from the Reparation page, if any, as a POS cart line. */
  private consumePendingRepair(): void {
    const item = this.posBridge.consumePendingRepairItem();
    if (!item) return;
    this.posCart.push({
      reparationId: item.reparationId,
      designation: item.designation,
      qte: 1,
      prix: item.prix,
      prix_achat: item.prix_achat,
      maxStock: 1
    });
    this.activeView = 'pos';
  }

  loadVentes() {
    this.venteService.getVentes().subscribe({
      next: (data) => this.ventes = data,
      error: (err) => console.error(err)
    });
  }

  loadClients() {
    this.clientService.getClients().subscribe({
      next: (data) => this.clients = data,
      error: (err) => console.error(err)
    });
  }

  loadArticles() {
    this.articleService.getArticles().subscribe({
      next: (data) => this.articles = data,
      error: (err) => console.error(err)
    });
  }

  get filteredVentes(): Vente[] {
    if (!this.searchTerm) return this.ventes;
    const term = this.searchTerm.toLowerCase();
    return this.ventes.filter(v =>
      (v.designation || '').toLowerCase().includes(term) ||
      (v.client?.nom || '').toLowerCase().includes(term) ||
      (v.article?.designation || '').toLowerCase().includes(term)
    );
  }

  // ── Sales history grouped by day → month → year ───────────────

  private ouverts = new Set<string>(['aujourdhui']);

  /** While searching, every folder is opened so the matches are visible. */
  estOuvert(key: string): boolean {
    return !!this.searchTerm || this.ouverts.has(key);
  }

  basculerDossier(key: string): void {
    if (this.ouverts.has(key)) this.ouverts.delete(key);
    else this.ouverts.add(key);
  }

  trackByKey(_: number, item: { key: string }): string {
    return item.key;
  }

  /** Local calendar day (YYYY-MM-DD) of a sale. */
  private jourDe(v: Vente): string {
    const d = String(v.date);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const dt = new Date(v.date);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  private total(list: Vente[]): number {
    return list.reduce((s, v) => s + (v.qte || 1) * (v.prix || 0), 0);
  }

  private trier(list: Vente[]): Vente[] {
    return [...list].sort((a, b) =>
      this.jourDe(b).localeCompare(this.jourDe(a)) || (b.id_vente ?? 0) - (a.id_vente ?? 0));
  }

  /** One folder per calendar day, most recent first. */
  private parJour(list: Vente[]) {
    const jours = new Map<string, Vente[]>();
    for (const v of this.trier(list)) {
      const j = this.jourDe(v);
      if (!jours.has(j)) jours.set(j, []);
      jours.get(j)!.push(v);
    }
    return [...jours.entries()].map(([jour, ventes]) => {
      const nom = new Date(+jour.slice(0, 4), +jour.slice(5, 7) - 1, +jour.slice(8, 10))
        .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      return { key: 'j' + jour, label: nom.charAt(0).toUpperCase() + nom.slice(1), ventes, total: this.total(ventes) };
    });
  }

  /** Today's sales, this month's earlier sales, then one folder per year holding its months. */
  get groupesVentes() {
    const now = new Date();
    const aujourdhui = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const moisCourant = aujourdhui.slice(0, 7);
    const anneeCourante = aujourdhui.slice(0, 4);

    const duJour: Vente[] = [];
    const ceMois: Vente[] = [];
    const parMois = new Map<string, Vente[]>();

    for (const v of this.filteredVentes) {
      const jour = this.jourDe(v);
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
      groupe.mois.push({ key: 'm' + m, label: nom.charAt(0).toUpperCase() + nom.slice(1), ventes, total: this.total(ventes), jours: this.parJour(ventes) });
    }
    const listeAnnees = [...annees.values()].map(a => ({ ...a, total: this.total(a.ventes) }));

    return {
      aujourdhui: { ventes: this.trier(duJour), total: this.total(duJour) },
      ceMois: { ventes: this.trier(ceMois), total: this.total(ceMois), jours: this.parJour(ceMois) },
      annees: listeAnnees,
    };
  }

  get availableArticles(): ArticleForm[] {
    return this.articles.filter(a => (a.quantite ?? 0) > 0);
  }

  get totalRevenue(): number {
    return this.ventes.reduce((sum, v) => sum + (v.qte || 1) * (v.prix || 0), 0);
  }

  deleteVente(id: number) {
    if (confirm('Voulez-vous vraiment supprimer cette vente ? Le stock sera restauré.')) {
      this.venteService.deleteVente(id).subscribe({
        next: () => {
          this.loadVentes();
          this.loadArticles();
        },
        error: (err) => console.error(err)
      });
    }
  }

  // Client management
  openClientModal() {
    this.clientForm = { nom: '', telephone: '' };
    this.isClientModalOpen = true;
  }

  closeClientModal() {
    this.isClientModalOpen = false;
  }

  /** True while the client is being saved: further clicks are ignored (no duplicate clients). */
  savingClient = false;

  saveClient() {
    if (this.savingClient) return;
    if (!this.clientForm.nom) {
      alert('Veuillez saisir le nom du client.');
      return;
    }
    this.savingClient = true;
    this.clientService.createClient(this.clientForm as Client).subscribe({
      next: () => {
        this.savingClient = false;
        this.loadClients();
        this.closeClientModal();
      },
      error: (err) => {
        this.savingClient = false;
        console.error(err);
        alert(err.error?.message || "Erreur lors de l'enregistrement du client.");
      }
    });
  }

  // ── POS (Vente Rapide) ──────────────────────────────────────

  setView(view: 'list' | 'pos' | 'caisse'): void {
    this.activeView = view;
  }

  imageUrl(image?: string | null): string | null {
    return articleImageUrl(image);
  }

  get posLowStockArticles(): ArticleForm[] {
    // qte_min = 0 means "no alert" (one-off parts made for a single repair)
    return this.articles.filter(a => (a.qte_min ?? 3) > 0 && (a.quantite ?? 0) <= (a.qte_min ?? 3));
  }

  get posFilteredArticles(): ArticleForm[] {
    if (!this.posSearchTerm || this.posSearchTerm.length < 1) return [];
    const term = this.posSearchTerm.toLowerCase();
    return this.availableArticles.filter(a =>
      (a.designation || '').toLowerCase().includes(term) ||
      (a.barcode || '').toLowerCase().includes(term)
    ).slice(0, 8);
  }

  get posBestSellers(): ArticleForm[] {
    const soldQtyByArticle = new Map<number, number>();
    for (const v of this.ventes) {
      const id = v.article?.id_article;
      if (!id) continue;
      soldQtyByArticle.set(id, (soldQtyByArticle.get(id) || 0) + (v.qte || 0));
    }
    return [...soldQtyByArticle.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => this.articles.find(a => a.id_article === id))
      .filter((a): a is ArticleForm => !!a && (a.quantite ?? 0) > 0);
  }

  posSearchInput(): void {
    this.posShowResults = true;
  }

  posHideResults(): void {
    setTimeout(() => this.posShowResults = false, 200);
  }

  posHandleSearchEnter(): void {
    const results = this.posFilteredArticles;
    if (results.length === 1) {
      this.posAddToCart(results[0]);
    }
  }

  posAddToCart(article: ArticleForm): void {
    if (!article.id_article) return;
    const existing = this.posCart.find(i => i.articleId === article.id_article);
    const maxStock = article.quantite ?? 0;

    if (existing) {
      if (existing.qte >= maxStock) {
        alert(`Stock insuffisant pour "${article.designation}". Disponible: ${maxStock}`);
        return;
      }
      existing.qte += 1;
    } else {
      if (maxStock <= 0) {
        alert(`"${article.designation}" est en rupture de stock.`);
        return;
      }
      this.posCart.push({
        articleId: article.id_article,
        designation: article.designation,
        image: article.image,
        qte: 1,
        prix: article.prix_vente || 0,
        prix_achat: article.prix_achat || 0,
        maxStock
      });
    }
    this.posSearchTerm = '';
    this.posShowResults = false;
  }

  isReparationItem(item: PosCartItem): boolean {
    return !!item.reparationId;
  }

  posUpdateQty(item: PosCartItem, qte: number): void {
    if (item.reparationId) return; // a repair pickup is always exactly 1
    if (qte < 1) qte = 1;
    if (qte > item.maxStock) {
      qte = item.maxStock;
      alert(`Stock insuffisant pour "${item.designation}". Disponible: ${item.maxStock}`);
    }
    item.qte = qte;
  }

  posRemoveFromCart(index: number): void {
    this.posCart.splice(index, 1);
  }

  get posTotalAchat(): number {
    return this.posCart.reduce((sum, i) => sum + i.qte * i.prix_achat, 0);
  }

  get posTotalVente(): number {
    return this.posCart.reduce((sum, i) => sum + i.qte * i.prix, 0);
  }

  get posRemiseValue(): number {
    if (this.posRemiseType === 'percent') {
      return this.posTotalVente * (this.posRemiseAmount || 0) / 100;
    }
    return this.posRemiseAmount || 0;
  }

  get posTotalAPayer(): number {
    return Math.max(0, this.posTotalVente - this.posRemiseValue);
  }

  get posNetProfit(): number {
    return this.posTotalAPayer - this.posTotalAchat;
  }

  get posSelectedClient(): Client | undefined {
    return this.clients.find(c => c.id_client === this.posClientId);
  }

  get posClientSolde(): number {
    return this.posSelectedClient?.solde || 0;
  }

  // The amount actually usable from the client's balance: capped by what's owed and what's available
  get posMontantSoldeEffectif(): number {
    return Math.max(0, Math.min(this.posMontantSolde || 0, this.posClientSolde, this.posTotalAPayer));
  }

  get posResteAPayer(): number {
    return Math.max(0, this.posTotalAPayer - this.posMontantSoldeEffectif);
  }

  onPosClientChange(): void {
    this.posMontantSolde = 0;
  }

  posResetCart(): void {
    this.posCart = [];
    this.posClientId = undefined;
    this.posRemiseAmount = 0;
    this.posRemiseType = 'fixed';
    this.posMontantSolde = 0;
    this.posSearchTerm = '';
  }

  posCheckout(): void {
    if (this.posSaving) return;
    if (this.posCart.length === 0) {
      alert('Le panier est vide.');
      return;
    }
    this.posSaving = true;

    const payload = {
      clientId: this.posClientId || null,
      remise: this.posRemiseValue,
      montantSolde: this.posMontantSoldeEffectif,
      items: this.posCart.map(i => ({
        articleId: i.articleId ?? null,
        reparationId: i.reparationId ?? null,
        designation: i.designation,
        qte: i.qte,
        prix: i.prix
      }))
    };

    this.venteService.checkout(payload).subscribe({
      next: () => {
        this.posSaving = false;
        this.posResetCart();
        this.loadVentes();
        this.loadArticles();
        this.loadClients();
      },
      error: (err) => {
        this.posSaving = false;
        alert(err.error?.message || 'Erreur lors de la vente.');
      }
    });
  }
}
