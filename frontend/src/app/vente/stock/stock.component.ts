import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArticleService, ArticleForm, articleImageUrl } from '../../services/article.service';
import { ClientService } from '../../services/client.service';
import { TranslatePipe, TranslateDirective } from '@ngx-translate/core';

export type StockStatus = {
    label: string;
    cls: 'badge-ok' | 'badge-low' | 'badge-out';
};

export type ActiveTab = 'all' | 'part' | 'accessory' | 'retours' | 'sav';

const PART_SUB_CATEGORIES = [
    { key: 'Afficheur', label: 'Afficheur' },
    { key: 'Batterie', label: 'Batterie' },
    { key: 'Vitre', label: 'Vitre' },
    { key: 'Filtre', label: 'Filtre' },
    { key: 'Autre', label: 'Autre' },
];

const ACCESSORY_SUB_CATEGORIES = [
    { key: 'Cendre', label: 'Cendre' },
    { key: 'Glace', label: 'Glace' },
];

@Component({
    selector: 'app-stock',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe, TranslateDirective],
    templateUrl: './stock.component.html',
    styleUrl: './stock.component.css'
})
export class StockComponent implements OnInit {

    // ── Data ──────────────────────────────────────────────────
    products: ArticleForm[] = [];
    filteredProducts: ArticleForm[] = [];

    get subCategories() {
        return this.form.type === 'accessory' ? ACCESSORY_SUB_CATEGORIES : PART_SUB_CATEGORIES;
    }

    onFormTypeChange(): void {
        // The previously selected sub-category may not belong to the new type
        this.form.sous_categorie = '';
    }

    // ── State ─────────────────────────────────────────────────
    loading = false;
    errorMsg = '';
    successMsg = '';
    searchTerm = '';
    activeTab: ActiveTab = 'all';

    // ── Form ──────────────────────────────────────────────────
    showForm = false;
    isEditing = false;
    editingId: number | null = null;
    form: Partial<ArticleForm> = this.emptyForm();
    imageUploading = false;
    imageError = '';
    saving = false;

    imageUrl(image?: string | null): string | null {
        return articleImageUrl(image);
    }

    constructor(private articleService: ArticleService, private clientService: ClientService) { }

    ngOnInit(): void {
        this.loadProducts();
        this.loadRetours();
        this.loadSav();
        this.clientService.getClients().subscribe(c => this.clients = c);
    }

    // ── Helpers ───────────────────────────────────────────────

    emptyForm(): Partial<ArticleForm> {
        return {
            designation: '',
            barcode: '',
            marque: '',
            modele: '',
            quantite: 0,
            prix_achat: 0,
            prix_vente: 0,
            type: 'part',
            sous_categorie: '',
            qte_min: 3,
            description: ''
        };
    }

    getStockStatus(item: ArticleForm): StockStatus {
        const qty = item.quantite ?? 0;
        const min = item.qte_min ?? 3;
        if (qty <= 0) return { label: 'منتهي', cls: 'badge-out' };
        if (qty <= min) return { label: 'شارف على النفاد', cls: 'badge-low' };
        return { label: 'متوفر', cls: 'badge-ok' };
    }

    // ── Load ──────────────────────────────────────────────────

    loadProducts(): void {
        this.loading = true;
        this.errorMsg = '';
        this.articleService.getArticles().subscribe({
            next: (data) => {
                this.products = data;
                this.applyFilters();
                this.loading = false;
            },
            error: () => {
                this.errorMsg = 'Impossible de charger les produits. Vérifiez que le backend est démarré.';
                this.loading = false;
            }
        });
    }

    // ── Filter / Search ───────────────────────────────────────

    setTab(tab: ActiveTab): void {
        this.activeTab = tab;
        this.applyFilters();
        if (tab === 'retours') this.loadRetours();
        if (tab === 'sav') this.loadSav();
    }

    // ── SAV client: defective accessories brought back by clients ──

    clients: { id_client?: number; nom: string; telephone?: string }[] = [];
    savList: any[] = [];
    savFormOpen = false;
    savForm = { id_article: null as number | null, id_client: null as number | null, qte: 1, degre_dommage: '', probleme: '' };
    savEnCours = false;
    /** SAV entry currently being replaced from stock, and the chosen replacement. */
    savRemplacer: any = null;
    savRemplacementId: number | null = null;

