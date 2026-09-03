import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArticleService, ArticleForm } from '../../services/article.service';
import { TranslatePipe, TranslateDirective } from '@ngx-translate/core';

export type StockStatus = {
    label: string;
    cls: 'badge-ok' | 'badge-low' | 'badge-out';
};

export type ActiveTab = 'all' | 'part' | 'accessory';

const SUB_CATEGORIES = [
    { key: 'afficheur', label: 'Afficheur' },
    { key: 'glass', label: 'Glass' },
    { key: 'cache', label: 'Cache' },
    { key: 'battery', label: 'Battery' },
    { key: 'vitre', label: 'Vitre' },
    { key: 'accessories', label: 'Accessoires' },
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
    subCategories = SUB_CATEGORIES;

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

    constructor(private articleService: ArticleService) { }

    ngOnInit(): void {
        this.loadProducts();
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
        this.clearMessages();
    }

    openEditForm(product: ArticleForm): void {
        this.isEditing = true;
        this.editingId = product.id_article ?? null;
        this.form = { ...product };
        this.showForm = true;
        this.clearMessages();
    }

    cancelForm(): void {
        this.showForm = false;
        this.form = this.emptyForm();
        this.editingId = null;
        this.isEditing = false;
    }

    saveProduct(): void {
        if (!this.form.designation) {
            this.errorMsg = 'Le nom est obligatoire.';
            return;
        }
        this.clearMessages();

        if (this.isEditing && this.editingId !== null) {
            this.articleService.updateArticle(this.editingId, this.form as any).subscribe({
                next: () => {
                    this.successMsg = 'Produit mis à jour avec succès.';
                    this.cancelForm();
                    this.loadProducts();
                },
                error: () => { this.errorMsg = 'Erreur lors de la mise à jour.'; }
            });
        } else {
            this.articleService.createArticle(this.form).subscribe({
                next: () => {
                    this.successMsg = 'Produit ajouté avec succès.';
                    this.cancelForm();
                    this.loadProducts();
                },
                error: () => { this.errorMsg = 'Erreur lors de la création.'; }
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
