import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ReparationService, CreateReparationDto } from '../services/reparation.service';
import { ClientService } from '../services/client.service';
import { ArticleService, ArticleForm } from '../services/article.service';

@Component({
    selector: 'app-reparation',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './reparation.component.html',
    styleUrls: ['./reparation.component.css']
})
export class ReparationComponent implements OnInit {
    activeTab: 'tickets' | 'stock' = 'tickets';
    reparations: any[] = [];
    clients: any[] = [];
    articles: ArticleForm[] = [];
    stockParts: ArticleForm[] = [];

    // Modals
    isTicketModalOpen = false;
    isClientModalOpen = false;

    // Form Client
    newClient = { nom: '', telephone: '' };

    // Form Ticket
    ticketForm = {
        id_client: undefined as number | undefined,
        appareil: '',
        description: '',
        cout_main_oeuvre: 0,
        items: [] as any[]
    };

    // Search part
    searchTerm = '';
    availableParts: ArticleForm[] = [];

    constructor(
        private reparationService: ReparationService,
        private clientService: ClientService,
        private articleService: ArticleService,
        private router: Router
    ) { }

    ngOnInit() {
        this.loadReparations();
        this.loadClients();
        this.loadArticles();
    }

    goHome() {
        this.router.navigate(['']);
    }

    setTab(tab: 'tickets' | 'stock') {
        this.activeTab = tab;
    }

    loadReparations() {
        this.reparationService.getAllReparations().subscribe(data => {
            this.reparations = data;
        });
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

    // --- CLIENT MODAL --- //
    openClientModal() {
        this.newClient = { nom: '', telephone: '' };
        this.isClientModalOpen = true;
    }

    closeClientModal() {
        this.isClientModalOpen = false;
    }

    saveClient() {
        if (!this.newClient.nom) {
            alert('Le nom est obligatoire');
            return;
        }
        this.clientService.createClient(this.newClient).subscribe(res => {
            this.loadClients();
            this.ticketForm.id_client = res?.id_client;
            this.closeClientModal();
        });
    }

    // --- TICKET MODAL --- //
    openTicketModal() {
        this.ticketForm = {
            id_client: undefined,
            appareil: '',
            description: '',
            cout_main_oeuvre: 100, // Default 100
            items: []
        };
        this.isTicketModalOpen = true;
    }

    closeTicketModal() {
        this.isTicketModalOpen = false;
    }

    // Parts logic directly inside ticket
    get filteredParts() {
        if (!this.searchTerm) return [];
        const term = this.searchTerm.toLowerCase();
        return this.stockParts.filter(a =>
            a.designation.toLowerCase().includes(term) ||
            (a.barcode && a.barcode.toLowerCase().includes(term))
        ).slice(0, 5);
    }

    addPartToTicket(part: ArticleForm) {
        const existing = this.ticketForm.items.find(i => i.id_article === part.id_article);
        if (existing) {
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
        if (!this.ticketForm.appareil) {
            alert('L\'appareil est obligatoire.');
            return;
        }

        // Check stock
        for (let item of this.ticketForm.items) {
            if (item.qte > item.maxStock) {
                alert(`Stock insuffisant pour ${item.designation}. Max: ${item.maxStock}`);
                return;
            }
        }

        const payload: CreateReparationDto = {
            id_client: this.ticketForm.id_client,
            appareil: this.ticketForm.appareil,
            description: this.ticketForm.description,
            cout_main_oeuvre: this.ticketForm.cout_main_oeuvre,
            prix: this.ticketTotal,
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
}
