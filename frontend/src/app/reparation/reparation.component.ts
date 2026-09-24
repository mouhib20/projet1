import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ReparationService, CreateReparationDto } from '../services/reparation.service';
import { ClientService } from '../services/client.service';
import { ArticleService, ArticleForm } from '../services/article.service';
import { FournisseurService } from '../services/fournisseur.service';
import { PosBridgeService } from '../services/pos-bridge.service';

@Component({
    selector: 'app-reparation',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './reparation.component.html',
    styleUrls: ['./reparation.component.css']
})
export class ReparationComponent implements OnInit {
    activeTab: 'tickets' | 'retours' | 'stock' = 'tickets';
    reparations: any[] = [];
    retours: any[] = [];
    clients: any[] = [];
    fournisseurs: any[] = [];
    articles: ArticleForm[] = [];
    stockParts: ArticleForm[] = [];

    // Modals
    isTicketModalOpen = false;
    isClientModalOpen = false;
    isCustomPartModalOpen = false;

    /** Ticket whose full details are shown (opened by clicking a row in the list). */
    detailRep: any = null;
    ouvrirDetails(rep: any) { this.detailRep = rep; }
    fermerDetails() { this.detailRep = null; }

    // --- Retour après réparation: the client brings the phone back with a problem ---
    retourRep: any = null;
    /** One of Écran / Batterie / Problème technique. */
    retourType = '';
    retourDegre = '';
    retourDetails = '';
    savingRetour = false;
    static readonly PROBLEME_TECHNIQUE = 'Problème technique';

    /** Only once the phone has actually been repaired (awaiting pickup, or closed out). */
    peutDeclarerRetour(rep: any): boolean {
        return this.estEnLivraison(rep) || this.estFinalise(rep);
    }

    ouvrirRetour(rep: any) {
        this.retourRep = rep;
        this.retourType = '';
        this.retourDegre = '';
        this.retourDetails = '';
        this.detailRep = null;
    }

    fermerRetour() { this.retourRep = null; }

    /** Opens a new no-charge ticket linked to the original one, carrying the problem the client reports. */
    declarerRetour() {
        const rep = this.retourRep;
        if (!rep || this.savingRetour) return;
        if (!this.retourType) {
            alert('Veuillez choisir le type de problème.');
            return;
        }
        if (!this.retourDegre) {
            alert('Veuillez indiquer le degré de dommage.');
            return;
        }
        // Commas separate problems elsewhere, so they are replaced to keep this one entry.
        const details = this.retourDetails.trim().replace(/,/g, ' -');
        const technique = this.retourType === ReparationComponent.PROBLEME_TECHNIQUE;
        const probleme = technique && details ? `${this.retourType} : ${details}` : this.retourType;
        if (!rep.client?.id_client) {
            alert('Client introuvable pour ce ticket.');
            return;
        }
        this.savingRetour = true;
        this.reparationService.createReparation({
            id_client: rep.client.id_client,
            appareil: `${rep.appareil} (retour #${rep.id_reparation})`,
            description: probleme,
            retour_de: rep.id_reparation,
            degre_dommage: this.retourDegre,
            cout_main_oeuvre: 0,
            prix: 0,
            statut: 'En attente',
            items: []
        }).subscribe({
            next: () => {
                this.savingRetour = false;
                this.retourRep = null;
                this.loadReparations();
            },
            error: (err) => {
                this.savingRetour = false;
                alert(err.error?.message || 'Erreur lors de la déclaration du retour.');
            }
        });
    }

    // Custom part pricing (when the part needed isn't Écran/Batterie/Filtre)
    customPart = {
        prix_achat: 0,
        fournisseurId: undefined as number | undefined
    };
    /** Search term for looking the part up in the repair inventory before pricing it manually. */
    customPartSearchTerm = '';
    savingCustomPart = false;
    /** Which flow the pricing modal was opened from, since it's shared by both. */
    customPartContext: 'creation' | 'finalisation' = 'creation';
    /** Brand/model of a part already picked from stock or entered in this finalization session. */
    finaliserMarqueModeleConnus: { marque: string; modele: string } | null = null;

    // Scopes the part search to the categories matching the chosen problem(s)
    searchCategoryFilters: string[] = [];

    static readonly TYPE_TO_CATEGORY: { [key: string]: string } = {
        'Écran': 'Afficheur',
        'Batterie': 'Batterie',
        'Filtre': 'Filtre'
    };

