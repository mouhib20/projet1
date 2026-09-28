import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VenteService } from '../../services/vente.service';
import { ChargeService } from '../../services/charge.service';
import { PeriodeStats, VenteStats } from '../../models/vente-stats.model';
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
  periode: PeriodeStats = 'month';
  totalCharges = 0;

  readonly periodes: { valeur: PeriodeStats; label: string }[] = [
    { valeur: 'today', label: "Aujourd'hui" },
    { valeur: 'week', label: 'Cette semaine' },
    { valeur: 'month', label: 'Ce mois' },
    { valeur: 'year', label: 'Cette année' },
  ];

  constructor(
    private venteService: VenteService,
    private chargeService: ChargeService
  ) { }

  ngOnInit(): void {
    this.loadStats();
  }

  setPeriod(periode: PeriodeStats): void {
    this.periode = periode;
    this.loadStats();
  }

  loadStats(): void {
    this.loading = true;
    this.errorMsg = '';
    this.venteService.getStats(this.periode).subscribe({
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
          .reduce((sum, c) => sum + Number(c.montant || 0), 0);
      },
      error: () => { this.totalCharges = 0; }
    });
  }

  /** Real profit for the period: price minus cost on every sale, minus the period's expenses. */
  get beneficeNet(): number {
    return (this.stats?.estimatedProfit || 0) - this.totalCharges;
  }

  get margeBrute(): number | null {
    if (!this.stats || this.stats.totalRevenue <= 0) return null;
    return (this.stats.estimatedProfit / this.stats.totalRevenue) * 100;
  }

  get maxDayRevenue(): number {
    if (!this.stats || this.stats.revenueByDay.length === 0) return 0;
    return Math.max(...this.stats.revenueByDay.map(d => d.total), 1);
  }

  barHeight(total: number): number {
    return Math.round((total / this.maxDayRevenue) * 100);
  }

  /** Bar label: day (dd/MM) or month name, depending on the period's granularity. */
  formatDayLabel(dateStr: string): string {
    if (this.stats?.granularite === 'mois') {
      const [annee, mois] = dateStr.split('-');
      const nom = new Date(+annee, +mois - 1, 1).toLocaleDateString('fr-FR', { month: 'short' });
      return nom.charAt(0).toUpperCase() + nom.slice(1);
    }
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  get periodeLabel(): string {
    return this.periodes.find(p => p.valeur === this.periode)?.label || '';
  }
}
