import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArticleService, ArticleForm, articleImageUrl } from '../../services/article.service';
import { ClientService } from '../../services/client.service';
import { AuthService } from '../../services/auth.service';
import { CompatService } from '../../services/compat.service';
import { PartType, Brand, DeviceModel } from '../../models/compat.model';
import { OfflineDbService } from '../../offline/offline-db.service';
import { ConnectivityService } from '../../offline/connectivity.service';
import { TranslatePipe, TranslateDirective, TranslateService } from '@ngx-translate/core';

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
    { key: 'Glace', label: 'Glass' }, // stored value stays 'Glace' - only the shown label changed
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

    // ── Compat link (optional): connects this article to an already-registered compatible part,
    // so it shows as "stocked" on the Compatibility search page. No store-facing UI for it at all
    // (by explicit request) - every role that can reach this page is store-scoped and must never
    // see the shared catalogue's internals here. Linking still happens fully automatically via the
    // backend self-heal (autoLierArticlesOrphelins) whenever the Compatibility search page is used,
    // this flag just permanently disables the manual UI below. ──
    get canLinkCompat(): boolean {
        return false;
    }
    linkPartTypes: PartType[] = [];
    linkBrands: Brand[] = [];
    linkModels: DeviceModel[] = [];
    linkPartTypeId: number | null = null;
    linkBrandId: number | null = null;
    linkBrandSearchTerm = '';
    showLinkBrandDropdown = false;
    linkModelSearchTerm = '';
    showLinkModelDropdown = false;
    linkResolving = false;
    linkNotFound = false;
    linkAutoFailed = false;
    linkAutoFailReason: 'type' | 'marque' | 'modele' | 'groupe' | null = null;
    linkPickerOpen = false;
    linkedGroupInfo: { partTypeName: string; models: DeviceModel[] } | null = null;

    /** Best-effort auto-link using the form's own Type/Marque/Modèle text - never overrides an
     *  existing link, and never runs until all three fields are filled. Falls back silently to
     *  the manual picker (linkAutoFailed) when the text doesn't match the compat catalogue -
     *  linkAutoFailReason says exactly which step failed, so the message isn't a guess. */
    tryAutoLinkCompat(): void {
        if (!this.canLinkCompat || this.form.compat_group_id) return;
        const marque = (this.form.marque || '').trim();
        const modele = (this.form.modele || '').trim();
        const sousCategorie = (this.form.sous_categorie || '').trim();
        if (!marque || !modele || !sousCategorie) return;

        const terms = [...new Set([sousCategorie, this.categoryLabel(sousCategorie)])];
        this.linkResolving = true;
        this.compatService.autoResolveGroup(terms, marque, modele).subscribe({
            next: (res) => {
                this.linkResolving = false;
                if ('id_group' in res) {
                    this.form.compat_group_id = res.id_group;
                    this.linkAutoFailed = false;
                    this.linkAutoFailReason = null;
                    this.loadLinkedGroupSummary(res.id_group);
                } else {
                    this.linkAutoFailed = true;
                    this.linkAutoFailReason = res.raison;
                }
            },
            error: () => { this.linkResolving = false; this.linkAutoFailed = true; this.linkAutoFailReason = null; }
        });
    }

    get filteredLinkBrands(): Brand[] {
        if (!this.linkBrandSearchTerm.trim()) return this.linkBrands;
        const t = this.linkBrandSearchTerm.toLowerCase();
        return this.linkBrands.filter(b => b.nom.toLowerCase().includes(t));
    }

    get filteredLinkModels(): DeviceModel[] {
        if (!this.linkModelSearchTerm.trim()) return this.linkModels;
        const t = this.linkModelSearchTerm.toLowerCase();
        return this.linkModels.filter(m => m.nom.toLowerCase().includes(t) || (m.code || '').toLowerCase().includes(t));
    }

    partTypeName(pt: { nom_fr: string; nom_en: string; nom_ar: string }): string {
        const lang = this.translate.currentLang();
        if (lang === 'en') return pt.nom_en;
        if (lang === 'ar') return pt.nom_ar;
        return pt.nom_fr;
    }

    openLinkPicker(): void {
        if (!this.linkPartTypes.length) this.compatService.getPartTypesForSearch().subscribe(list => this.linkPartTypes = list);
        if (!this.linkBrands.length) this.compatService.getBrandsForSearch().subscribe(list => this.linkBrands = list);
        this.linkNotFound = false;
        this.linkPickerOpen = true;
    }

    selectLinkBrand(b: Brand): void {
        this.linkBrandId = b.id;
        this.linkBrandSearchTerm = b.nom;
        this.showLinkBrandDropdown = false;
        this.linkModelSearchTerm = '';
        this.linkModels = [];
        this.compatService.getModelsForSearch(b.id).subscribe(list => this.linkModels = list);
    }

    closeLinkBrandDropdown(): void {
        setTimeout(() => this.showLinkBrandDropdown = false, 200);
    }

    closeLinkModelDropdown(): void {
        setTimeout(() => this.showLinkModelDropdown = false, 200);
    }

    selectLinkModel(m: DeviceModel): void {
        this.linkModelSearchTerm = `${m.marque} ${m.nom}`;
        this.showLinkModelDropdown = false;
        if (!this.linkPartTypeId) return;
        this.linkResolving = true;
        this.linkNotFound = false;
        this.compatService.resolveGroup(m.id, this.linkPartTypeId).subscribe({
            next: (res) => {
                this.linkResolving = false;
                if (res) {
                    this.form.compat_group_id = res.id_group;
                    this.loadLinkedGroupSummary(res.id_group);
                    this.linkPickerOpen = false;
                } else {
                    this.linkNotFound = true;
                }
            },
            error: () => { this.linkResolving = false; this.linkNotFound = true; }
        });
    }

    linkAutoFailMessageKey(): string {
        const key = this.linkAutoFailReason ? this.linkAutoFailReason.toUpperCase() : 'GENERIC';
        return `STOCK.COMPAT_LINK_AUTO_FAILED_${key}`;
    }

    linkAutoFailParams(): { type: string; marque: string; modele: string } {
        return {
            type: this.categoryLabel(this.form.sous_categorie) || this.form.sous_categorie || '',
            marque: this.form.marque || '',
            modele: this.form.modele || ''
        };
    }

    linkedModelsSummary(): string {
        if (!this.linkedGroupInfo?.models.length) return '';
        return this.linkedGroupInfo.models.map(m => `${m.marque} ${m.nom}`).join(', ');
    }

    private loadLinkedGroupSummary(idGroup: number): void {
        this.compatService.getGroupInfoForSearch(idGroup).subscribe(info => {
            if (!info) { this.linkedGroupInfo = null; return; }
            this.compatService.getModelsForGroup(idGroup).subscribe(models => {
                this.linkedGroupInfo = { partTypeName: this.partTypeName(info), models };
            });
        });
    }

    changeCompatLink(): void {
        this.openLinkPicker();
    }

    unlinkCompatGroup(): void {
        this.form.compat_group_id = null;
        this.linkedGroupInfo = null;
        this.resetLinkPickerState();
    }

    private resetLinkPickerState(): void {
        this.linkPartTypeId = null;
        this.linkBrandId = null;
        this.linkBrandSearchTerm = '';
        this.linkModelSearchTerm = '';
        this.linkModels = [];
        this.linkNotFound = false;
        this.linkAutoFailed = false;
        this.linkAutoFailReason = null;
        this.linkPickerOpen = false;
    }

    /** Display-only label for a stored sous_categorie value (e.g. 'Glace' -> "Glass") - the stored
     *  value itself never changes, so existing articles keep matching correctly. */
    categoryLabel(raw?: string | null): string {
        if (!raw) return '';
        const match = [...PART_SUB_CATEGORIES, ...ACCESSORY_SUB_CATEGORIES].find(c => c.key === raw);
        return match?.label ?? raw;
    }

    imageUrl(image?: string | null): string | null {
        return articleImageUrl(image);
    }

    constructor(
        private articleService: ArticleService,
        private clientService: ClientService,
        private translate: TranslateService,
        public auth: AuthService,
        private compatService: CompatService,
        private offlineDb: OfflineDbService,
        public connectivity: ConnectivityService,
    ) { }

    ngOnInit(): void {
        if (this.auth.hasPermission('stock', 'voir')) {
            this.loadProducts();
            // Only the read path works offline - these secondary tabs need a live server anyway.
            if (this.connectivity.isOnline()) {
                this.loadRetours();
                this.loadSav();
                this.clientService.getClients().subscribe(c => this.clients = c);
            }
        }
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
            description: '',
            compat_group_id: null
        };
    }

    getStockStatus(item: ArticleForm): StockStatus {
        const qty = item.quantite ?? 0;
        const min = item.qte_min ?? 3;
        if (qty <= 0) return { label: 'DASHBOARD.STATUS_OUT', cls: 'badge-out' };
        if (qty <= min) return { label: 'DASHBOARD.STATUS_LOW', cls: 'badge-low' };
        return { label: 'DASHBOARD.STATUS_OK', cls: 'badge-ok' };
    }

    // ── Load ──────────────────────────────────────────────────

    loadProducts(): void {
        this.errorMsg = '';
        if (!this.connectivity.isOnline()) {
            // Offline: serve the local cache (kept fresh by every prior live load and by SyncService).
            this.offlineDb.articles.toArray().then((rows) => {
                this.products = rows as any;
                this.applyFilters();
            });
            return;
        }
        this.loading = true;
        this.articleService.getArticles().subscribe({
            next: (data) => {
                this.products = data;
                this.applyFilters();
                this.loading = false;
                this.offlineDb.articles.bulkPut(data as any);
            },
            error: () => {
                this.errorMsg = 'STOCK.ERR_LOAD_PRODUCTS';
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
            error: () => { this.errorMsg = 'STOCK.ERR_LOAD_SAV'; }
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
        if (!f.id_article) { this.errorMsg = 'STOCK.ERR_CHOOSE_DEFECTIVE'; return; }
        if (!f.degre_dommage) { this.errorMsg = 'STOCK.ERR_DAMAGE_LEVEL'; return; }
        if (!f.probleme.trim()) { this.errorMsg = 'STOCK.ERR_DESCRIBE_PROBLEM'; return; }
        if (!f.qte || f.qte < 1) { this.errorMsg = 'STOCK.ERR_INVALID_QTY'; return; }
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
                this.successMsg = 'STOCK.SUCCESS_SAV_SAVED';
                this.loadSav();
            },
            error: (err) => {
                this.savEnCours = false;
                this.errorMsg = err.error?.message || 'STOCK.ERR_SAV_SAVE';
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
        if (!this.savRemplacementId) { this.errorMsg = 'STOCK.ERR_CHOOSE_REPLACEMENT'; return; }
        this.savEnCours = true;
        this.articleService.remplacerSav(s.id, this.savRemplacementId).subscribe({
            next: (res) => {
                this.savEnCours = false;
                this.savRemplacer = null;
                this.successMsg = this.translate.instant('STOCK.SUCCESS_REPLACED', { name: res.remplacement, qty: s.qte });
                this.loadProducts();
                this.loadSav();
            },
            error: (err) => {
                this.savEnCours = false;
                this.errorMsg = err.error?.message || 'STOCK.ERR_REPLACEMENT';
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
            error: () => { this.errorMsg = 'STOCK.ERR_LOAD_RETURNS'; }
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
            this.errorMsg = 'STOCK.ERR_DESCRIBE_ARTICLE_PROBLEM';
            return;
        }
        if (!this.renvoiQte || this.renvoiQte < 1 || this.renvoiQte > (product.quantite ?? 0)) {
            this.errorMsg = this.translate.instant('STOCK.ERR_INVALID_QTY_RANGE', { max: product.quantite ?? 0 });
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
                    ? this.translate.instant('STOCK.SUCCESS_RETURNED_TO_SUPPLIER', { name: product.designation, supplier: res.fournisseur })
                    : this.translate.instant('STOCK.SUCCESS_REMOVED_NO_SUPPLIER', { name: product.designation });
                this.loadProducts();
                this.loadRetours();
            },
            error: (err) => {
                this.renvoiEnCours = false;
                this.errorMsg = err.error?.message || 'STOCK.ERR_RETURN_ARTICLE';
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
        this.linkedGroupInfo = null;
        this.resetLinkPickerState();
        this.clearMessages();
    }

    openEditForm(product: ArticleForm): void {
        this.isEditing = true;
        this.editingId = product.id_article ?? null;
        this.form = { ...product };
        this.showForm = true;
        this.saving = false;
        this.linkedGroupInfo = null;
        this.resetLinkPickerState();
        if (product.compat_group_id) this.loadLinkedGroupSummary(product.compat_group_id);
        else this.tryAutoLinkCompat();
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
                this.imageError = err.error?.message || 'STOCK.ERR_IMAGE_UPLOAD';
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
        this.linkedGroupInfo = null;
        this.resetLinkPickerState();
    }

    saveProduct(): void {
        if (this.saving) return; // Avoid duplicate submissions on repeated clicks
        if (!this.form.designation) {
            this.errorMsg = 'STOCK.ERR_NAME_REQUIRED';
            return;
        }
        this.clearMessages();
        this.saving = true;

        // One last best-effort auto-link attempt right before persisting, using whatever is in
        // the fields now - covers the case where the user typed fast and hit Save before a field
        // blur/change ever fired tryAutoLinkCompat().
        const marque = (this.form.marque || '').trim();
        const modele = (this.form.modele || '').trim();
        const sousCategorie = (this.form.sous_categorie || '').trim();
        if (this.canLinkCompat && !this.form.compat_group_id && marque && modele && sousCategorie) {
            const terms = [...new Set([sousCategorie, this.categoryLabel(sousCategorie)])];
            this.compatService.autoResolveGroup(terms, marque, modele).subscribe({
                next: (res) => {
                    if ('id_group' in res) this.form.compat_group_id = res.id_group;
                    this.persistProduct();
                },
                error: () => this.persistProduct()
            });
        } else {
            this.persistProduct();
        }
    }

    private persistProduct(): void {
        if (this.isEditing && this.editingId !== null) {
            this.articleService.updateArticle(this.editingId, this.form as any).subscribe({
                next: () => {
                    this.successMsg = 'STOCK.SUCCESS_UPDATE';
                    this.saving = false;
                    this.cancelForm();
                    this.loadProducts();
                },
                error: () => { this.errorMsg = 'STOCK.ERR_UPDATE'; this.saving = false; }
            });
        } else {
            this.articleService.createArticle(this.form).subscribe({
                next: () => {
                    this.successMsg = 'STOCK.SUCCESS_CREATE';
                    this.saving = false;
                    this.cancelForm();
                    this.loadProducts();
                },
                error: () => { this.errorMsg = 'STOCK.ERR_CREATE'; this.saving = false; }
            });
        }
    }

    deleteProduct(id: number | undefined, name: string): void {
        if (!id) return;
        if (!confirm(this.translate.instant('STOCK.CONFIRM_DELETE', { name }))) return;
        this.articleService.deleteArticle(id).subscribe({
            next: () => {
                this.successMsg = this.translate.instant('STOCK.SUCCESS_DELETE', { name });
                this.loadProducts();
            },
            error: () => { this.errorMsg = 'STOCK.ERR_DELETE'; }
        });
    }

    clearMessages(): void {
        this.errorMsg = '';
        this.successMsg = '';
    }
}
