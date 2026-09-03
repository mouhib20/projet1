import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { DashboardService, DashboardStats } from '../../services/dashboard.service';

@Component({
  selector: 'app-accueil',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './accueil.component.html',
  styleUrls: ['./accueil.component.css']
})
export class AccueilComponent implements OnInit {
  stats: DashboardStats | null = null;
  loading = true;
  errorMsg = '';

  constructor(private dashboardService: DashboardService) { }

  ngOnInit(): void {
    this.loadStats();
  }

  loadStats() {
    this.loading = true;
    this.errorMsg = '';
    this.dashboardService.getStats().subscribe({
      next: (data) => {
        this.stats = data;
        this.loading = false;
      },
      error: () => {
        this.errorMsg = 'DASHBOARD.LOADING_ERROR';
        this.loading = false;
      }
    });
  }

  getStockStatusClass(article: any): string {
    const qty = article.quantite ?? 0;
    if (qty <= 0) return 'status-out';
    if (qty <= (article.qte_min ?? 3)) return 'status-low';
    return 'status-ok';
  }

  getStockStatusLabel(article: any): string {
    const qty = article.quantite ?? 0;
    if (qty <= 0) return 'DASHBOARD.STATUS_OUT';
    if (qty <= (article.qte_min ?? 3)) return 'DASHBOARD.STATUS_LOW';
    return 'DASHBOARD.STATUS_OK';
  }
}
