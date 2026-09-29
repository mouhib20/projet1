import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { WholesaleService } from '../../../services/wholesale.service';
import { ArticleService, ArticleForm, articleImageUrl } from '../../../services/article.service';
import { WholesaleListing, WholesaleOrder } from '../../../models/wholesale.model';

@Component({
    selector: 'app-wholesale-admin',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './wholesale-admin.component.html',
    styleUrls: ['./wholesale-admin.component.css']
})
export class WholesaleAdminComponent implements OnInit {
    tab: 'orders' | 'listings' = 'orders';

    // Orders
    ordersLoading = false;
    orders: WholesaleOrder[] = [];
    ordersError = '';
    busyOrderId: number | null = null;
    /** id_ligne -> qte_confirmee, edited inline before confirming an en_attente order. */
    confirmDrafts: Record<number, Record<number, number>> = {};

    // Listings
    listingsLoading = false;
    listings: WholesaleListing[] = [];
    listingsError = '';
    myArticles: ArticleForm[] = [];
    newListing = { id_article: null as number | null, prix_gros: null as number | null, qte_min: 1 };
    creatingListing = false;
    createListingError = '';

    constructor(private wholesaleService: WholesaleService, private articleService: ArticleService) { }

    ngOnInit(): void {
        this.loadOrders();
        this.loadListings();
        this.articleService.getArticles().subscribe({ next: (data) => { this.myArticles = data; } });
    }

    imageUrl(image?: string | null): string | null {
        return articleImageUrl(image);
    }

    // ── Orders ──

    loadOrders(): void {
        this.ordersLoading = true;
        this.ordersError = '';
        this.wholesaleService.getOrders().subscribe({
            next: (data) => {
                this.orders = data;
                for (const o of data) {
                    if (o.statut === 'en_attente' && !this.confirmDrafts[o.id]) {
                        const draft: Record<number, number> = {};
                        for (const l of o.lignes) draft[l.id] = l.qte_demandee;
                        this.confirmDrafts[o.id] = draft;
                    }
                }
                this.ordersLoading = false;
            },
            error: (err) => {
                this.ordersLoading = false;
                this.ordersError = err.error?.message || 'WHOLESALE_ADMIN.ERR_LOAD_ORDERS';
            }
        });
    }

    statusClass(statut: string): string {
        if (statut === 'recue') return 'status-done';
        if (statut === 'annulee') return 'status-cancelled';
        if (statut === 'ajustee') return 'status-warn';
        return 'status-progress';
    }

    confirmOrder(order: WholesaleOrder): void {
        if (this.busyOrderId) return;
        const draft = this.confirmDrafts[order.id] || {};
        const lignes = order.lignes.map((l) => ({ id_ligne: l.id, qte_confirmee: draft[l.id] ?? l.qte_demandee }));
        this.busyOrderId = order.id;
        this.ordersError = '';
        this.wholesaleService.confirmOrder(order.id, lignes).subscribe({
            next: () => { this.busyOrderId = null; this.loadOrders(); },
            error: (err) => {
                this.busyOrderId = null;
                this.ordersError = err.error?.message || 'WHOLESALE_ADMIN.ERR_ACTION';
            }
        });
    }

    startPreparation(order: WholesaleOrder): void {
        this.act(order.id, () => this.wholesaleService.startPreparation(order.id));
    }

    send(order: WholesaleOrder): void {
        this.act(order.id, () => this.wholesaleService.sendOrder(order.id));
    }

    private act(orderId: number, call: () => import('rxjs').Observable<void>): void {
        if (this.busyOrderId) return;
        this.busyOrderId = orderId;
        this.ordersError = '';
        call().subscribe({
            next: () => { this.busyOrderId = null; this.loadOrders(); },
            error: (err) => {
                this.busyOrderId = null;
                this.ordersError = err.error?.message || 'WHOLESALE_ADMIN.ERR_ACTION';
            }
        });
    }

    // ── Listings ──

    loadListings(): void {
        this.listingsLoading = true;
        this.listingsError = '';
        this.wholesaleService.getListings().subscribe({
            next: (data) => { this.listings = data; this.listingsLoading = false; },
            error: (err) => {
                this.listingsLoading = false;
                this.listingsError = err.error?.message || 'WHOLESALE_ADMIN.ERR_LOAD_LISTINGS';
            }
        });
    }

    /** Articles not already listed wholesale. */
    availableArticles(): ArticleForm[] {
        const listedIds = new Set(this.listings.map((l) => l.id_article));
        return this.myArticles.filter((a) => a.id_article && !listedIds.has(a.id_article));
    }

    createListing(): void {
        if (this.creatingListing || !this.newListing.id_article || !this.newListing.prix_gros) return;
        this.creatingListing = true;
        this.createListingError = '';
        this.wholesaleService.createListing({
            id_article: this.newListing.id_article,
            prix_gros: this.newListing.prix_gros,
            qte_min: this.newListing.qte_min || 1,
        }).subscribe({
            next: () => {
                this.creatingListing = false;
                this.newListing = { id_article: null, prix_gros: null, qte_min: 1 };
                this.loadListings();
            },
            error: (err) => {
                this.creatingListing = false;
                this.createListingError = err.error?.message || 'WHOLESALE_ADMIN.ERR_CREATE_LISTING';
            }
        });
    }

    toggleVisible(listing: WholesaleListing): void {
        this.wholesaleService.updateListing(listing.id, { visible: !listing.visible }).subscribe({
            next: () => this.loadListings(),
            error: (err) => { this.listingsError = err.error?.message || 'WHOLESALE_ADMIN.ERR_ACTION'; }
        });
    }

    deleteListing(listing: WholesaleListing): void {
        this.wholesaleService.deleteListing(listing.id).subscribe({
            next: () => this.loadListings(),
            error: (err) => { this.listingsError = err.error?.message || 'WHOLESALE_ADMIN.ERR_ACTION'; }
        });
    }
}
