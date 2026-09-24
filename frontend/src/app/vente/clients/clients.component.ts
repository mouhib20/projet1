import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientService } from '../../services/client.service';
import { AuthService } from '../../services/auth.service';
import { Client, ClientDepot, ClientDepotSummary } from '../../models/client.model';

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clients.component.html',
  styleUrls: ['./clients.component.css']
})
export class ClientsComponent implements OnInit {
  clients: Client[] = [];
  depotsSummary: ClientDepotSummary[] = [];
  searchTerm = '';
  loading = false;
  errorMsg = '';
  successMsg = '';

  // New client form
  showAddForm = false;
  newClient: Client = { nom: '', telephone: '' };
  savingClient = false;

  // Deposit panel
  selectedClient: Client | null = null;
  clientDepots: ClientDepot[] = [];
  depotMontant: number | null = null;
  depotNote = '';
  savingDepot = false;

  constructor(private clientService: ClientService, public auth: AuthService) { }

  ngOnInit(): void {
    this.loadClients();
    this.loadDepotsSummary();
  }

  /** Same person entered several times (same name and phone): merged into one record. */
  fusionnerDoublons(): void {
    if (!confirm("Fusionner les clients en double (même nom et même téléphone) ? Leurs tickets, ventes et dépôts sont regroupés sur une seule fiche.")) return;
    this.errorMsg = '';
    this.successMsg = '';
    this.clientService.fusionnerDoublons().subscribe({
      next: (r) => {
        this.successMsg = r.supprimes === 0
          ? 'Aucun doublon à fusionner.'
          : `${r.supprimes} fiche(s) en double fusionnée(s) (${r.groupes} client(s) concerné(s)).`;
        this.loadClients();
      },
      error: (err) => { this.errorMsg = err.error?.message || 'Impossible de fusionner les doublons.'; }
    });
  }

  loadClients(): void {
    this.loading = true;
    this.clientService.getClients().subscribe({
      next: (data) => { this.clients = data; this.loading = false; },
      error: () => { this.errorMsg = 'Impossible de charger les clients.'; this.loading = false; }
    });
  }

  loadDepotsSummary(): void {
    this.clientService.getDepotsSummary().subscribe({
      next: (data) => this.depotsSummary = data,
      error: (err) => console.error(err)
    });
  }

  get filteredClients(): Client[] {
    if (!this.searchTerm) return this.clients;
    const term = this.searchTerm.toLowerCase();
    return this.clients.filter(c =>
      (c.nom || '').toLowerCase().includes(term) ||
      (c.telephone || '').toLowerCase().includes(term)
    );
  }

  totalDeposeFor(clientId: number | undefined): number {
    if (!clientId) return 0;
    return this.depotsSummary.find(s => s.id_client === clientId)?.totalDepose || 0;
  }

  clearMessages(): void {
    this.errorMsg = '';
    this.successMsg = '';
  }

  // ── Add client ────────────────────────────────────────────
  openAddForm(): void {
    this.newClient = { nom: '', telephone: '' };
    this.showAddForm = true;
    this.clearMessages();
  }

  cancelAddForm(): void {
    this.showAddForm = false;
  }

  saveClient(): void {
    if (this.savingClient) return;
    if (!this.newClient.nom) {
      this.errorMsg = 'Le nom du client est obligatoire.';
      return;
    }
    this.savingClient = true;
    this.clientService.createClient(this.newClient).subscribe({
      next: () => {
        this.savingClient = false;
        this.successMsg = 'Client ajouté avec succès.';
        this.showAddForm = false;
        this.loadClients();
      },
      error: () => {
        this.savingClient = false;
        this.errorMsg = "Erreur lors de l'ajout du client.";
      }
    });
  }

  // ── Deposit panel ─────────────────────────────────────────
  openDepotPanel(client: Client): void {
    this.selectedClient = client;
    this.depotMontant = null;
    this.depotNote = '';
    this.clientDepots = [];
    this.clearMessages();
    if (client.id_client) {
      this.clientService.getDepots(client.id_client).subscribe({
        next: (data) => this.clientDepots = data,
        error: (err) => console.error(err)
      });
    }
  }

  closeDepotPanel(): void {
    this.selectedClient = null;
  }

  saveDepot(): void {
    if (this.savingDepot || !this.selectedClient?.id_client) return;
    if (!this.depotMontant || this.depotMontant <= 0) {
      this.errorMsg = 'Veuillez saisir un montant valide.';
      return;
    }
    this.savingDepot = true;
    this.clientService.deposer(this.selectedClient.id_client, this.depotMontant, this.depotNote).subscribe({
      next: (updatedClient) => {
        this.savingDepot = false;
        this.successMsg = 'Dépôt enregistré avec succès.';
        this.selectedClient = updatedClient;
        this.depotMontant = null;
        this.depotNote = '';
        this.loadClients();
        this.loadDepotsSummary();
        if (updatedClient.id_client) {
          this.clientService.getDepots(updatedClient.id_client).subscribe(data => this.clientDepots = data);
        }
      },
      error: (err) => {
        this.savingDepot = false;
        this.errorMsg = err.error?.message || 'Erreur lors de l\'enregistrement du dépôt.';
      }
    });
  }
}
