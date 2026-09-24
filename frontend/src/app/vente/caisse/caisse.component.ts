import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { CaisseService } from '../../services/caisse.service';
import { AuthService } from '../../services/auth.service';
import {
    CaisseMouvement, CaisseRapport, CaisseSession, CaisseStatus, SourceMouvement
} from '../../models/caisse.model';

const SOURCES: Record<SourceMouvement, string> = {
    manuel: 'Manuel',
    vente: 'Vente',
    reparation: 'Réparation',
    depot_client: 'Dépôt client',
    charge: 'Dépense',
    retour: 'Retour / annulation',
    paiement_fournisseur: 'Paiement fournisseur',
};

function aujourdhuiLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
    selector: 'app-caisse',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './caisse.component.html',
    styleUrl: './caisse.component.css'
})
export class CaisseComponent implements OnInit {
    status: CaisseStatus | null = null;
    historique: CaisseSession[] = [];
    erreur = '';
    message = '';
    enCours = false;

    // Opening
    fondCompte: number | null = null;

    // Manual cash in / out
    mouvementType: 'entree' | 'sortie' | null = null;
    mouvementMontant: number | null = null;
    mouvementMotif = '';
    readonly motifsSuggeres = ['Paiement fournisseur', 'Dépense imprévue', 'Ajout de monnaie', 'Retrait vers le coffre'];

    // Closing
    fermetureOuverte = false;
    montantCompte: number | null = null;
    fondLaisse: number | null = null;
    note = '';

    // Past session detail
    detail: { session: CaisseSession; mouvements: CaisseMouvement[] } | null = null;

    // Daily report
    rapportDate = aujourdhuiLocal();
    rapport: CaisseRapport | null = null;

    constructor(private caisseService: CaisseService, public auth: AuthService) { }

    ngOnInit(): void {
        if (!this.peutUtiliser) return;
        this.charger();
        this.chargerRapport();
    }

    get peutUtiliser(): boolean {
        const r = this.auth.getRole();
        return r === 'admin' || r === 'vendeur' || r === 'vendeuse';
    }

    /** Only who opened the drawer (or an admin) may close it; the server enforces the same rule. */
    get peutFermer(): boolean {
        const s = this.status?.session;
        return !!s && (this.auth.isAdmin() || s.ouvert_par_nom === this.auth.getNom());
    }

    num(v: number | string | null | undefined): number {
        return Number(v) || 0;
    }

    source(s: SourceMouvement): string {
        return SOURCES[s] || s;
    }

    /** Positive = surplus, negative = shortage. */
    libelleEcart(e: number): string {
        if (e === 0) return 'Aucun écart';
        return e > 0 ? 'Excédent' : 'Déficit';
    }

    get ecartOuverture(): number {
        if (this.fondCompte === null || this.fondCompte === undefined) return 0;
        return Math.round((this.fondCompte - this.num(this.status?.fondAttenduOuverture)) * 1000) / 1000;
    }

    get ecartFermeture(): number {
        if (this.montantCompte === null || this.montantCompte === undefined) return 0;
        return Math.round((this.montantCompte - this.num(this.status?.attendu)) * 1000) / 1000;
    }

    private echec(err: any, defaut: string): void {
        this.enCours = false;
        this.erreur = err?.error?.message || defaut;
    }

    private effacer(): void {
        this.erreur = '';
        this.message = '';
    }

    charger(): void {
        this.caisseService.getStatus().subscribe({
            next: (s) => { this.status = s; },
            error: (err) => this.echec(err, 'Impossible de charger la caisse.')
        });
        this.caisseService.getHistorique().subscribe({
            next: (h) => { this.historique = h.filter(s => s.statut === 'fermee'); },
            error: () => { }
        });
    }

    // ── Opening ──────────────────────────────────────────────────

    ouvrir(): void {
        this.effacer();
        if (this.fondCompte === null || this.fondCompte < 0) {
            this.erreur = 'Saisissez le fond de caisse compté.';
            return;
        }
        this.enCours = true;
        this.caisseService.ouvrir(this.fondCompte).subscribe({
            next: () => {
                this.enCours = false;
                this.fondCompte = null;
                this.message = 'Caisse ouverte.';
                this.charger();
                this.chargerRapport();
            },
            error: (err) => this.echec(err, "Impossible d'ouvrir la caisse.")
        });
    }

    // ── Manual movements ─────────────────────────────────────────

    ouvrirMouvement(type: 'entree' | 'sortie'): void {
        this.effacer();
        this.fermetureOuverte = false;
        this.mouvementType = type;
        this.mouvementMontant = null;
        this.mouvementMotif = '';
    }

    annulerMouvement(): void {
        this.mouvementType = null;
    }

    enregistrerMouvement(): void {
        this.effacer();
        if (!this.mouvementType) return;
        if (!this.mouvementMontant || this.mouvementMontant <= 0) {
            this.erreur = 'Le montant doit être supérieur à 0.';
            return;
        }
        if (!this.mouvementMotif.trim()) {
            this.erreur = 'Le motif est obligatoire.';
            return;
        }
        this.enCours = true;
        this.caisseService.mouvement({
            type: this.mouvementType,
            montant: this.mouvementMontant,
            motif: this.mouvementMotif.trim()
        }).subscribe({
            next: () => {
                this.enCours = false;
                this.mouvementType = null;
                this.message = 'Mouvement enregistré.';
                this.charger();
                this.chargerRapport();
            },
            error: (err) => this.echec(err, "Impossible d'enregistrer le mouvement.")
        });
    }

    // ── Closing ──────────────────────────────────────────────────

    ouvrirFermeture(): void {
        this.effacer();
        this.mouvementType = null;
        this.fermetureOuverte = true;
        this.montantCompte = null;
        this.fondLaisse = null;
        this.note = '';
    }

    annulerFermeture(): void {
        this.fermetureOuverte = false;
    }

    fermer(): void {
        this.effacer();
        if (this.montantCompte === null || this.montantCompte < 0) {
            this.erreur = 'Saisissez le montant compté dans la caisse.';
            return;
        }
        const fond = this.fondLaisse ?? 0;
        if (fond < 0 || fond > this.montantCompte) {
            this.erreur = 'Le fond remis en caisse doit être compris entre 0 et le montant compté.';
            return;
        }
        this.enCours = true;
        this.caisseService.fermer({ montant_compte: this.montantCompte, fond_laisse: fond, note: this.note }).subscribe({
            next: (s) => {
                this.enCours = false;
                this.fermetureOuverte = false;
                const e = this.num(s.ecart);
                this.message = e === 0
                    ? 'Caisse fermée : aucun écart.'
                    : `Caisse fermée : ${this.libelleEcart(e).toLowerCase()} de ${Math.abs(e).toFixed(3)}.`;
                this.charger();
                this.chargerRapport();
            },
            error: (err) => this.echec(err, 'Impossible de fermer la caisse.')
        });
    }

    // ── History and report ───────────────────────────────────────

    voirSession(s: CaisseSession): void {
        if (this.detail?.session.id === s.id) {
            this.detail = null;
            return;
        }
        this.caisseService.getSession(s.id).subscribe({
            next: (d) => { this.detail = d; },
            error: (err) => this.echec(err, 'Impossible de charger la session.')
        });
    }

    chargerRapport(): void {
        if (!this.rapportDate) return;
        this.caisseService.getRapport(this.rapportDate).subscribe({
            next: (r) => { this.rapport = r; },
            error: (err) => this.echec(err, 'Impossible de charger le rapport.')
        });
    }
}
