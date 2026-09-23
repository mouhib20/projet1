import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateDirective } from '@ngx-translate/core';
import { FournisseurService } from '../../services/fournisseur.service';
import { Fournisseur } from '../../models/fournisseur.model';

@Component({
  selector: 'app-fournisseurs',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, TranslateDirective],
  templateUrl: './fournisseurs.component.html',
  styleUrls: ['./fournisseurs.component.css']
})
export class FournisseursComponent implements OnInit {
  fournisseurs: Fournisseur[] = [];
  isModalOpen = false;
  saving = false;
  editingFournisseur: Fournisseur | null = null;

  formData: Partial<Fournisseur> = {
    nom: '',
    prenom: '',
    tel: '',
    entreprise: '',
    adresse: '',
    matricule_fiscal: '',
    rib: '',
    type_articles: ''
  };

  constructor(
    private fournisseurService: FournisseurService
  ) { }

  ngOnInit(): void {
    this.loadFournisseurs();
  }

  loadFournisseurs() {
    this.fournisseurService.getFournisseurs().subscribe({
      next: (data: Fournisseur[]) => {
        this.fournisseurs = data;
      },
      error: (err: any) => console.error(err)
    });
  }

  openModal(fournisseur?: Fournisseur) {
    if (fournisseur) {
      this.editingFournisseur = fournisseur;
      this.formData = { ...fournisseur };
      this.formData.type_articles = fournisseur.type_articles || '';
    } else {
      this.editingFournisseur = null;
      this.resetForm();
    }
    this.saving = false;
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
    this.resetForm();
  }

  resetForm() {
    this.formData = {
      nom: '',
      prenom: '',
      tel: '',
      entreprise: '',
      adresse: '',
      matricule_fiscal: '',
      rib: '',
      type_articles: ''
    };
  }

  saveFournisseur() {
    if (this.saving) return; // Avoid duplicate submissions on repeated clicks
    this.saving = true;

    if (this.editingFournisseur && this.editingFournisseur.id_fournisseur) {
      this.fournisseurService.updateFournisseur(this.editingFournisseur.id_fournisseur, this.formData as Fournisseur).subscribe({
        next: () => {
          this.saving = false;
          this.loadFournisseurs();
          this.closeModal();
        },
        error: (err: any) => { this.saving = false; console.error(err); }
      });
    } else {
      this.fournisseurService.createFournisseur(this.formData as Fournisseur).subscribe({
        next: () => {
          this.saving = false;
          this.loadFournisseurs();
          this.closeModal();
        },
        error: (err: any) => { this.saving = false; console.error(err); }
      });
    }
  }

  deleteFournisseur(id: number) {
    if (confirm('Voulez-vous vraiment supprimer ce fournisseur ?')) {
      this.fournisseurService.deleteFournisseur(id).subscribe({
        next: () => {
          this.loadFournisseurs();
        },
        error: (err: any) => console.error(err)
      });
    }
  }
}
