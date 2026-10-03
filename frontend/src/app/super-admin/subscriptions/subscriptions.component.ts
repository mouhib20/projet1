import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AbonnementService } from '../../services/abonnement.service';
import { AuthService, Departement } from '../../services/auth.service';
import {
    ParametresAbonnement, AbonnementListeItem, ResumeFinancier, AbonnementDetail, StatutAbonnement,
} from '../../models/abonnement.model';

const DEPARTEMENTS: Departement[] = ['ventes', 'stock', 'reparation', 'fournisseurs', 'charges', 'clients', 'rapports', 'compatibilite', 'wholesale'];
const METHODES_PAIEMENT = ['Espèces', 'Virement bancaire', 'Chèque', 'Autre'];

type FiltreStatut = 'tous' | StatutAbonnement | 'expire_bientot';

@Component({
    selector: 'app-subscriptions',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './subscriptions.component.html',
    styleUrls: ['./subscriptions.component.css']
})
export class SubscriptionsComponent implements OnInit {
    readonly departements = DEPARTEMENTS;
    readonly methodesPaiement = METHODES_PAIEMENT;

    loading = false;
    errorMsg = '';
    successMsg = '';

    resume: ResumeFinancier | null = null;
    abonnements: AbonnementListeItem[] = [];
    filtreStatut: FiltreStatut = 'tous';
    searchTerm = '';

    // ── Settings panel ──
    showParametres = false;
    parametres: ParametresAbonnement | null = null;
    savingParametres = false;

    // ── Per-row action panel ──
    openRowId: number | null = null;
    openAction: 'paiement' | 'prolonger-essai' | 'prolonger' | 'suspendre' | 'reactiver' | 'reduction' | 'historique' | null = null;
    detail: AbonnementDetail | null = null;
    detailLoading = false;
    saving = false;

    formPaiement = { montant: 0, methode: METHODES_PAIEMENT[0], reference: '', date_paiement: new Date().toISOString().slice(0, 10), note: '', sections: [] as Departement[] };
    formProlonger = { jours: 30, raison: '' };
    formRaisonSimple = { raison: '' };
    formReduction: { montant: number | null; pourcentage: number | null; raison: string } = { montant: null, pourcentage: null, raison: '' };

    constructor(
        private abonnementService: AbonnementService,
        public auth: AuthService,
        private router: Router,
    ) { }

    ngOnInit(): void {
        this.loadAll();
    }

    clearMessages(): void {
        this.errorMsg = '';
        this.successMsg = '';
    }

    loadAll(): void {
        this.loading = true;
        this.abonnementService.getResumeFinancier().subscribe({ next: (d) => this.resume = d });
        this.abonnementService.listerAbonnements().subscribe({
            next: (d) => { this.abonnements = d; this.loading = false; },
            error: (err) => { this.errorMsg = err.error?.message || 'SUBSCRIPTIONS.ERR_LOAD'; this.loading = false; }
        });
    }

    get filteredAbonnements(): AbonnementListeItem[] {
        let liste = this.abonnements;
        if (this.filtreStatut === 'expire_bientot') {
            liste = liste.filter(a => a.jours_restants != null && a.jours_restants >= 0 && a.jours_restants <= 30);
        } else if (this.filtreStatut !== 'tous') {
            liste = liste.filter(a => a.statut === this.filtreStatut);
        }
        if (this.searchTerm.trim()) {
            const term = this.searchTerm.toLowerCase();
            liste = liste.filter(a => a.nom.toLowerCase().includes(term));
        }
        return liste;
    }

    statutBadgeClass(statut: StatutAbonnement): string {
        return {
            trial: 'badge-trial', active: 'badge-active', grace: 'badge-grace', suspended: 'badge-suspended',
        }[statut];
    }

    // ── Settings panel ──

    toggleParametres(): void {
        this.showParametres = !this.showParametres;
        if (this.showParametres && !this.parametres) {
            this.abonnementService.getParametres().subscribe({ next: (d) => this.parametres = d });
        }
    }

    saveParametresBase(): void {
        if (!this.parametres || this.savingParametres) return;
        this.savingParametres = true;
        this.clearMessages();
        this.abonnementService.updateParametres({
            prix_base_annuel: this.parametres.prix_base_annuel,
            duree_essai_jours: this.parametres.duree_essai_jours,
            duree_grace_jours: this.parametres.duree_grace_jours,
        }).subscribe({
            next: () => { this.savingParametres = false; this.successMsg = 'SUBSCRIPTIONS.SUCCESS_SAVED'; },
            error: (err) => { this.savingParametres = false; this.errorMsg = err.error?.message || 'SUBSCRIPTIONS.ERR_SAVE'; }
        });
    }

    saveSectionPrice(departement: Departement, prix: number | null): void {
        this.clearMessages();
        this.abonnementService.updatePrixSection(departement, prix).subscribe({
            next: () => { this.successMsg = 'SUBSCRIPTIONS.SUCCESS_SAVED'; },
            error: (err) => { this.errorMsg = err.error?.message || 'SUBSCRIPTIONS.ERR_SAVE'; }
        });
    }

    // ── Per-row actions ──