    get savPending(): number {
        return this.savList.filter(s => s.statut === 'En attente').length;
    }

    /** Any accessory can be brought back, even one that is now out of stock. */
    get accessoires(): ArticleForm[] {
        return this.products.filter(p => p.type === 'accessory');
    }

    get accessoiresEnStock(): ArticleForm[] {
        return this.accessoires.filter(p => (p.quantite ?? 0) > 0);
    }

    loadSav(): void {
        this.articleService.getSav().subscribe({
            next: (data) => { this.savList = data; },
            error: () => { this.errorMsg = 'Impossible de charger le SAV.'; }
        });
    }

    ouvrirSav(): void {
        this.clearMessages();
        this.savForm = { id_article: null, id_client: null, qte: 1, degre_dommage: '', probleme: '' };
        this.savFormOpen = true;
    }

    fermerSav(): void {
        this.savFormOpen = false;
    }

    confirmerSav(): void {
        if (this.savEnCours) return;
        this.clearMessages();
        const f = this.savForm;
        if (!f.id_article) { this.errorMsg = "Choisissez l'accessoire défectueux."; return; }
        if (!f.degre_dommage) { this.errorMsg = 'Indiquez le degré de dommage.'; return; }
        if (!f.probleme.trim()) { this.errorMsg = 'Décrivez le problème.'; return; }
        if (!f.qte || f.qte < 1) { this.errorMsg = 'Quantité invalide.'; return; }
        this.savEnCours = true;
        this.articleService.creerSav({
            id_article: f.id_article,
            id_client: f.id_client || undefined,
            qte: f.qte,
            probleme: f.probleme.trim(),
            degre_dommage: f.degre_dommage
        }).subscribe({
            next: () => {
                this.savEnCours = false;
                this.savFormOpen = false;
                this.successMsg = 'Accessoire défectueux enregistré au service après-vente.';
                this.loadSav();
            },
            error: (err) => {
                this.savEnCours = false;
                this.errorMsg = err.error?.message || "Erreur lors de l'enregistrement du SAV.";
            }
        });
    }

    ouvrirRemplacementSav(s: any): void {
        this.clearMessages();
        this.savRemplacer = s;
        this.savRemplacementId = null;
    }

    fermerRemplacementSav(): void {
        this.savRemplacer = null;
    }

    confirmerRemplacementSav(): void {
        const s = this.savRemplacer;
        if (!s || this.savEnCours) return;
        this.clearMessages();
        if (!this.savRemplacementId) { this.errorMsg = "Choisissez l'accessoire de remplacement en stock."; return; }
        this.savEnCours = true;
        this.articleService.remplacerSav(s.id, this.savRemplacementId).subscribe({
            next: (res) => {
                this.savEnCours = false;
                this.savRemplacer = null;
                this.successMsg = `Remplacé par « ${res.remplacement} » (stock diminué de ${s.qte}).`;
                this.loadProducts();
                this.loadSav();
            },
            error: (err) => {
                this.savEnCours = false;
                this.errorMsg = err.error?.message || 'Erreur lors du remplacement.';
            }
        });
    }

    // ── Retours: accessories sent back to their supplier ──────

    retoursAccessoires: any[] = [];
    renvoiPiece: ArticleForm | null = null;
    renvoiProbleme = '';
    renvoiQte = 1;
    renvoiEnCours = false;

    loadRetours(): void {
        this.articleService.getRetoursFournisseur().subscribe({
            next: (data) => { this.retoursAccessoires = data.filter(r => r.type === 'accessory'); },
            error: () => { this.errorMsg = 'Impossible de charger les retours.'; }
        });
    }

    nomFournisseur(f: any): string {
        return (f?.entreprise || `${f?.nom || ''} ${f?.prenom || ''}`.trim()) + (f?.type_articles ? ` · ${f.type_articles}` : '');
    }

    ouvrirRenvoi(product: ArticleForm): void {
        this.clearMessages();
        this.renvoiPiece = product;
        this.renvoiProbleme = '';
        this.renvoiQte = 1;
    }

    fermerRenvoi(): void {
        this.renvoiPiece = null;
    }

