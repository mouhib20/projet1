import { Component, OnInit, OnDestroy, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { FactureAchatService } from '../../services/facture-achat.service';
import { FournisseurService } from '../../services/fournisseur.service';
import { ArticleService, ArticleForm, articleImageUrl } from '../../services/article.service';
import { FactureAchat, FactureItem } from '../../models/facture-achat.model';
import { Fournisseur } from '../../models/fournisseur.model';

@Component({
  selector: 'app-factures',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './factures.component.html',
  styleUrls: ['./factures.component.css']
})
export class FacturesComponent implements OnInit, OnDestroy {
  factures: FactureAchat[] = [];
  fournisseurs: Fournisseur[] = [];
  articles: ArticleForm[] = [];
  availableArticles: ArticleForm[] = [];

  isModalOpen = false;
  savingFacture = false;
  selectedFacture: FactureAchat | null = null;
  isDetailOpen = false;

  // New Workflow Buffer
  defaultSupplierTypes: string[] = [
    'Afficheur (شاشة عرض)',
    'Batterie (بطارية)',
    'Vitre (زجاج/غطاء)',
    'Autre (شيء آخر)'
  ];

  supplierTypes: string[] = [...this.defaultSupplierTypes];

  // Supplier classifications are not real part types: expand them to the actual categories
  reparationPartTypes: string[] = [
    'Afficheur (شاشة عرض)',
    'Batterie (بطارية)',
    'Vitre (زجاج/غطاء)'
  ];

  accessoiresPartTypes: string[] = [
    'Cendre',
    'Glace'
  ];

  currentItem: Partial<FactureItem> = this.initCurrentItem();
  editingItemIndex: number | null = null;
  searchTerm: string = '';
  showSmartSearchResults: boolean = false;
  imageUploading = false;
  imageError = '';
  @ViewChild('searchInput') searchInput!: ElementRef;

  imageUrl(image?: string | null): string | null {
    return articleImageUrl(image);
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.imageError = '';
    this.imageUploading = true;
    this.articleService.uploadImage(file).subscribe({
      next: (res) => {
        this.currentItem.image = res.url;
        this.imageUploading = false;
      },
      error: (err) => {
        this.imageError = err.error?.message || 'Erreur lors du téléchargement de l\'image.';
        this.imageUploading = false;
      }
    });
    input.value = '';
  }

  removeImage(): void {
    this.currentItem.image = undefined;
  }

  // Quick Supplier
  isQuickAddSupplierModalOpen = false;
  newSupplierData = {
    nom: '',
    prenom: '',
    tel: '',
    entreprise: '',
    type_articles: ''
  };

  // Totals (computed)
  computed = {
    total_ht: 0,
    total_tva: 0,
    net_a_payer: 0,
    reste_a_payer: 0
  };

  formData: {
    reference: string;
    date_facture: string;
    fournisseurId: number | undefined;
    items: FactureItem[];
    remise: number;
    montant_paye: number;
  } = this.initForm();

  constructor(
    private factureAchatService: FactureAchatService,
    private fournisseurService: FournisseurService,
    private articleService: ArticleService
  ) { }

  ngOnInit(): void {
    this.brouillonExiste = !!this.lireBrouillon();
    this.loadFactures();
    this.loadFournisseurs();
    this.loadArticles();
  }

  initForm() {
    return {
      reference: '',
      date_facture: '',
      fournisseurId: undefined as number | undefined,
      items: [] as FactureItem[],
      remise: 0,
      montant_paye: 0
    };
  }

  initCurrentItem(): Partial<FactureItem> {
    return {
      articleId: null,
      isNew: true,
      type: '',
      designation: '',
      marque: '',
      modele: '',
      barcode: '',
      image: '',
      qte: 1,
      prix: 0,
      prix_vente: 0,
      tva_rate: 19,
      total_ttc: 0
    };
  }

  loadFactures() {
    this.factureAchatService.getFactures().subscribe({
      next: (data: FactureAchat[]) => this.factures = data,
      error: (err: any) => console.error(err)
    });
  }

  loadFournisseurs() {
    this.fournisseurService.getFournisseurs().subscribe({
      next: (data: Fournisseur[]) => this.fournisseurs = data,
      error: (err: any) => console.error(err)
    });
  }

  loadArticles() {
    this.articleService.getArticles().subscribe({
      next: (data: ArticleForm[]) => this.articles = data,
      error: (err: any) => console.error(err)
    });
  }

  openModal() {
    this.isModalOpen = true;
    this.savingFacture = false;
    const brouillon = this.lireBrouillon();
    if (brouillon) this.restaurerBrouillon(brouillon);
    else this.resetForm();
  }

  /** Leaving the form (cross, click outside, another page…) keeps what was typed as a draft. */
  closeModal() {
    this.sauvegarderBrouillon();
    this.isModalOpen = false;
  }

  // ── Draft: the invoice being typed is kept until it is saved or discarded ──

  brouillonExiste = false;
  /** Set while the form shows a restored draft (date it was kept). */
  brouillonDate: string | null = null;

  /** One draft per person, so somebody else on the same computer neither sees nor erases it. */
  private get cleBrouillon(): string {
    return 'gsmpro_facture_brouillon_' + this.utilisateurCourant();
  }

  private utilisateurCourant(): string {
    try { return localStorage.getItem('username') || ''; } catch { return ''; }
  }

  private brouillonRempli(): boolean {
    const f = this.formData;
    const c = this.currentItem;
    return !!(f.fournisseurId || f.items.length > 0 || c.designation || c.marque || c.modele || c.barcode || (c.prix || 0) > 0);
  }

  private lireBrouillon(): any | null {
    try {
      const s = localStorage.getItem(this.cleBrouillon);
      if (!s) return null;
      const b = JSON.parse(s);
      return b && b.formData ? b : null;
    } catch {
      return null;
    }
  }

  private sauvegarderBrouillon() {
    if (!this.isModalOpen) return;
    if (!this.brouillonRempli()) {
      this.supprimerBrouillon();
      return;
    }
    try {
      localStorage.setItem(this.cleBrouillon, JSON.stringify({
        date: new Date().toISOString(),
        utilisateur: this.utilisateurCourant(),
        formData: this.formData,
        currentItem: this.currentItem,
        searchTerm: this.searchTerm
      }));
      this.brouillonExiste = true;
    } catch {
      // storage unavailable: nothing is kept
    }
  }

  private supprimerBrouillon() {
    try { localStorage.removeItem(this.cleBrouillon); } catch { }
    this.brouillonExiste = false;
    this.brouillonDate = null;
  }

  private restaurerBrouillon(b: any) {
    this.resetForm();
    this.formData = { ...this.initForm(), ...b.formData, items: Array.isArray(b.formData.items) ? b.formData.items : [] };
    this.currentItem = { ...this.initCurrentItem(), ...(b.currentItem || {}) };
    this.searchTerm = b.searchTerm || '';
    this.editingItemIndex = null;
    // a supplier deleted since then cannot be selected any more
    if (this.formData.fournisseurId && this.fournisseurs.length > 0
      && !this.fournisseurs.some(f => f.id_fournisseur == this.formData.fournisseurId)) {
      this.formData.fournisseurId = undefined;
    }
    if (this.formData.fournisseurId) this.onFournisseurChange();
    this.calculateTotals();
    this.brouillonDate = b.date || null;
  }

  /** Throws the draft away and starts an empty invoice. */
  abandonnerBrouillon() {
    this.supprimerBrouillon();
    this.resetForm();
  }

  /** Closing the tab, refreshing or being logged out while typing also keeps the draft. */
  @HostListener('window:beforeunload')
  avantFermeture() {
    this.sauvegarderBrouillon();
  }

  ngOnDestroy(): void {
    this.sauvegarderBrouillon();
  }

  resetForm() {
    const now = new Date();
    this.formData = {
      reference: `FA-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      date_facture: now.toISOString().split('T')[0],
      fournisseurId: undefined,
      items: [],
      remise: 0,
      montant_paye: 0
    };
    this.computed = { total_ht: 0, total_tva: 0, net_a_payer: 0, reste_a_payer: 0 };
    this.availableArticles = [];
    this.currentItem = this.initCurrentItem();
    this.editingItemIndex = null;
    this.searchTerm = '';
    this.supplierTypes = [...this.defaultSupplierTypes];
  }

  onFournisseurChange() {
    if (!this.formData.fournisseurId) {
      this.supplierTypes = [...this.defaultSupplierTypes];
      this.availableArticles = [];
      return;
    }

    const selectedFournisseur = this.fournisseurs.find(f => f.id_fournisseur == this.formData.fournisseurId);

    // Override types with the supplier's specific types (not append)
    if (selectedFournisseur && selectedFournisseur.type_articles) {
      const rawTypes = selectedFournisseur.type_articles.split(',').map((s: string) => s.trim()).filter(Boolean);
      const dynamicTypes: string[] = [];
      for (const t of rawTypes) {
        if (t.toLowerCase().includes('réparation') || t.toLowerCase().includes('reparation')) {
          for (const rt of this.reparationPartTypes) {
            if (!dynamicTypes.includes(rt)) dynamicTypes.push(rt);
          }
        } else if (t.toLowerCase().includes('accessoire')) {
          for (const at of this.accessoiresPartTypes) {
            if (!dynamicTypes.includes(at)) dynamicTypes.push(at);
          }
        } else if (!dynamicTypes.includes(t)) {
          dynamicTypes.push(t);
        }
      }
      if (dynamicTypes.length > 0) {
        this.supplierTypes = [...dynamicTypes, 'Autre (شيء آخر)'];
      } else {
        this.supplierTypes = [...this.defaultSupplierTypes];
      }
    } else {
      this.supplierTypes = [...this.defaultSupplierTypes];
    }

    if (selectedFournisseur && (selectedFournisseur as any).articles) {
      this.availableArticles = (selectedFournisseur as any).articles;
    } else {
      this.availableArticles = [];
    }

    // Reset current item buffer
    this.currentItem = this.initCurrentItem();
    this.editingItemIndex = null;
    this.searchTerm = '';

    // Auto-select type if only one is available
    if (this.supplierTypes.length === 1 ||
      (this.supplierTypes.length === 2 && this.supplierTypes[1] === 'Autre (شيء آخر)')) {
      this.currentItem.type = this.supplierTypes[0];
    }

    // Auto-focus search input
    setTimeout(() => {
      if (this.searchInput) {
        this.searchInput.nativeElement.focus();
      }
    }, 150);
  }

  // --- SMART SEARCH LOGIC ---
  get filteredSmartArticles() {
    if (!this.currentItem.type) return [];
    if (!this.searchTerm || this.searchTerm.length < 2) return [];
    const term = this.searchTerm.toLowerCase();

    // Search in both available (supplier specific) and all articles (if looking for generic)
    // Preference to supplier articles
    let searchPool = this.availableArticles.length > 0 ? this.availableArticles : this.articles;

    // Scope results to the chosen part type
    searchPool = searchPool.filter(a => a.sous_categorie === this.currentItem.type);

    return searchPool.filter(a =>
      (a.id_article && a.id_article.toString().includes(term)) ||
      (a.designation && a.designation.toLowerCase().includes(term)) ||
      (a.barcode && a.barcode.toLowerCase().includes(term)) ||
      (a.marque && a.marque.toLowerCase().includes(term)) ||
      (a.modele && a.modele.toLowerCase().includes(term))
    ).slice(0, 5); // Limit results
  }

  onTypeChange() {
    // Changing the part type invalidates any in-progress search/selection
    this.searchTerm = '';
    if (this.currentItem.isNew === false) {
      this.currentItem = { ...this.initCurrentItem(), type: this.currentItem.type };
    }
    setTimeout(() => {
      if (this.searchInput) {
        this.searchInput.nativeElement.focus();
      }
    }, 100);
  }

  selectSmartArticle(article: ArticleForm) {
    this.currentItem = {
      articleId: article.id_article,
      isNew: false,
      type: article.type || '',
      designation: article.designation,
      marque: article.marque || '',
      modele: article.modele || '',
      barcode: article.barcode || '',
      image: article.image || '',
      qte: 1,
      prix: article.prix_achat || 0,
      prix_vente: article.prix_vente || 0,
      tva_rate: 19,
      total_ttc: 0
    };
    this.searchTerm = article.designation || '';
    this.showSmartSearchResults = false;
  }

  /**
   * Called on every keystroke in the search field.
   * If no article matches and the input looks like a barcode (3+ digits),
   * pre-fill the barcode field of the new-article form automatically.
   */
  onSearchInput() {
    if (!this.searchTerm) {
      // Reset when search is cleared
      if (this.currentItem.isNew) {
        this.currentItem.barcode = '';
        this.currentItem.designation = '';
      }
      return;
    }

    const results = this.filteredSmartArticles;
    if (results.length === 0 && this.currentItem.isNew) {
      const trimmed = this.searchTerm.trim();
      const isBarcode = /^\d{3,}$/.test(trimmed);
      if (isBarcode) {
        this.currentItem.barcode = trimmed;
        this.currentItem.designation = '';
      } else {
        this.currentItem.designation = trimmed;
        this.currentItem.barcode = '';
      }
    }

    // Keep search dropdown visible if there are results
    if (this.filteredSmartArticles.length > 0) {
      this.showSmartSearchResults = true;
    }
  }

  handleSearchEnter() {
    const results = this.filteredSmartArticles;
    // Auto-select if there's exactly one match (very common with barcode scanners)
    if (results.length === 1) {
      // Check if already in invoice
      const existing = this.formData.items.find(i => i.articleId === results[0].id_article);
      if (existing) {
        existing.qte = (existing.qte || 0) + 1;
        this.calculateTotals();
        this.resetCurrentItem();
      } else {
        this.selectSmartArticle(results[0]);
        this.addItemToInvoice();
      }
    } else if (results.length > 0) {
      // If multiple, maybe just keep the dropdown open
      this.showSmartSearchResults = true;
    } else if (this.searchTerm) {
      // 0 matches -> new article from scan/type
      const isBarcode = /^\d{3,}$/.test(this.searchTerm.trim());
      // If no matching article is found, treat the input as a barcode if it looks like one (3+ digits)
      // and pre‑fill the barcode field of the new‑article buffer.
      // This will automatically display the "new article" form with the barcode populated.
      if (isBarcode) {
        this.currentItem.barcode = this.searchTerm.trim();
      } else {
        this.currentItem.designation = this.searchTerm.trim();
      }
    }
  }

  hideSmartSearch() {
    setTimeout(() => this.showSmartSearchResults = false, 200);
  }

  resetCurrentItem() {
    const type = this.currentItem.type;
    this.currentItem = { ...this.initCurrentItem(), type };
    this.searchTerm = '';
  }

  get currentItemDisplayType(): string {
    if (!this.currentItem.type) return 'Détails';
    return this.currentItem.type.split('(')[0].trim();
  }

  get showNewArticleForm(): boolean {
    if (!this.currentItem.isNew) return false;
    if (this.searchTerm && this.filteredSmartArticles.length === 0) return true;
    if (this.currentItem.barcode || this.currentItem.designation) return true;
    return false;
  }

  // --- ITEM WORKFLOW ---
  addItemToInvoice() {
    // Validation
    const c = this.currentItem;
    if (c.isNew) {
      if (!c.type) {
        alert('Veuillez sélectionner le type de pièce.');
        return;
      }
      if (!c.marque || !c.modele) {
        if (!c.designation) {
          alert('Veuillez spécifier la Marque et le Modèle (ou directement la désignation).');
          return;
        }
      }
      if ((c.qte || 0) <= 0) {
        alert('Quantité invalide.');
        return;
      }
    } else {
      if (!c.articleId) {
        alert('Article non valide.');
        return;
      }
    }

    // Prepare line totals
    const q = c.qte || 1;
    const p = c.prix || 0;
    const tvaRate = c.tva_rate || 0;
    const ht = q * p;
    const tva = ht * (tvaRate / 100);
    c.total_ttc = ht + tva;

    // Default designation if new and missing
    if (c.isNew && !c.designation) {
      const typeStr = c.type?.split('(')[0].trim() || 'Pièce'; // Clean arabic part
      c.designation = `${typeStr} ${c.marque} ${c.modele}`.trim();
    }

    if (this.editingItemIndex !== null) {
      // Replace the line being edited in place
      this.formData.items[this.editingItemIndex] = { ...c } as FactureItem;
      this.editingItemIndex = null;
    } else {
      // Merge into an already-added identical line instead of creating a duplicate
      // (protects against a double-click on "Ajouter à la facture" adding the item twice,
      // and also lets scanning the same barcode again simply bump the quantity)
      const existing = this.formData.items.find(i =>
        c.isNew
          ? i.isNew && i.designation === c.designation && i.marque === c.marque &&
          i.modele === c.modele && (i.barcode || '') === (c.barcode || '')
          : !i.isNew && i.articleId === c.articleId
      );
      if (existing) {
        existing.qte = (existing.qte || 0) + q;
        const lineHt = existing.qte * p;
        existing.total_ttc = lineHt + lineHt * (tvaRate / 100);
      } else {
        this.formData.items.push({ ...c } as FactureItem);
      }
    }
    this.calculateTotals();

    // Reset buffer, keeping the chosen type so the next item can be added right away
    const type = c.type;
    this.currentItem = { ...this.initCurrentItem(), type };
    this.searchTerm = '';
  }

  editItem(index: number): void {
    const item = this.formData.items[index];
    this.editingItemIndex = index;
    this.currentItem = { ...item };
    this.searchTerm = item.designation || '';
  }

  cancelEditItem(): void {
    const type = this.currentItem.type;
    this.editingItemIndex = null;
    this.currentItem = { ...this.initCurrentItem(), type };
    this.searchTerm = '';
  }

  removeItem(index: number) {
    if (this.editingItemIndex === index) {
      this.cancelEditItem();
    }
    this.formData.items.splice(index, 1);
    this.calculateTotals();
  }

  calculateTotals() {
    let totalHt = 0;
    let totalTva = 0;

    for (const item of this.formData.items) {
      const lineHt = (item.qte || 0) * (item.prix || 0);
      const tvaRate = item.tva_rate || 0;
      const lineTva = lineHt * (tvaRate / 100);
      item.total_ttc = lineHt + lineTva;
      totalHt += lineHt;
      totalTva += lineTva;
    }

    const remise = this.formData.remise || 0;
    const netAPayer = Math.max(0, totalHt + totalTva - remise);
    const resteAPayer = Math.max(0, netAPayer - (this.formData.montant_paye || 0));

    this.computed = {
      total_ht: totalHt,
      total_tva: totalTva,
      net_a_payer: netAPayer,
      reste_a_payer: resteAPayer
    };
  }

  saveFacture() {
    if (this.savingFacture) return; // Avoid duplicate submissions on repeated clicks

    if (!this.formData.fournisseurId || !this.formData.reference) {
      alert('Veuillez remplir le fournisseur et la référence.');
      return;
    }

    if (this.formData.items.length === 0) {
      alert('La facture est vide. Ajoutez au moins un élément.');
      return;
    }

    this.savingFacture = true;

    const payload = {
      reference: this.formData.reference,
      date_facture: this.formData.date_facture,
      fournisseurId: this.formData.fournisseurId,
      total_ht: this.computed.total_ht,
      total_tva: this.computed.total_tva,
      remise: this.formData.remise || 0,
      net_a_payer: this.computed.net_a_payer,
      montant_paye: this.formData.montant_paye || 0,
      reste_a_payer: this.computed.reste_a_payer,
      items: this.formData.items.map(item => {
        let mappedType = 'part';
        let subCategory = item.type || '';

        if (this.accessoiresPartTypes.includes(subCategory) || subCategory.toLowerCase().includes('accessoires')) {
          mappedType = 'accessory';
        }

        // Limit sous_categorie length just in case
        if (subCategory.length > 90) {
          subCategory = subCategory.substring(0, 90);
        }

        return {
          articleId: item.isNew ? null : item.articleId,
          isNew: item.isNew,
          designation: item.designation,
          barcode: item.barcode,
          qte: item.qte,
          prix: item.prix,
          prix_vente: item.prix_vente,
          marque: item.marque,
          modele: item.modele,
          image: item.image || null,
          type: mappedType,
          sous_categorie: subCategory,
          tva_rate: item.tva_rate || 0
        };
      })
    };

    this.factureAchatService.createFacture(payload as any).subscribe({
      next: () => {
        this.savingFacture = false;
        this.loadFactures();
        this.loadArticles();
        this.loadFournisseurs();
        this.resetForm();
        this.supprimerBrouillon();
        this.closeModal();
      },
      error: (err: any) => {
        this.savingFacture = false;
        console.error(err);
        alert(err.message || 'Erreur lors de la création de la facture.');
      }
    });
  }

  openDetail(facture: FactureAchat) {
    this.selectedFacture = facture;
    this.isDetailOpen = true;
  }

  closeDetail() {
    this.isDetailOpen = false;
    this.selectedFacture = null;
  }

  // --- QUICK ADD SUPPLIER ---
  openQuickAddSupplierModal() {
    this.newSupplierData = { nom: '', prenom: '', tel: '', entreprise: '', type_articles: '' };
    this.isQuickAddSupplierModalOpen = true;
  }

  closeQuickAddSupplierModal() {
    this.isQuickAddSupplierModalOpen = false;
  }

  saveQuickAddSupplier() {
    if (!this.newSupplierData.nom) {
      alert('Erreur: Le nom du fournisseur est obligatoire.');
      return;
    }
    this.fournisseurService.createFournisseur(this.newSupplierData as any).subscribe({
      next: (res) => {
        // Refresh list
        this.fournisseurService.getFournisseurs().subscribe(data => {
          this.fournisseurs = data;
          // Auto-select new supplier
          const newId = res.id_fournisseur || (data.length ? data[data.length - 1].id_fournisseur : undefined);
          if (newId) {
            this.formData.fournisseurId = newId;
            this.onFournisseurChange();
          }
          this.closeQuickAddSupplierModal();
        });
      },
      error: (err) => {
        console.error(err);
        alert('Erreur: ' + (err.error?.message || 'Erreur lors de la création du fournisseur'));
      }
    });
  }
}
