import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { WholesaleService } from '../../services/wholesale.service';
import { AuthService } from '../../services/auth.service';
import { articleImageUrl } from '../../services/article.service';
import { WholesaleListing, WholesaleListingSave } from '../../models/wholesale.model';

@Component({
    selector: 'app-wholesale-editor-products',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './wholesale-editor-products.component.html',
    styleUrls: ['./wholesale-editor-products.component.css']
})
export class WholesaleEditorProductsComponent implements OnInit {
    listings: WholesaleListing[] = [];
    loading = false;
    errorMsg = '';
    successMsg = '';

    showForm = false;
    editingId: number | null = null;
    form: WholesaleListingSave = this.emptyForm();
    saving = false;

    constructor(private wholesaleService: WholesaleService, public auth: AuthService, private router: Router) { }

    ngOnInit(): void {
        this.load();
    }

    imageUrl(image?: string | null): string | null {
        return articleImageUrl(image);
    }

    emptyForm(): WholesaleListingSave {
        return { designation: '', marque: '', modele: '', barcode: '', image: '', type: '', sous_categorie: '', quantite: 0, prix_gros: 0, qte_min: 1 };
    }

    imageUploading = false;
    imageError = '';

    onImageSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        this.imageError = '';
        this.imageUploading = true;
        this.wholesaleService.uploadListingImage(file).subscribe({
            next: (res) => {
                this.form.image = res.url;
                this.imageUploading = false;
            },
            error: (err) => {
                this.imageError = err.error?.message || 'WHOLESALE_EDITOR_PRODUCTS.ERR_IMAGE_UPLOAD';
                this.imageUploading = false;
            }
        });
        input.value = '';
    }

    removeImage(): void {
        this.form.image = '';
    }

    load(): void {
        this.loading = true;
        this.wholesaleService.getListings().subscribe({
            next: (data) => { this.listings = data; this.loading = false; },
            error: () => { this.errorMsg = 'WHOLESALE_EDITOR_PRODUCTS.ERR_LOAD'; this.loading = false; }
        });
    }

    clearMessages(): void {
        this.errorMsg = '';
        this.successMsg = '';
    }

    openAddForm(): void {
        this.editingId = null;
        this.form = this.emptyForm();
        this.showForm = true;
        this.clearMessages();
    }

    openEditForm(listing: WholesaleListing): void {
        this.editingId = listing.id;
        this.form = {
            designation: listing.designation, marque: listing.marque || '', modele: listing.modele || '',
            barcode: listing.barcode || '', image: listing.image || '', type: listing.type || '', sous_categorie: listing.sous_categorie || '',
            quantite: listing.quantite, prix_gros: listing.prix_gros, qte_min: listing.qte_min,
        };
        this.showForm = true;
        this.clearMessages();
    }

    cancelForm(): void {
        this.showForm = false;
    }

    save(): void {
        if (this.saving) return;
        if (!this.form.designation?.trim()) { this.errorMsg = 'WHOLESALE_EDITOR_PRODUCTS.ERR_DESIGNATION_REQUIRED'; return; }
        if (!(Number(this.form.prix_gros) > 0)) { this.errorMsg = 'WHOLESALE_EDITOR_PRODUCTS.ERR_PRICE_REQUIRED'; return; }

        this.clearMessages();
        this.saving = true;
        if (this.editingId) {
            this.wholesaleService.updateListing(this.editingId, this.form).subscribe({
                next: () => { this.saving = false; this.successMsg = 'WHOLESALE_EDITOR_PRODUCTS.SUCCESS_UPDATE'; this.showForm = false; this.load(); },
                error: (err) => { this.saving = false; this.errorMsg = err.error?.message || 'WHOLESALE_EDITOR_PRODUCTS.ERR_SAVE'; }
            });
        } else {
            this.wholesaleService.createListing(this.form).subscribe({
                next: () => { this.saving = false; this.successMsg = 'WHOLESALE_EDITOR_PRODUCTS.SUCCESS_CREATE'; this.showForm = false; this.load(); },
                error: (err) => { this.saving = false; this.errorMsg = err.error?.message || 'WHOLESALE_EDITOR_PRODUCTS.ERR_SAVE'; }
            });
        }
    }

    toggleVisible(listing: WholesaleListing): void {
        this.wholesaleService.updateListing(listing.id, { visible: !listing.visible }).subscribe({
            next: () => this.load(),
            error: (err) => { this.errorMsg = err.error?.message || 'WHOLESALE_EDITOR_PRODUCTS.ERR_SAVE'; }
        });
    }

    deleteListing(listing: WholesaleListing): void {
        this.wholesaleService.deleteListing(listing.id).subscribe({
            next: () => this.load(),
            error: (err) => { this.errorMsg = err.error?.message || 'WHOLESALE_EDITOR_PRODUCTS.ERR_SAVE'; }
        });
    }

    goToOrders(): void {
        this.router.navigate(['/wholesale-editor/orders']);
    }

    logout(): void {
        this.auth.logout();
    }
}