    openRow(a: AbonnementListeItem, action: typeof this.openAction): void {
        this.clearMessages();
        if (this.openRowId === a.id_magasin && this.openAction === action) { this.closeRow(); return; }
        this.openRowId = a.id_magasin;
        this.openAction = action;
        this.formPaiement = { montant: a.prix_annuel, methode: METHODES_PAIEMENT[0], reference: '', date_paiement: new Date().toISOString().slice(0, 10), note: '', sections: [] };
        this.formProlonger = { jours: 30, raison: '' };
        this.formRaisonSimple = { raison: '' };
        this.formReduction = { montant: a.reduction_montant, pourcentage: a.reduction_pourcentage, raison: '' };
        this.detail = null;

        if (action === 'paiement' || action === 'historique') {
            this.detailLoading = true;
            this.abonnementService.getAbonnement(a.id_magasin).subscribe({
                next: (d) => {
                    this.detail = d;
                    this.detailLoading = false;
                    if (action === 'paiement') this.formPaiement.sections = d.modules.filter(m => m.actif).map(m => m.departement);
                },
                error: () => { this.detailLoading = false; }
            });
        }
    }

    closeRow(): void {
        this.openRowId = null;
        this.openAction = null;
        this.detail = null;
    }

    toggleSection(dep: Departement): void {
        const idx = this.formPaiement.sections.indexOf(dep);
        if (idx >= 0) this.formPaiement.sections.splice(idx, 1);
        else this.formPaiement.sections.push(dep);
    }

    submitPaiement(idMagasin: number): void {
        if (this.saving) return;
        if (!(this.formPaiement.montant > 0)) { this.errorMsg = 'SUBSCRIPTIONS.ERR_AMOUNT_REQUIRED'; return; }
        this.saving = true;
        this.clearMessages();
        this.abonnementService.enregistrerPaiement(idMagasin, this.formPaiement).subscribe({
            next: () => { this.saving = false; this.successMsg = 'SUBSCRIPTIONS.SUCCESS_PAYMENT'; this.closeRow(); this.loadAll(); },
            error: (err) => { this.saving = false; this.errorMsg = err.error?.message || 'SUBSCRIPTIONS.ERR_SAVE'; }
        });
    }

    submitProlongerEssai(idMagasin: number): void {
        if (this.saving || !this.formProlonger.raison.trim()) { this.errorMsg = 'SUBSCRIPTIONS.ERR_REASON_REQUIRED'; return; }
        this.saving = true;
        this.clearMessages();
        this.abonnementService.prolongerEssai(idMagasin, this.formProlonger.jours, this.formProlonger.raison).subscribe({
            next: () => { this.saving = false; this.successMsg = 'SUBSCRIPTIONS.SUCCESS_SAVED'; this.closeRow(); this.loadAll(); },
            error: (err) => { this.saving = false; this.errorMsg = err.error?.message || 'SUBSCRIPTIONS.ERR_SAVE'; }
        });
    }

    submitProlongerAbonnement(idMagasin: number): void {
        if (this.saving || !this.formProlonger.raison.trim()) { this.errorMsg = 'SUBSCRIPTIONS.ERR_REASON_REQUIRED'; return; }
        this.saving = true;
        this.clearMessages();
        this.abonnementService.prolongerAbonnement(idMagasin, this.formProlonger.jours, this.formProlonger.raison).subscribe({
            next: () => { this.saving = false; this.successMsg = 'SUBSCRIPTIONS.SUCCESS_SAVED'; this.closeRow(); this.loadAll(); },
            error: (err) => { this.saving = false; this.errorMsg = err.error?.message || 'SUBSCRIPTIONS.ERR_SAVE'; }
        });
    }

    submitSuspendre(idMagasin: number): void {
        if (this.saving || !this.formRaisonSimple.raison.trim()) { this.errorMsg = 'SUBSCRIPTIONS.ERR_REASON_REQUIRED'; return; }
        this.saving = true;
        this.clearMessages();
        this.abonnementService.suspendre(idMagasin, this.formRaisonSimple.raison).subscribe({
            next: () => { this.saving = false; this.successMsg = 'SUBSCRIPTIONS.SUCCESS_SAVED'; this.closeRow(); this.loadAll(); },
            error: (err) => { this.saving = false; this.errorMsg = err.error?.message || 'SUBSCRIPTIONS.ERR_SAVE'; }
        });
    }

    submitReactiver(idMagasin: number): void {
        if (this.saving || !this.formRaisonSimple.raison.trim()) { this.errorMsg = 'SUBSCRIPTIONS.ERR_REASON_REQUIRED'; return; }
        this.saving = true;
        this.clearMessages();
        this.abonnementService.reactiver(idMagasin, this.formRaisonSimple.raison).subscribe({
            next: () => { this.saving = false; this.successMsg = 'SUBSCRIPTIONS.SUCCESS_SAVED'; this.closeRow(); this.loadAll(); },
            error: (err) => { this.saving = false; this.errorMsg = err.error?.message || 'SUBSCRIPTIONS.ERR_SAVE'; }
        });
    }

    submitReduction(idMagasin: number): void {
        if (this.saving || !this.formReduction.raison.trim()) { this.errorMsg = 'SUBSCRIPTIONS.ERR_REASON_REQUIRED'; return; }
        this.saving = true;
        this.clearMessages();
        this.abonnementService.changerReduction(idMagasin, this.formReduction).subscribe({
            next: () => { this.saving = false; this.successMsg = 'SUBSCRIPTIONS.SUCCESS_SAVED'; this.closeRow(); this.loadAll(); },
            error: (err) => { this.saving = false; this.errorMsg = err.error?.message || 'SUBSCRIPTIONS.ERR_SAVE'; }
        });
    }

    goBack(): void {
        this.router.navigate(['/super-admin/stores']);
    }

    logout(): void {
        this.auth.logout();
    }
}