    /**
     * Some articles have sous_categorie stored as a plain word ("Afficheur"), others with
     * an Arabic annotation from an older screen ("Afficheur (شاشة عرض)") — match by prefix
     * so both forms are found, instead of requiring an exact match.
     */
    private static matchesCategory(sousCategorie: string | undefined | null, categoryKey: string): boolean {
        if (!sousCategorie) return false;
        return sousCategorie.toLowerCase().startsWith(categoryKey.toLowerCase());
    }

    // --- "Maintenance terminée" finalization: choose the part(s) actually used ---
    isFinaliserModalOpen = false;
    finaliserRep: any = null;
    /** The problem types being resolved in this finalization session (can be several). */
    finaliserTypesSelected: string[] = [];
    /** True when the type(s) were already known from ticket creation, so the checkboxes are hidden. */
    finaliserTypePreselected = false;
    finaliserSearchTerm = '';
    finalisationEnCours = false;

    /** Selected problem types that still have no part on the ticket. */
    get typesRestants(): string[] {
        return this.finaliserTypesSelected.filter(t => !this.typeEstResolu(t));
    }

    /**
     * Problems (known types like Écran, or a free-text problem) that already have a part on the ticket.
     * Each part covers one problem: first by matching category, then any leftover part covers the
     * next problem still missing one (e.g. a stock part whose category doesn't match exactly).
     */
    get problemesResolus(): Set<string> {
        const resolus = new Set<string>();
        const restantes: any[] = [...(this.finaliserRep?.items || [])];
        for (const label of this.finaliserTypesSelected) {
            const cat = ReparationComponent.TYPE_TO_CATEGORY[label];
            if (!cat) continue;
            const idx = restantes.findIndex(it => ReparationComponent.matchesCategory(it.article?.sous_categorie, cat));
            if (idx >= 0) {
                resolus.add(label);
                restantes.splice(idx, 1);
            }
        }
        for (const label of this.finaliserTypesSelected) {
            if (restantes.length === 0) break;
            if (resolus.has(label)) continue;
            restantes.shift();
            resolus.add(label);
        }
        return resolus;
    }

    typeEstResolu(type: string): boolean {
        return this.problemesResolus.has(type);
    }

    // Form Client
    newClient = { nom: '', telephone: '' };

    // Form Ticket
    ticketForm = {
        id_client: undefined as number | undefined,
        marqueAppareil: '',
        modeleAppareil: '',
        description: '',
        cout_main_oeuvre: 0,
        acompte: 0,
        items: [] as any[]
    };
    /** Problems/parts selected for this ticket — several can apply at once. */
    panneTypes: string[] = [];
    /** Free-text problem description, shown only when "Autre" is chosen. */
    problemeAutre = '';

    // Search part
    searchTerm = '';
    availableParts: ArticleForm[] = [];

    constructor(
        private reparationService: ReparationService,
        private clientService: ClientService,
        private articleService: ArticleService,
        private fournisseurService: FournisseurService,
        private posBridge: PosBridgeService,
        private router: Router
    ) { }

    ngOnInit() {
        this.loadReparations();
        this.loadClients();
        this.loadArticles();
        this.loadFournisseurs();
    }

    goHome() {
        this.router.navigate(['']);
    }

    setTab(tab: 'tickets' | 'retours' | 'stock') {
        this.activeTab = tab;
        if (tab === 'retours') this.loadRetours();
    }

    loadReparations() {
        this.reparationService.getAllReparations().subscribe(data => {
            this.reparations = data;
        });
        this.loadRetours();
    }

    loadRetours() {
        this.reparationService.getRetours().subscribe(data => {
            this.retours = data;
        });
        this.loadRetoursFournisseur();
    }

    /** Parts sent back to a supplier (from the Stock de Pièces tab), shown in the Retours tab. */
    retoursFournisseur: any[] = [];

    loadRetoursFournisseur() {
        this.articleService.getRetoursFournisseur().subscribe(data => {
            this.retoursFournisseur = data;
        });
    }

    nomFournisseur(f: any): string {
        return (f?.entreprise || `${f?.nom || ''} ${f?.prenom || ''}`.trim()) + (f?.type_articles ? ` · ${f.type_articles}` : '');
    }

    /** Brand/model of a part, unless the part's name already contains them (occasion parts do). */
    marqueModeleAAjouter(article: any): string {
        const texte = [article?.marque, article?.modele].filter(Boolean).join(' ').trim();
        if (!texte) return '';
        return (article?.designation || '').toLowerCase().includes(texte.toLowerCase()) ? '' : texte;
    }