    confirmerRenvoi(): void {
        const product = this.renvoiPiece;
        if (!product?.id_article || this.renvoiEnCours) return;
        this.clearMessages();
        if (!this.renvoiProbleme.trim()) {
            this.errorMsg = "Décrivez le problème de l'article.";
            return;
        }
        if (!this.renvoiQte || this.renvoiQte < 1 || this.renvoiQte > (product.quantite ?? 0)) {
            this.errorMsg = `Quantité invalide (1 à ${product.quantite ?? 0}).`;
            return;
        }
        this.renvoiEnCours = true;
        this.articleService.renvoyerAuFournisseur(product.id_article, {
            probleme: this.renvoiProbleme.trim(),
            qte: this.renvoiQte
        }).subscribe({
            next: (res) => {
                this.renvoiEnCours = false;
                this.renvoiPiece = null;
                this.successMsg = res.fournisseur
                    ? `« ${product.designation} » renvoyé au fournisseur « ${res.fournisseur} ».`
                    : `« ${product.designation} » retiré du stock (aucun fournisseur lié).`;
                this.loadProducts();
                this.loadRetours();
            },
            error: (err) => {
                this.renvoiEnCours = false;
                this.errorMsg = err.error?.message || "Erreur lors du renvoi de l'article.";
            }
        });
    }

    applyFilters(): void {
        const term = this.searchTerm.toLowerCase().trim();
        this.filteredProducts = this.products.filter(p => {
            // Tab filter
            if (this.activeTab !== 'all' && p.type !== this.activeTab) return false;
            // Search filter
            if (!term) return true;
            return (
                (p.designation || '').toLowerCase().includes(term) ||
                (p.barcode || '').toLowerCase().includes(term) ||
                (p.marque || '').toLowerCase().includes(term) ||
                (p.modele || '').toLowerCase().includes(term)
            );
        });
    }

    // ── Form actions ──────────────────────────────────────────

    openAddForm(): void {
        this.isEditing = false;
        this.editingId = null;
        this.form = this.emptyForm();
        this.showForm = true;
        this.saving = false;
        this.clearMessages();
    }

    openEditForm(product: ArticleForm): void {
        this.isEditing = true;
        this.editingId = product.id_article ?? null;
        this.form = { ...product };
        this.showForm = true;
        this.saving = false;
        this.clearMessages();
    }

    onImageSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        this.imageError = '';
        this.imageUploading = true;
        this.articleService.uploadImage(file).subscribe({
            next: (res) => {
                this.form.image = res.url;
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
        this.form.image = undefined;
    }

    cancelForm(): void {
        this.showForm = false;
        this.form = this.emptyForm();
        this.editingId = null;
        this.isEditing = false;
    }

    saveProduct(): void {
        if (this.saving) return; // Avoid duplicate submissions on repeated clicks
        if (!this.form.designation) {
            this.errorMsg = 'Le nom est obligatoire.';
            return;
        }
        this.clearMessages();
        this.saving = true;

        if (this.isEditing && this.editingId !== null) {
            this.articleService.updateArticle(this.editingId, this.form as any).subscribe({
                next: () => {
                    this.successMsg = 'Produit mis à jour avec succès.';
                    this.saving = false;
                    this.cancelForm();
                    this.loadProducts();
                },
                error: () => { this.errorMsg = 'Erreur lors de la mise à jour.'; this.saving = false; }
            });
        } else {
            this.articleService.createArticle(this.form).subscribe({
                next: () => {
                    this.successMsg = 'Produit ajouté avec succès.';
                    this.saving = false;
                    this.cancelForm();
                    this.loadProducts();
                },
                error: () => { this.errorMsg = 'Erreur lors de la création.'; this.saving = false; }
            });
        }
    }

    deleteProduct(id: number | undefined, name: string): void {
        if (!id) return;
        if (!confirm(`Supprimer « ${name} » ?`)) return;
        this.articleService.deleteArticle(id).subscribe({
            next: () => {
                this.successMsg = `« ${name} » supprimé.`;
                this.loadProducts();
            },
            error: () => { this.errorMsg = 'Erreur lors de la suppression.'; }
        });
    }

    clearMessages(): void {
        this.errorMsg = '';
        this.successMsg = '';
    }
}
