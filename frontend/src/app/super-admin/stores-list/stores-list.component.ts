import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { MagasinService } from '../../services/magasin.service';
import { AuthService } from '../../services/auth.service';
import { Magasin, MagasinCreate } from '../../models/magasin.model';
import { environment } from '../../../environments/environment';

@Component({
    selector: 'app-stores-list',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './stores-list.component.html',
    styleUrls: ['./stores-list.component.css']
})
export class StoresListComponent implements OnInit {
    stores: Magasin[] = [];
    searchTerm = '';
    loading = false;
    errorMsg = '';
    successMsg = '';

    showForm = false;
    form: MagasinCreate = this.emptyForm();
    savingStore = false;
    logoFile: File | null = null;
    logoUploading = false;
    logoError = '';

    constructor(private magasinService: MagasinService, public auth: AuthService, private router: Router) { }

    ngOnInit(): void {
        this.loadStores();
    }

    emptyForm(): MagasinCreate {
        return { nom: '', adresse: '', telephone: '', ownerNom: '', ownerTelephone: '', ownerUsername: '', ownerPassword: '' };
    }

    loadStores(): void {
        this.loading = true;
        this.magasinService.getMagasins().subscribe({
            next: (data) => { this.stores = data; this.loading = false; },
            error: () => { this.errorMsg = 'SUPER_ADMIN.ERR_LOAD'; this.loading = false; }
        });
    }

    get filteredStores(): Magasin[] {
        if (!this.searchTerm) return this.stores;
        const term = this.searchTerm.toLowerCase();
        return this.stores.filter(s =>
            (s.nom || '').toLowerCase().includes(term) ||
            (s.telephone || '').toLowerCase().includes(term)
        );
    }

    logoUrl(store: Magasin): string | null {
        return store.logo ? `${environment.filesUrl}${store.logo}` : null;
    }

    clearMessages(): void {
        this.errorMsg = '';
        this.successMsg = '';
    }

    openAddForm(): void {
        this.form = this.emptyForm();
        this.logoFile = null;
        this.logoError = '';
        this.showForm = true;
        this.clearMessages();
    }

    cancelForm(): void {
        this.showForm = false;
    }

    onLogoSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.logoFile = input.files?.[0] ?? null;
    }

    saveStore(): void {
        if (this.savingStore) return;
        if (!this.form.nom?.trim()) { this.errorMsg = 'SUPER_ADMIN.ERR_STORE_NAME_REQUIRED'; return; }
        if (!this.form.ownerNom?.trim()) { this.errorMsg = 'SUPER_ADMIN.ERR_OWNER_NAME_REQUIRED'; return; }
        if (!this.form.ownerUsername?.trim()) { this.errorMsg = 'SUPER_ADMIN.ERR_OWNER_USERNAME_REQUIRED'; return; }
        if (!this.form.ownerPassword || this.form.ownerPassword.length < 6) { this.errorMsg = 'SUPER_ADMIN.ERR_OWNER_PASSWORD_LENGTH'; return; }

        this.clearMessages();
        this.savingStore = true;
        this.magasinService.createMagasin(this.form).subscribe({
            next: (created) => {
                if (this.logoFile && created.id_magasin) {
                    this.logoUploading = true;
                    this.magasinService.uploadLogo(created.id_magasin, this.logoFile).subscribe({
                        next: () => { this.finishSave(); },
                        error: (err) => {
                            this.logoUploading = false;
                            this.logoError = err.error?.message || 'SUPER_ADMIN.ERR_LOGO_UPLOAD';
                            this.finishSave(); // store itself was created successfully either way
                        }
                    });
                } else {
                    this.finishSave();
                }
            },
            error: (err) => {
                this.savingStore = false;
                this.errorMsg = err.error?.message || 'SUPER_ADMIN.ERR_CREATE';
            }
        });
    }

    private finishSave(): void {
        this.savingStore = false;
        this.logoUploading = false;
        this.successMsg = 'SUPER_ADMIN.SUCCESS_CREATE';
        this.showForm = false;
        this.loadStores();
    }

    toggleStatut(store: Magasin): void {
        if (!store.id_magasin) return;
        const next = !store.actif;
        this.magasinService.setStatut(store.id_magasin, next).subscribe({
            next: () => {
                this.successMsg = next ? 'SUPER_ADMIN.SUCCESS_REACTIVATED' : 'SUPER_ADMIN.SUCCESS_SUSPENDED';
                this.loadStores();
            },
            error: (err) => { this.errorMsg = err.error?.message || 'SUPER_ADMIN.ERR_STATUT'; }
        });
    }

    openModules(store: Magasin): void {
        if (!store.id_magasin) return;
        this.router.navigate(['/super-admin/stores', store.id_magasin, 'modules']);
    }

    goToCompatEditors(): void {
        this.router.navigate(['/super-admin/compat-editors']);
    }

    logout(): void {
        this.auth.logout();
    }
}