    /** The "Stock de Pièces" tab only lists what is actually in stock. */
    get piecesEnStock(): ArticleForm[] {
        return this.stockParts.filter(p => (p.quantite || 0) > 0);
    }

    // --- Renvoi d'une pièce défectueuse au fournisseur ---
    renvoiPiece: ArticleForm | null = null;
    renvoiProbleme = '';
    renvoiQte = 1;
    renvoiEnCours = false;

    ouvrirRenvoi(part: ArticleForm) {
        this.renvoiPiece = part;
        this.renvoiProbleme = '';
        this.renvoiQte = 1;
    }

    fermerRenvoi() { this.renvoiPiece = null; }

    confirmerRenvoi() {
        const part = this.renvoiPiece;
        if (!part?.id_article || this.renvoiEnCours) return;
        if (!this.renvoiProbleme.trim()) {
            alert('Décrivez le problème de la pièce.');
            return;
        }
        if (!this.renvoiQte || this.renvoiQte < 1 || this.renvoiQte > (part.quantite || 0)) {
            alert(`Quantité invalide (1 à ${part.quantite || 0}).`);
            return;
        }
        this.renvoiEnCours = true;
        this.articleService.renvoyerAuFournisseur(part.id_article, {
            probleme: this.renvoiProbleme.trim(),
            qte: this.renvoiQte
        }).subscribe({
            next: (res) => {
                this.renvoiEnCours = false;
                this.renvoiPiece = null;
                this.loadArticles();
                this.loadRetoursFournisseur();
                alert(res.fournisseur
                    ? `Pièce renvoyée au fournisseur « ${res.fournisseur} ».`
                    : 'Pièce retirée du stock (aucun fournisseur lié à cette pièce).');
            },
            error: (err) => {
                this.renvoiEnCours = false;
                alert(err.error?.message || 'Erreur lors du renvoi de la pièce.');
            }
        });
    }

    // --- Remplacement d'une pièce défectueuse par une pièce du stock, sur un ticket de retour ---
    remplacerRep: any = null;
    remplacerSearchTerm = '';
    remplacementEnCours = false;

    ouvrirRemplacement(retour: any) {
        this.remplacerRep = retour;
        this.remplacerSearchTerm = '';
    }

    fermerRemplacement() { this.remplacerRep = null; }

    /** In-stock parts matching the search, preferring the category of the reported problem. */
    get remplacementResultats(): ArticleForm[] {
        const term = this.remplacerSearchTerm.trim().toLowerCase();
        if (!term || !this.remplacerRep) return [];
        const type = (this.remplacerRep.description || '').split(',')[0].trim();
        const cat = ReparationComponent.TYPE_TO_CATEGORY[type];
        let pool = this.stockParts.filter(a => (a.quantite || 0) > 0);
        if (cat) pool = pool.filter(a => ReparationComponent.matchesCategory(a.sous_categorie, cat));
        return pool.filter(a =>
            a.designation.toLowerCase().includes(term) ||
            (a.marque && a.marque.toLowerCase().includes(term)) ||
            (a.modele && a.modele.toLowerCase().includes(term)) ||
            (a.barcode && a.barcode.toLowerCase().includes(term))
        ).slice(0, 6);
    }

    remplacerPar(part: ArticleForm) {
        if (!this.remplacerRep || !part.id_article || this.remplacementEnCours) return;
        if (!confirm(`Remplacer par « ${part.designation} » ? Le stock sera diminué de 1.`)) return;
        this.remplacementEnCours = true;
        this.reparationService.addItem(this.remplacerRep.id_reparation, {
            id_article: part.id_article,
            qte: 1,
            prix: part.prix_vente
        }).subscribe({
            next: () => {
                this.remplacementEnCours = false;
                this.remplacerRep = null;
                this.loadArticles();
                this.loadReparations();
            },
            error: (err) => {
                this.remplacementEnCours = false;
                alert(err.error?.message || 'Erreur lors du remplacement de la pièce.');
            }
        });
    }

    /** Names of the fournisseur(s) of a retour's defective part. */
    fournisseursDe(retour: any): string {
        const liste = retour.piece_defectueuse?.fournisseurs || [];
        return liste.map((f: any) => (f.entreprise || `${f.nom} ${f.prenom || ''}`.trim()) + (f.type_articles ? ` · ${f.type_articles}` : '')).join(', ');
    }

