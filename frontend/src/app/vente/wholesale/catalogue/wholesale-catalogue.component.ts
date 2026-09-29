import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { WholesaleService } from '../../../services/wholesale.service';
import { articleImageUrl } from '../../../services/article.service';
import { WholesaleCatalogueEntry } from '../../../models/wholesale.model';

interface CartLine {
    entry: WholesaleCatalogueEntry;
    qte: number;
}

@Component({
    selector: 'app-wholesale-catalogue',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './wholesale-catalogue.component.html',
    styleUrls: ['./wholesale-catalogue.component.css']
})
export class WholesaleCatalogueComponent implements OnInit {
    searchTerm = '';
    loading = false;
    entries: WholesaleCatalogueEntry[] = [];
    errorMsg = '';

    cart: CartLine[] = [];
    note = '';
    methodeReception = '';
    submitting = false;
    submitError = '';
    submitSuccess = false;
    lastOrderId: number | null = null;

    constructor(private wholesaleService: WholesaleService) { }

    ngOnInit(): void {
        this.load();
    }

    imageUrl(image?: string | null): string | null {
        return articleImageUrl(image);
    }

    load(): void {
        this.loading = true;
        this.errorMsg = '';
        this.wholesaleService.getCatalogue(this.searchTerm.trim() || undefined).subscribe({
            next: (data) => { this.entries = data; this.loading = false; },
            error: (err) => {
                this.loading = false;
                this.errorMsg = err.error?.message || 'WHOLESALE_CATALOG.ERR_LOAD';
            }
        });
    }

    cartQte(entry: WholesaleCatalogueEntry): number {
        return this.cart.find((c) => c.entry.id_listing === entry.id_listing)?.qte || 0;
    }

    addToCart(entry: WholesaleCatalogueEntry): void {
        const existing = this.cart.find((c) => c.entry.id_listing === entry.id_listing);
        if (existing) {
            if (existing.qte < entry.quantite_disponible) existing.qte++;
            return;
        }
        this.cart.push({ entry, qte: Math.min(entry.qte_min, entry.quantite_disponible) });
    }

    incrementCart(line: CartLine): void {
        if (line.qte < line.entry.quantite_disponible) line.qte++;
    }

    decrementCart(line: CartLine): void {
        if (line.qte > 1) line.qte--;
        else this.removeFromCart(line);
    }

    removeFromCart(line: CartLine): void {
        this.cart = this.cart.filter((c) => c !== line);
    }

    cartTotal(): number {
        return this.cart.reduce((sum, c) => sum + c.qte * Number(c.entry.prix_gros), 0);
    }

    cartHasInvalidLine(): boolean {
        return this.cart.some((c) => c.qte < c.entry.qte_min || c.qte > c.entry.quantite_disponible);
    }

    submitOrder(): void {
        if (this.submitting || this.cart.length === 0 || this.cartHasInvalidLine()) return;
        this.submitting = true;
        this.submitError = '';
        this.submitSuccess = false;
        this.wholesaleService.createOrder({
            lignes: this.cart.map((c) => ({ id_listing: c.entry.id_listing, qte: c.qte })),
            note: this.note.trim() || undefined,
            methode_reception: this.methodeReception.trim() || undefined,
        }).subscribe({
            next: (res) => {
                this.submitting = false;
                this.submitSuccess = true;
                this.lastOrderId = res.id;
                this.cart = [];
                this.note = '';
                this.methodeReception = '';
                this.load();
            },
            error: (err) => {
                this.submitting = false;
                this.submitError = err.error?.message || 'WHOLESALE_CATALOG.ERR_ORDER';
            }
        });
    }
}
