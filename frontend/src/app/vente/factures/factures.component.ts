import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { FactureAchatService } from '../../services/facture-achat.service';
import { FournisseurService } from '../../services/fournisseur.service';
import { ArticleService, ArticleForm } from '../../services/article.service';
import { FactureAchat, FactureItem } from '../../models/facture-achat.model';
import { Fournisseur } from '../../models/fournisseur.model';

@Component({
  selector: 'app-factures',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './factures.component.html',
  styleUrls: ['./factures.component.css']
})
export class FacturesComponent implements OnInit {
  factures: FactureAchat[] = [];
  fournisseurs: Fournisseur[] = [];
  articles: ArticleForm[] = [];
  availableArticles: ArticleForm[] = [];

  isModalOpen = false;
  selectedFacture: FactureAchat | null = null;
  isDetailOpen = false;

  // New Workflow Buffer
  defaultSupplierTypes: string[] = [
    'Glass (الباغات والزجاج الخارجي)',
    'Cache (الأغطية الخلفية والإطارات)',
    'Accessoires (إكسسوارات)',
    'Pièce de rechange (قطع غيار)',
    'Autre (شيء آخر)'
  ];

  supplierTypes: string[] = [...this.defaultSupplierTypes];

  currentItem: Partial<FactureItem> = this.initCurrentItem();
  searchTerm: string = '';
  showSmartSearchResults: boolean = false;

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
    this.resetForm();
  }

  closeModal() {
    this.isModalOpen = false;
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
    this.searchTerm = '';
    this.supplierTypes = [...this.defaultSupplierTypes];
  }

  onFournisseurChange() {
    this.supplierTypes = [...this.defaultSupplierTypes];

    if (!this.formData.fournisseurId) {
      this.availableArticles = [];
      return;
    }
    const selectedFournisseur = this.fournisseurs.find(f => f.id_fournisseur == this.formData.fournisseurId);

    // Extract types if available, otherwise keep default
    if (selectedFournisseur && selectedFournisseur.type_articles) {
      const dynamicTypes = selectedFournisseur.type_articles.split(',').map(s => s.trim()).filter(Boolean);
      for (const dt of dynamicTypes) {
        // Only add if not already covered by default types (e.g., "Accessoires" inside "Accessoires (إكسسوارات)")
        const exists = this.supplierTypes.some(t => t.toLowerCase().includes(dt.toLowerCase()) || dt.toLowerCase().includes(t.toLowerCase()));
        if (!exists) {
          this.supplierTypes.unshift(dt); // add at the top
        }
      }
    }

    if (selectedFournisseur && (selectedFournisseur as any).articles) {
      this.availableArticles = (selectedFournisseur as any).articles;
    } else {
      this.availableArticles = [];
    }

    // Reset current item buffer when changing supplier
    this.currentItem = this.initCurrentItem();
    this.searchTerm = '';
  }

  // --- SMART SEARCH LOGIC ---
  get filteredSmartArticles() {
    if (!this.searchTerm || this.searchTerm.length < 2) return [];
    const term = this.searchTerm.toLowerCase();

    // Search in both available (supplier specific) and all articles (if looking for generic)
    // Preference to supplier articles
    let searchPool = this.availableArticles.length > 0 ? this.availableArticles : this.articles;

    return searchPool.filter(a =>
      (a.id_article && a.id_article.toString().includes(term)) ||
      (a.designation && a.designation.toLowerCase().includes(term)) ||
      (a.barcode && a.barcode.toLowerCase().includes(term)) ||
      (a.marque && a.marque.toLowerCase().includes(term)) ||
      (a.modele && a.modele.toLowerCase().includes(term))
    ).slice(0, 5); // Limit results
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
      qte: 1,
      prix: article.prix_achat || 0,
      prix_vente: article.prix_vente || 0,
      tva_rate: 19,
      total_ttc: 0
    };
    this.searchTerm = article.designation || '';
    this.showSmartSearchResults = false;
  }

  handleSearchEnter() {
    const results = this.filteredSmartArticles;
    // Auto-select if there's exactly one match (very common with barcode scanners)
    if (results.length === 1) {
      this.selectSmartArticle(results[0]);
    } else if (results.length > 0) {
      // If multiple, maybe just keep the dropdown open
      this.showSmartSearchResults = true;
    }
  }

  hideSmartSearch() {
    setTimeout(() => this.showSmartSearchResults = false, 200);
  }

  resetCurrentItem() {
    this.currentItem = this.initCurrentItem();
    this.searchTerm = '';
  }

  get currentItemDisplayType(): string {
    if (!this.currentItem.type) return 'Détails';
    return this.currentItem.type.split('(')[0].trim();
  }

  get isAutreType(): boolean {
    return this.currentItem.type ? this.currentItem.type.toLowerCase().includes('autre') : false;
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

    this.formData.items.push({ ...c } as FactureItem);
    this.calculateTotals();

    // Reset buffer
    this.currentItem = this.initCurrentItem();
    this.searchTerm = '';
  }

  removeItem(index: number) {
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
    if (!this.formData.fournisseurId || !this.formData.reference) {
      alert('Veuillez remplir le fournisseur et la référence.');
      return;
    }

    if (this.formData.items.length === 0) {
      alert('La facture est vide. Ajoutez au moins un élément.');
      return;
    }

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

        if (subCategory.toLowerCase().includes('accessoires')) {
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
          type: mappedType,
          sous_categorie: subCategory,
          tva_rate: item.tva_rate || 0
        };
      })
    };

    this.factureAchatService.createFacture(payload as any).subscribe({
      next: () => {
        this.loadFactures();
        this.loadArticles();
        this.loadFournisseurs();
        this.closeModal();
      },
      error: (err: any) => {
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
}