    loadClients() {
        this.clientService.getClients().subscribe(data => {
            this.clients = data;
        });
    }

    loadArticles() {
        this.articleService.getArticles().subscribe(data => {
            this.articles = data;
            this.stockParts = this.articles.filter(a => a.type === 'part' || a.type === 'accessory');
        });
    }

    loadFournisseurs() {
        this.fournisseurService.getFournisseurs().subscribe(data => {
            this.fournisseurs = data;
        });
    }

    // --- CLIENT MODAL --- //
    openClientModal() {
        this.newClient = { nom: '', telephone: '' };
        this.isClientModalOpen = true;
    }

    closeClientModal() {
        this.isClientModalOpen = false;
    }

    /** True while the client is being saved: further clicks are ignored (no duplicate clients). */
    savingClient = false;

    saveClient() {
        if (this.savingClient) return;
        if (!this.newClient.nom) {
            alert('Le nom est obligatoire');
            return;
        }
        this.savingClient = true;
        this.clientService.createClient(this.newClient).subscribe({
            next: (res) => {
                this.savingClient = false;
                this.loadClients();
                this.ticketForm.id_client = res?.id_client;
                this.closeClientModal();
            },
            error: (err) => {
                this.savingClient = false;
                alert(err.error?.message || "Erreur lors de l'enregistrement du client.");
            }
        });
    }

    // --- TICKET MODAL --- //
    openTicketModal() {
        this.ticketForm = {
            id_client: undefined,
            marqueAppareil: '',
            modeleAppareil: '',
            description: '',
            cout_main_oeuvre: 100, // Default 100
            acompte: 0,
            items: []
        };
        this.panneTypes = [];
        this.problemeAutre = '';
        this.searchCategoryFilters = [];
        this.isTicketModalOpen = true;
    }

    closeTicketModal() {
        this.isTicketModalOpen = false;
    }

    /**
     * Toggles a problem/part type (Écran/Batterie/Filtre/Autre) at ticket creation —
     * several can be selected at once (e.g. Écran AND Batterie on the same device).
     * For "Autre", pricing the actual part happens later at "Maintenance terminée" — here
     * we just capture what the problem is, in plain text.
     */
    togglePanneType(type: string) {
        const idx = this.panneTypes.indexOf(type);
        if (idx >= 0) this.panneTypes.splice(idx, 1);
        else this.panneTypes.push(type);

        this.searchCategoryFilters = this.panneTypes
            .map(t => ReparationComponent.TYPE_TO_CATEGORY[t])
            .filter((c): c is string => !!c);
    }

    // --- CUSTOM PART MODAL (when the part isn't Écran/Batterie/Filtre) --- //
    openCustomPartModal(context: 'creation' | 'finalisation') {
        this.customPartContext = context;
        this.customPart = { prix_achat: 0, fournisseurId: undefined };
        this.customPartSearchTerm = '';
        this.isCustomPartModalOpen = true;
    }

    closeCustomPartModal() {
        this.isCustomPartModalOpen = false;
    }

    /** Repair-inventory search inside the pricing modal (in-stock parts only). */
    get customPartSearchResults() {
        const term = this.customPartSearchTerm.trim().toLowerCase();
        if (!term) return [];
        return this.stockParts
            .filter(a => (a.quantite || 0) > 0)
            .filter(a =>
                a.designation.toLowerCase().includes(term) ||
                (a.marque && a.marque.toLowerCase().includes(term)) ||
                (a.modele && a.modele.toLowerCase().includes(term)) ||
                (a.barcode && a.barcode.toLowerCase().includes(term)))
            .slice(0, 5);
    }

    /** A part found in the inventory: add it to the ticket (creation) or confirm its price (finalisation). */
    choisirPieceDepuisTarification(part: ArticleForm) {
        this.isCustomPartModalOpen = false;
        if (this.customPartContext === 'finalisation') {
            this.choisirPieceFinalisation(part);
        } else {
            this.addPartToTicket(part);
        }
    }

    /** Name used for a part that isn't in the inventory: the problem it fixes. */
    private customPartLabel(): string {
        if (this.customPartContext === 'finalisation') {
            const type = this.finaliserTypesSelected.find(t => !this.typeEstResolu(t)) || this.finaliserTypesSelected[0];
            return type || 'Pièce';
        }
        return this.problemeAutre || 'Pièce';
    }

