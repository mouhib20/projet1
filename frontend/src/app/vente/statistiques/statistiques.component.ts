import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VenteService } from '../../services/vente.service';
import { ChargeService } from '../../services/charge.service';
import { VenteStats } from '../../models/vente-stats.model';
import { Charge } from '../../models/charge.model';

@Component({
  selector: 'app-statistiques',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './statistiques.component.html',
  styleUrls: ['./statistiques.component.css']
})
export class StatistiquesComponent implements OnInit {
  stats: VenteStats | null = null;
  loading = true;
  errorMsg = '';
  periodDays = 14;
  totalCharges = 0;

  constructor(
    private venteService: VenteService,
    private chargeService: ChargeService
  ) { }

  ngOnInit(): void {
    this.loadStats();
  }

  setPeriod(days: number): void {
    this.periodDays = days;
    this.loadStats();
  }

  loadStats(): void {
    this.loading = true;
    this.errorMsg = '';
    this.venteService.getStats(this.periodDays).subscribe({
      next: (data) => {
        this.stats = data;
        this.loading = false;
        this.loadCharges(data.startDate, data.endDate);
      },
      error: () => {
        this.errorMsg = 'Impossible de charger les statistiques. Vérifiez que le backend est démarré.';
        this.loading = false;
      }
    });
  }

  loadCharges(startDate: string, endDate: string): void {
    this.chargeService.getCharges().subscribe({
      next: (charges: Charge[]) => {
        this.totalCharges = charges
          .filter(c => {
            const d = typeof c.date_charge === 'string' ? c.date_charge : new Date(c.date_charge).toISOString().split('T')[0];
            return d >= startDate && d <= endDate;
          })
          .reduce((sum, c) => sum + (c.montant || 0), 0);
      },
      error: () => { this.totalCharges = 0; }
    });
  }

  get netProfit(): number {
    return (this.stats?.estimatedProfit || 0) - this.totalCharges;
  }

  get maxDayRevenue(): number {
    if (!this.stats || this.stats.revenueByDay.length === 0) return 0;
    return Math.max(...this.stats.revenueByDay.map(d => d.total), 1);
  }

  barHeight(total: number): number {
    return Math.round((total / this.maxDayRevenue) * 100);
  }

  formatDayLabel(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }
}
