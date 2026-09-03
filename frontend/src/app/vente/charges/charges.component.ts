import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ChargeService } from '../../services/charge.service';
import { Charge } from '../../models/charge.model';

@Component({
  selector: 'app-charges',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './charges.component.html',
  styleUrls: ['./charges.component.css']
})
export class ChargesComponent implements OnInit {
  charges: Charge[] = [];
  isModalOpen = false;
  searchTerm = '';

  formData: Partial<Charge> = this.initForm();

  constructor(private chargeService: ChargeService) { }

  ngOnInit(): void {
    this.loadCharges();
  }

  initForm(): Partial<Charge> {
    return {
      description: '',
      montant: 0,
      date_charge: new Date().toISOString().split('T')[0]
    };
  }

  loadCharges() {
    this.chargeService.getCharges().subscribe({
      next: (data) => {
        this.charges = data;
      },
      error: (err) => console.error(err)
    });
  }

  get filteredCharges(): Charge[] {
    if (!this.searchTerm) return this.charges;
    const term = this.searchTerm.toLowerCase();
    return this.charges.filter(c =>
      (c.description || '').toLowerCase().includes(term)
    );
  }

  get totalAmount(): number {
    return this.charges.reduce((sum, c) => sum + Number(c.montant || 0), 0);
  }

  openModal() {
    this.formData = this.initForm();
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
  }

  saveCharge() {
    if (!this.formData.description || !this.formData.montant || this.formData.montant <= 0) {
      alert('Veuillez fournir une description et un montant valide.');
      return;
    }

    this.chargeService.createCharge(this.formData as Charge).subscribe({
      next: () => {
        this.loadCharges();
        this.closeModal();
      },
      error: (err) => {
        console.error(err);
        alert('Erreur lors de la création de la charge.');
      }
    });
  }

  deleteCharge(id: number) {
    if (confirm('Voulez-vous vraiment supprimer cette charge ?')) {
      this.chargeService.deleteCharge(id).subscribe({
        next: () => this.loadCharges(),
        error: (err) => console.error(err)
      });
    }
  }
}