    /** At finalisation, a manually priced part counts for the first problem still missing a part. */
    private customPartCategorie(): string {
        if (this.customPartContext !== 'finalisation') return 'Autre';
        const type = this.finaliserTypesSelected.find(t => !this.typeEstResolu(t));
        return (type && ReparationComponent.TYPE_TO_CATEGORY[type]) || 'Autre';
    }

    saveCustomPart() {
        if (this.savingCustomPart) return;
        if (!this.customPart.prix_achat || this.customPart.prix_achat <= 0) {
            alert("Veuillez saisir le prix d'achat de la pièce.");
            return;
        }
        this.savingCustomPart = true;
        const connu = this.customPartContext === 'finalisation' ? this.finaliserMarqueModeleConnus : null;
        const designation = [this.customPartLabel(), connu?.marque, connu?.modele].filter(Boolean).join(' ');

        this.articleService.createArticle({
            designation,
            qte_min: 0,
            marque: connu?.marque || undefined,
            modele: connu?.modele || undefined,
            prix_achat: this.customPart.prix_achat,
            prix_vente: this.customPart.prix_achat,
            type: 'part',
            sous_categorie: this.customPartCategorie(),
            quantite: 1
        }).subscribe({
            next: (article) => {
                if (this.customPart.fournisseurId && article.id_article) {
                    this.articleService.linkFournisseur(article.id_article, this.customPart.fournisseurId).subscribe();
                }

                if (this.customPartContext === 'finalisation' && this.finaliserRep) {
                    this.reparationService.addItem(this.finaliserRep.id_reparation, {
                        id_article: article.id_article!,
                        qte: 1,
                        prix: article.prix_vente || article.prix_achat || 0
                    }).subscribe({
                        next: (updatedRep) => {
                            this.savingCustomPart = false;
                            this.isCustomPartModalOpen = false;
                            this.loadArticles();
                            this.finaliserRep = updatedRep;
                            this.avancerOccasionType();
                            this.terminerSiComplet();
                        },
                        error: (err) => {
                            this.savingCustomPart = false;
                            alert(err.error?.message || "Erreur lors de l'ajout de la pièce au ticket.");
                        }
                    });
                    return;
                }

                this.ticketForm.items.push({
                    id_article: article.id_article,
                    designation: article.designation,
                    prix: article.prix_vente || article.prix_achat || 0,
                    qte: 1,
                    maxStock: article.quantite || 1
                });
                this.savingCustomPart = false;
                this.isCustomPartModalOpen = false;
                this.loadArticles();
            },
            error: (err) => {
                this.savingCustomPart = false;
                alert(err.error?.message || 'Erreur lors de la création de la pièce.');
            }
        });
    }

    // Parts logic directly inside ticket
    get filteredParts() {
        if (!this.searchTerm) return [];
        const term = this.searchTerm.toLowerCase();
        let pool = this.stockParts.filter(a => (a.quantite || 0) > 0);
        if (this.searchCategoryFilters.length > 0) {
            pool = pool.filter(a => this.searchCategoryFilters.some(cat => ReparationComponent.matchesCategory(a.sous_categorie, cat)));
        }
        return pool.filter(a =>
            a.designation.toLowerCase().includes(term) ||
            (a.barcode && a.barcode.toLowerCase().includes(term))
        ).slice(0, 5);
    }

    addPartToTicket(part: ArticleForm) {
        const existing = this.ticketForm.items.find(i => i.id_article === part.id_article);
        if (existing) {
            if (existing.qte >= existing.maxStock) {
                alert(`Stock insuffisant pour ${existing.designation}. Max: ${existing.maxStock}`);
                return;
            }
            existing.qte += 1;
        } else {
            this.ticketForm.items.push({
                id_article: part.id_article,
                designation: part.designation,
                prix: part.prix_vente || 0,
                qte: 1,
                maxStock: part.quantite
            });
        }
        this.searchTerm = '';
    }

    removePart(index: number) {
        this.ticketForm.items.splice(index, 1);
    }

    get ticketTotal() {
        const partsTotal = this.ticketForm.items.reduce((sum, item) => sum + (item.prix * item.qte), 0);
        return partsTotal + (this.ticketForm.cout_main_oeuvre || 0);
    }

