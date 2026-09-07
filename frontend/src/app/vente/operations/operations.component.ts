import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { VenteService } from '../../services/vente.service';
import { ClientService } from '../../services/client.service';
import { ArticleService, ArticleForm } from '../../services/article.service';
import { AuthService } from '../../services/auth.service';
import { Vente } from '../../models/vente.model';
import { Client } from '../../models/client.model';

@Component({
  selector: 'app-operations',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './operations.component.html',
  styleUrls: ['./operations.component.css']
})
export class OperationsComponent implements OnInit {
  ventes: Vente[] = [];
  clients: Client[] = [];
  articles: ArticleForm[] = [];

  isModalOpen = false;
  isClientModalOpen = false;
  searchTerm = '';

  formData = this.initForm();
  clientForm: Partial<Client> = { nom: '', telephone: '' };

  constructor(
    private venteService: VenteService,
    private clientService: ClientService,
    private articleService: ArticleService,
    public auth: AuthService
  ) { }

  ngOnInit(): void {
    this.loadVentes();
    this.loadClients();
    this.loadArticles();
  }

  initForm() {
    return {
      clientId: undefined as number | undefined,
      articleId: undefined as number | undefined,
      designation: '',
      qte: 1,
      prix: 0,
      date: new Date().toISOString().split('T')[0]
    };
  }

  loadVentes() {
    this.venteService.getVentes().subscribe({
      next: (data) => this.ventes = data,
      error: (err) => console.error(err)
    });
  }

  loadClients() {
    this.clientService.getClients().subscribe({
      next: (data) => this.clients = data,
      error: (err) => console.error(err)
    });
  }

  loadArticles() {
    this.articleService.getArticles().subscribe({
      next: (data) => this.articles = data,
      error: (err) => console.error(err)
    });
  }

  get filteredVentes(): Vente[] {
    if (!this.searchTerm) return this.ventes;
    const term = this.searchTerm.toLowerCase();
    return this.ventes.filter(v =>
      (v.designation || '').toLowerCase().includes(term) ||
      (v.client?.nom || '').toLowerCase().includes(term) ||
      (v.article?.designation || '').toLowerCase().includes(term)
    );
  }

  get availableArticles(): ArticleForm[] {
    return this.articles.filter(a => (a.quantite ?? 0) > 0);
  }

  get totalRevenue(): number {
    return this.ventes.reduce((sum, v) => sum + (v.qte || 1) * (v.prix || 0), 0);
  }

  openModal() {
    this.formData = this.initForm();
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
  }

  onArticleChange() {
    const article = this.articles.find(a => a.id_article == this.formData.articleId);
    if (article) {
      this.formData.designation = article.designation || '';
      this.formData.prix = article.prix_vente || article.prix_achat || 0;
    }
  }

  saveVente() {
    if (!this.formData.articleId) {
      alert('Veuillez sélectionner un article.');
      return;
    }
    if (this.formData.qte <= 0) {
      alert('Quantité invalide.');
      return;
    }

    const article = this.articles.find(a => a.id_article == this.formData.articleId);
    if (article && this.formData.qte > (article.quantite ?? 0)) {
      alert(`Stock insuffisant. Disponible: ${article.quantite}`);
      return;
    }

    const payload = {
      clientId: this.formData.clientId || null,
      articleId: this.formData.articleId,
      designation: this.formData.designation,
      qte: this.formData.qte,
      prix: this.formData.prix,
      date: this.formData.date
    };

    this.venteService.createVente(payload).subscribe({
      next: () => {
        this.loadVentes();
        this.loadArticles();
        this.closeModal();
      },
      error: (err) => {
        console.error(err);
        alert(err.error?.message || 'Erreur lors de la création de la vente.');
      }
    });
  }

  deleteVente(id: number) {
    if (confirm('Voulez-vous vraiment supprimer cette vente ? Le stock sera restauré.')) {
      this.venteService.deleteVente(id).subscribe({
        next: () => {
          this.loadVentes();
          this.loadArticles();
        },
        error: (err) => console.error(err)
      });
    }
  }

  // Client management
  openClientModal() {
    this.clientForm = { nom: '', telephone: '' };
    this.isClientModalOpen = true;
  }

  closeClientModal() {
    this.isClientModalOpen = false;
  }

  saveClient() {
    if (!this.clientForm.nom) {
      alert('Veuillez saisir le nom du client.');
      return;
    }
    this.clientService.createClient(this.clientForm as Client).subscribe({
      next: () => {
        this.loadClients();
        this.closeClientModal();
      },
      error: (err) => console.error(err)
    });
  }
}
