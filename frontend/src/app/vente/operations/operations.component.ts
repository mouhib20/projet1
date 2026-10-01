import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { VenteService } from '../../services/vente.service';
import { ClientService } from '../../services/client.service';
import { ArticleService, ArticleForm, articleImageUrl } from '../../services/article.service';
import { AuthService } from '../../services/auth.service';
import { PosBridgeService } from '../../services/pos-bridge.service';
import { Vente } from '../../models/vente.model';
import { Client } from '../../models/client.model';
import { CaisseComponent } from '../caisse/caisse.component';
import { OfflineDbService, OfflinePickupReparation } from '../../offline/offline-db.service';
import { ConnectivityService } from '../../offline/connectivity.service';
import { SyncService } from '../../offline/sync.service';
import { OfflineSessionService } from '../../offline/offline-session.service';

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

  // ── Offline mode: repair tickets ready for pickup, cached locally (works online AND offline) ──
  pickupReparations: OfflinePickupReparation[] = [];
  posPickupSearchTerm = '';

  constructor(
    private venteService: VenteService,
    private clientService: ClientService,
    private articleService: ArticleService,
    private posBridge: PosBridgeService,
    public auth: AuthService,
    private offlineDb: OfflineDbService,
    public connectivity: ConnectivityService,
    private syncService: SyncService,
    private offlineSession: OfflineSessionService,
    private translate: TranslateService,
  ) { }

  async ngOnInit(): Promise<void> {
    if (this.connectivity.isOnline()) {
      this.loadVentes();
      this.loadClients();
      this.loadArticles();
      await this.syncService.pullReferenceData();
    } else {
      // No live server round-trip possible: everything comes straight from the local cache.
      this.articles = await this.offlineDb.articles.toArray() as any;
      this.clients = await this.offlineDb.clients.toArray() as any;
    }
    this.pickupReparations = await this.offlineDb.reparationsPickup.toArray();
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
      next: (data) => { this.clients = data; this.offlineDb.clients.bulkPut(data as any).catch(() => undefined); },
      error: (err) => console.error(err)
    });
  }

  loadArticles() {
    this.articleService.getArticles().subscribe({
      next: (data) => {
        this.articles = data;
        this.offlineDb.articles.bulkPut(data as any).catch(() => undefined);
        this.consumePendingSaleArticle();
      },
      error: (err) => console.error(err)
    });
  }

  /** Picks up a specific article handed off from the Compatibility search page's "Add to sale"
   *  button, if any - resolved against the article list just loaded above since the handoff only
   *  carries an id, not the full ArticleForm. */
  private consumePendingSaleArticle(): void {
    const id = this.posBridge.consumePendingArticleIdForSale();
    if (!id) return;
    const article = this.articles.find(a => a.id_article === id);
    if (!article) return;
    this.posAddToCart(article);
    this.activeView = 'pos';
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

  /**
   * Profit of one sale line: price minus the cost. The cost is the article's purchase price, or,
   * for a repair line (no article), the cost of the parts kept on the line. Lines from before this
   * was recorded have no known cost: null, and they are left out of the totals.
   */
  beneficeVente(v: Vente): number | null {
    const cout = v.article ? v.article.prix_achat : v.cout;
    if (cout === null || cout === undefined) return null;
    return (v.qte || 1) * ((Number(v.prix) || 0) - (Number(cout) || 0));
  }

  beneficeListe(list: Vente[]): number {
    return list.reduce((s, v) => s + (this.beneficeVente(v) ?? 0), 0);
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
    if (!this.connectivity.isOnline()) {
      this.saveClientHorsLigne();
      return;
    }
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

  /** Queues the new client for sync - it only becomes selectable once it has actually synced
   *  (it is not added to `this.clients` here, to avoid mixing a not-yet-real id into the picker). */
  private async saveClientHorsLigne(): Promise<void> {
    if (!this.offlineSession.isOfflineCapable()) {
      this.savingClient = false;
      alert(this.translate.instant('OFFLINE.OFFLINE_SESSION_EXPIRED'));
      return;
    }
    await this.syncService.enqueueClientCreate({ nom: this.clientForm.nom!, telephone: this.clientForm.telephone });
    this.savingClient = false;
    this.closeClientModal();
    alert(this.translate.instant('OPERATIONS.OFFLINE_CLIENT_QUEUED'));
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
    // Every kind of article is searchable (parts, screens, batteries, filters, accessories, others),
    // by name, barcode, brand, model or category. Each typed word must match somewhere.
    const mots = this.posSearchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    return this.availableArticles.filter(a => {
      const texte = [
        a.designation, a.barcode, a.marque, a.modele, a.sous_categorie,
        a.type === 'accessory' ? 'accessoire accessoires' : 'pièce pièces piece pieces'
      ].map(s => String(s || '').toLowerCase()).join(' ');
      return mots.every(m => texte.includes(m));
    }).slice(0, 40);
  }

  /** Category of an article as a short label (Afficheur → Écran, Vitre, Batterie, Filtre, Cendre, Glace → Glass…). */
  categorieArticle(a: ArticleForm): string {
    const c = (a.sous_categorie || '').split('(')[0].trim();
    if (!c) return '';
    if (c.toLowerCase() === 'afficheur') return 'Écran';
    if (c.toLowerCase() === 'glace') return 'Glass';
    return c;
  }

  /** Rest of the product sheet on one line: brand, model, barcode and description. */
  specsArticle(a: ArticleForm): string {
    return [
      a.marque ? 'Marque : ' + a.marque : '',
      a.modele ? 'Modèle : ' + a.modele : '',
      a.barcode ? 'Code : ' + a.barcode : '',
      a.description || ''
    ].filter(Boolean).join(' · ');
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
      // No sale price set on the article: ask for one now instead of silently selling at 0 DT
      let prix = Number(article.prix_vente) || 0;
      if (prix <= 0) {
        const saisie = prompt(`Aucun prix de vente n'est enregistré pour "${article.designation}".\nPrix de vente pour cette vente :`);
        if (saisie === null) return;
        prix = Number(saisie.replace(',', '.'));
        if (!(prix > 0)) {
          alert('Prix invalide : la vente a été annulée.');
          return;
        }
      }
      this.posCart.push({
        articleId: article.id_article,
        designation: article.designation,
        image: article.image,
        qte: 1,
        prix,
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

  /** Repair tickets ready for pickup, searchable directly from the POS - reads the same local
   *  cache whether online or offline, so it works without depending on the separate Reparation
   *  page's cross-page "sell this" handoff (PosBridgeService) having been used first. */
  get posFilteredPickupReparations(): OfflinePickupReparation[] {
    if (!this.posPickupSearchTerm) return [];
    const term = this.posPickupSearchTerm.toLowerCase();
    const dejaAuPanier = new Set(this.posCart.map(i => i.reparationId).filter(Boolean));
    return this.pickupReparations
      .filter(r => !dejaAuPanier.has(r.id_reparation))
      .filter(r => (r.appareil || '').toLowerCase().includes(term) || (r.client_nom || '').toLowerCase().includes(term))
      .slice(0, 20);
  }

  posAddPickupToCart(rep: OfflinePickupReparation): void {
    this.posCart.push({
      reparationId: rep.id_reparation,
      designation: rep.appareil || this.translate.instant('OPERATIONS.PICKUP_DEFAULT_LABEL'),
      qte: 1,
      prix: Number(rep.prix) || 0,
      prix_achat: 0,
      maxStock: 1,
    });
    this.posPickupSearchTerm = '';
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
    this.posACredit = false;
    this.posMontantPaye = 0;
  }

  /** Sale partly or fully on credit: the client takes the goods now, pays the rest later. */
  posACredit = false;
  posMontantPaye: number | null = 0;

  get posMontantCredit(): number {
    if (!this.posACredit) return 0;
    return Math.max(0, this.posResteAPayer - (this.posMontantPaye || 0));
  }

  posResetCart(): void {
    this.posCart = [];
    this.posClientId = undefined;
    this.posRemiseAmount = 0;
    this.posRemiseType = 'fixed';
    this.posMontantSolde = 0;
    this.posACredit = false;
    this.posMontantPaye = 0;
    this.posSearchTerm = '';
  }

  posCheckout(): void {
    if (this.posSaving) return;
    if (this.posCart.length === 0) {
      alert('Le panier est vide.');
      return;
    }
    this.posSaving = true;

    if (this.posACredit && !this.posClientId) {
      alert('Choisissez un client pour vendre à crédit.');
      this.posSaving = false;
      return;
    }

    const payload = {
      clientId: this.posClientId || null,
      remise: this.posRemiseValue,
      montantSolde: this.posMontantSoldeEffectif,
      montantPaye: this.posACredit ? (this.posMontantPaye || 0) : undefined,
      items: this.posCart.map(i => ({
        articleId: i.articleId ?? null,
        reparationId: i.reparationId ?? null,
        designation: i.designation,
        qte: i.qte,
        prix: i.prix
      }))
    };

    if (!this.connectivity.isOnline()) {
      this.posCheckoutHorsLigne(payload);
      return;
    }

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

  /** No network call is made here at all - the sale is queued (outbox) and replayed once online
   *  (see SyncService). Stock/pickup-ticket removal is applied optimistically to the local cache
   *  right away so this same device doesn't oversell/double-hand-off before syncing; the server
   *  remains the final authority once the sale actually reaches it. */
  private async posCheckoutHorsLigne(payload: any): Promise<void> {
    if (!this.offlineSession.isOfflineCapable()) {
      this.posSaving = false;
      alert(this.translate.instant('OFFLINE.OFFLINE_SESSION_EXPIRED'));
      return;
    }
    for (const item of this.posCart) {
      if (!item.articleId) continue;
      const article = this.articles.find(a => a.id_article === item.articleId);
      if (article) article.quantite = (article.quantite ?? 0) - item.qte;
      await this.offlineDb.articles.where('id_article').equals(item.articleId).modify((a: any) => { a.quantite -= item.qte; });
    }
    for (const item of this.posCart) {
      if (!item.reparationId) continue;
      this.pickupReparations = this.pickupReparations.filter(r => r.id_reparation !== item.reparationId);
      await this.offlineDb.reparationsPickup.delete(item.reparationId);
    }

    const clientId = await this.syncService.enqueueCheckout(payload);
    this.posSaving = false;
    this.posResetCart();
    alert(this.translate.instant('OPERATIONS.OFFLINE_SALE_QUEUED', { ref: clientId.slice(0, 8) }));
  }
}