    saveTicket() {
        if (!this.ticketForm.id_client) {
            alert('Veuillez sélectionner un client.');
            return;
        }
        if (!this.ticketForm.marqueAppareil && !this.ticketForm.modeleAppareil) {
            alert('La marque ou le modèle de l\'appareil est obligatoire.');
            return;
        }

        const acompte = Number(this.ticketForm.acompte) || 0;
        if (acompte < 0 || acompte > this.ticketTotal) {
            alert("L'acompte doit être compris entre 0 et le total du ticket.");
            return;
        }

        // Check stock
        for (let item of this.ticketForm.items) {
            if (item.qte > item.maxStock) {
                alert(`Stock insuffisant pour ${item.designation}. Max: ${item.maxStock}`);
                return;
            }
        }

        const problemes = this.panneTypes
            .filter(t => t !== 'Autre')
            .concat(this.panneTypes.includes('Autre') ? [this.problemeAutre || 'Autre'] : []);

        const appareil = [this.ticketForm.marqueAppareil, this.ticketForm.modeleAppareil].filter(Boolean).join(' ');

        const payload: CreateReparationDto = {
            id_client: this.ticketForm.id_client,
            appareil,
            description: problemes.join(', '),
            cout_main_oeuvre: this.ticketForm.cout_main_oeuvre,
            prix: this.ticketTotal,
            acompte,
            statut: 'En attente',
            items: this.ticketForm.items.map(i => ({
                id_article: i.id_article,
                qte: i.qte,
                prix: i.prix
            }))
        };

        this.reparationService.createReparation(payload).subscribe({
            next: () => {
                this.loadReparations();
                this.loadArticles();
                this.closeTicketModal();
            },
            error: err => {
                alert(err.error?.message || 'Erreur création ticket');
            }
        });
    }

    updateStatut(id: number, statut: string) {
        if (confirm(`Changer le statut en: ${statut}?`)) {
            this.reparationService.updateStatut(id, statut).subscribe(() => {
                this.loadReparations();
            });
        }
    }

    // --- TWO-BUTTON WORKFLOW: Maintenance terminée → Livraison et réception → Vente avec reçu ---

    /** Ticket is still being worked on: no explicit action taken yet, or repair in progress. */
    estEnCours(rep: any): boolean {
        return rep.statut === 'En attente' || rep.statut === 'En cours';
    }

    /** Repair work is done, awaiting the "montant reçu" step (legacy "Terminé" tickets fold in here too). */
    estEnLivraison(rep: any): boolean {
        return rep.statut === 'Livraison et réception' || rep.statut === 'Terminé';
    }

    /** Fully closed out (legacy "Livré" tickets fold in here too). */
    estFinalise(rep: any): boolean {
        return rep.statut === 'Vente avec reçu' || rep.statut === 'Livré';
    }

    /**
     * Opens the "which part(s) were used?" step, triggered by clicking "Maintenance terminée".
     * If the problem type(s) were already chosen at ticket creation, those are reused instead
     * of asking again — several can apply to the same ticket.
     */
    ouvrirFinalisation(rep: any) {
        // Parts were already picked at ticket creation (via "Pièces de rechange") — nothing
        // left to ask, go straight to "Livraison et réception".
        // ...but only if every selected problem already has its part. If e.g. the screen was
        // picked from stock but the battery was not, ask for the battery's price and fournisseur.
        // Every problem on the ticket (known type or free text) needs a part.
        const tousProblemes: string[] = (rep.description || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        const problemes = tousProblemes.filter(p => !p.startsWith(ReparationComponent.PROBLEME_TECHNIQUE));
        const hasItems = !!(rep.items && rep.items.length > 0);

        this.finaliserRep = rep;
        this.finaliserTypesSelected = problemes;
        // A purely technical problem (software, connector…) needs no part: nothing to ask.
        if (!hasItems && tousProblemes.length > 0 && problemes.length === 0) {
            this.completerFinalisation();
            return;
        }
        if (hasItems && this.typesRestants.length === 0) {
            this.completerFinalisation();
            return;
        }

        this.finaliserSearchTerm = '';
        this.occasionPrix = null;
        this.occasionMarque = '';
        this.occasionModele = '';
        this.occasionFournisseurId = undefined;
        this.finaliserMarqueModeleConnus = null;
        // Reuse the brand/model of a part already picked from stock (e.g. the screen) for the missing ones.
        const pieceConnue = (rep.items || []).map((it: any) => it.article).find((a: any) => a && (a.marque || a.modele));
        if (pieceConnue) {
            this.finaliserMarqueModeleConnus = { marque: pieceConnue.marque || '', modele: pieceConnue.modele || '' };
        }
        this.annulerPieceStock();
        this.isFinaliserModalOpen = true;

        if (problemes.length > 0) {
            this.finaliserTypePreselected = true;
        } else {
            this.finaliserTypesSelected = [];
            this.finaliserTypePreselected = false;
        }
        this.avancerOccasionType();
    }

    fermerFinalisation() {
        this.isFinaliserModalOpen = false;
        this.finaliserRep = null;
    }

    /** Toggles a problem type in the finalization step (only used when nothing was preselected). */
    toggleFinaliserType(type: string) {
        const idx = this.finaliserTypesSelected.indexOf(type);
        if (idx >= 0) this.finaliserTypesSelected.splice(idx, 1);
        else this.finaliserTypesSelected.push(type);
        this.avancerOccasionType();
    }

    get finaliserFilteredParts() {
        if (!this.finaliserSearchTerm) return [];
        const term = this.finaliserSearchTerm.toLowerCase();
        const manquants = this.typesRestants;
        const cibles = manquants.length > 0 ? manquants : this.finaliserTypesSelected;
        // A free-text problem has no category, so it can be matched by any stock part.
        const cats = cibles.some(t => !ReparationComponent.TYPE_TO_CATEGORY[t])
            ? []
            : cibles.map(t => ReparationComponent.TYPE_TO_CATEGORY[t]);
        let pool = this.stockParts.filter(a => (a.quantite || 0) > 0);
        if (cats.length > 0) pool = pool.filter(a => cats.some(cat => ReparationComponent.matchesCategory(a.sous_categorie, cat)));
        return pool.filter(a =>
            a.designation.toLowerCase().includes(term) ||
            (a.barcode && a.barcode.toLowerCase().includes(term))
        ).slice(0, 5);
    }

    // --- Quick "pièce d'occasion" entry: price + modèle + fournisseur, lighter than the full form ---
    occasionPrix: number | null = null;
    occasionMarque = '';
    occasionModele = '';
    occasionFournisseurId: number | undefined = undefined;
    savingOccasion = false;
    /** Which selected problem type the pièce d'occasion being entered is for (when several apply). */
    occasionType = '';

    /** Moves the occasion-part type selector to the next problem still missing a part. */
    private avancerOccasionType() {
        const restant = this.finaliserTypesSelected.find(t => !this.typeEstResolu(t));
        this.occasionType = restant || this.finaliserTypesSelected[0] || '';
    }

    /** True once a first part's brand/model is known in this session — reused for later parts. */
    get occasionMarqueModeleReadonly(): boolean {
        return !!this.finaliserMarqueModeleConnus;
    }

    ajouterPieceOccasion() {
        if (this.savingOccasion || !this.finaliserRep) return;
        if (!this.occasionPrix || this.occasionPrix <= 0) {
            alert('Veuillez saisir le prix de la pièce.');
            return;
        }
        this.savingOccasion = true;

        const type = this.occasionType || this.finaliserTypesSelected[0] || 'Pièce';
        const categorie = ReparationComponent.TYPE_TO_CATEGORY[type] || 'Autre';
        const marque = this.finaliserMarqueModeleConnus?.marque ?? this.occasionMarque;
        const modele = this.finaliserMarqueModeleConnus?.modele ?? this.occasionModele;
        const marqueModele = [marque, modele].filter(Boolean).join(' ');
        const designation = marqueModele
            ? `${type} d'occasion — ${marqueModele}`
            : `${type} d'occasion`;

        this.articleService.createArticle({
            designation,
            qte_min: 0,
            marque: marque || undefined,
            modele: modele || undefined,
            prix_achat: this.occasionPrix,
            prix_vente: this.occasionPrix,
            type: 'part',
            sous_categorie: categorie,
            quantite: 1,
            description: "Pièce d'occasion"
        }).subscribe({
            next: (article) => {
                if (this.occasionFournisseurId && article.id_article) {
                    this.articleService.linkFournisseur(article.id_article, this.occasionFournisseurId).subscribe();
                }
                this.reparationService.addItem(this.finaliserRep.id_reparation, {
                    id_article: article.id_article!,
                    qte: 1,
                    prix: this.occasionPrix!
                }).subscribe({
                    next: (updatedRep) => {
                        this.savingOccasion = false;
                        if (!this.finaliserMarqueModeleConnus) {
                            this.finaliserMarqueModeleConnus = { marque, modele };
                        }
                        this.occasionPrix = null;
                        this.occasionFournisseurId = undefined;
                        this.loadArticles();
                        this.finaliserRep = updatedRep;
                        this.avancerOccasionType();
                        this.terminerSiComplet();
                    },
                    error: (err) => {
                        this.savingOccasion = false;
                        alert(err.error?.message || "Erreur lors de l'ajout de la pièce au ticket.");
                    }
                });
            },
            error: (err) => {
                this.savingOccasion = false;
                alert(err.error?.message || 'Erreur lors de la création de la pièce.');
            }
        });
    }

    // --- Confirming a stock part: lets the price be adjusted and a fournisseur attributed before adding ---
    selectedStockPart: ArticleForm | null = null;
    stockPartPrix: number | null = null;
    stockPartFournisseurId: number | undefined = undefined;

    /** Picks a part from the stock search results — opens the price/fournisseur confirmation step. */
    choisirPieceFinalisation(part: ArticleForm) {
        this.selectedStockPart = part;
        this.stockPartPrix = part.prix_vente ?? 0;
        this.stockPartFournisseurId = undefined;
        this.finaliserSearchTerm = '';
    }

    annulerPieceStock() {
        this.selectedStockPart = null;
        this.stockPartPrix = null;
        this.stockPartFournisseurId = undefined;
    }

    /** Adds the confirmed stock part to the ticket. The modal stays open so several parts can be added in a row. */
    confirmerPieceStock() {
        const part = this.selectedStockPart;
        if (!this.finaliserRep || !part?.id_article || this.finalisationEnCours) return;
        if (!this.stockPartPrix || this.stockPartPrix <= 0) {
            alert('Veuillez saisir le prix de la pièce.');
            return;
        }
        this.finalisationEnCours = true;
        this.reparationService.addItem(this.finaliserRep.id_reparation, {
            id_article: part.id_article,
            qte: 1,
            prix: this.stockPartPrix
        }).subscribe({
            next: (updatedRep) => {
                if (this.stockPartFournisseurId && part.id_article) {
                    this.articleService.linkFournisseur(part.id_article, this.stockPartFournisseurId).subscribe();
                }
                this.finalisationEnCours = false;
                this.loadArticles();
                this.annulerPieceStock();
                this.finaliserRep = updatedRep;
                this.avancerOccasionType();
                this.terminerSiComplet();
            },
            error: (err) => {
                this.finalisationEnCours = false;
                alert(err.error?.message || "Erreur lors de l'ajout de la pièce au ticket.");
            }
        });
    }

    /** No part needed beyond labor (e.g. software fix), or done adding parts — move to the next step. */
    finaliserSansPiece() {
        this.completerFinalisation();
    }

    /** Once a part was added and no selected problem is still missing one, finish without further prompts. */
    private terminerSiComplet() {
        if (!this.finaliserRep?.items?.length) return;
        if (this.finaliserTypesSelected.every(t => this.typeEstResolu(t))) {
            this.completerFinalisation();
        }
    }

    completerFinalisation() {
        if (!this.finaliserRep) return;
        this.reparationService.updateStatut(this.finaliserRep.id_reparation, 'Livraison et réception').subscribe(() => {
            this.isFinaliserModalOpen = false;
            this.finaliserRep = null;
            this.loadReparations();
        });
    }

    /** Main part used in the repair, for the POS cart line label (falls back to the device name). */
    private nomPiecePour(rep: any): string {
        const item = rep.items && rep.items.length > 0 ? rep.items[0] : null;
        return item?.article?.designation || rep.appareil || 'Réparation';
    }

    /** Estimated cost of parts used, so the POS cart can show purchase price / profit. */
    private coutPiecesPour(rep: any): number {
        if (!rep.items || rep.items.length === 0) return 0;
        return rep.items.reduce((sum: number, item: any) => sum + (item.qte || 0) * (item.article?.prix_achat || 0), 0);
    }

    /** What is left to pay at pickup: the agreed price minus the deposit already received. */
    resteAPayer(rep: any): number {
        return Math.max(0, (Number(rep.prix) || 0) - (Number(rep.acompte) || 0));
    }

    envoyerEnCaisse(rep: any) {
        const acompte = Number(rep.acompte) || 0;
        this.posBridge.sendRepairToPos({
            reparationId: rep.id_reparation,
            designation: `${this.nomPiecePour(rep)} (Réparation ${rep.appareil || ''})${acompte > 0 ? ` — acompte ${acompte} MAD déduit` : ''}`.trim(),
            prix: this.resteAPayer(rep),
            prix_achat: this.coutPiecesPour(rep),
        });
        this.router.navigate(['/vente/operations']);
    }
}
