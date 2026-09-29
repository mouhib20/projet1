import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { WholesaleService } from '../../services/wholesale.service';
import { AuthService } from '../../services/auth.service';
import { articleImageUrl } from '../../services/article.service';
import { WholesaleOrder } from '../../models/wholesale.model';

@Component({
    selector: 'app-wholesale-orders',
    standalone: true,
    imports: [CommonModule, TranslatePipe],
    templateUrl: './wholesale-orders.component.html',
    styleUrls: ['./wholesale-orders.component.css']
})
export class WholesaleOrdersComponent implements OnInit {
    loading = false;
    orders: WholesaleOrder[] = [];
    errorMsg = '';
    actionError = '';
    busyOrderId: number | null = null;

    constructor(private wholesaleService: WholesaleService, public auth: AuthService, private router: Router) { }

    ngOnInit(): void {
        this.load();
    }

    imageUrl(image?: string | null): string | null {
        return articleImageUrl(image);
    }

    load(): void {
        this.loading = true;
        this.errorMsg = '';
        this.wholesaleService.getOrders().subscribe({
            // The backend already scopes this to the caller's own store for anyone but the
            // wholesale_editor/super_admin roles (who never reach this page); this filter is a
            // harmless defensive extra layer, not the actual isolation boundary.
            next: (data) => {
                const myMagasin = this.auth.getMagasinId();
                this.orders = data.filter((o) => o.id_magasin_demandeur === myMagasin);
                this.loading = false;
            },
            error: (err) => {
                this.loading = false;
                this.errorMsg = err.error?.message || 'WHOLESALE_ORDERS.ERR_LOAD';
            }
        });
    }

    statusClass(statut: string): string {
        if (statut === 'recue') return 'status-done';
        if (statut === 'annulee') return 'status-cancelled';
        if (statut === 'ajustee') return 'status-warn';
        return 'status-progress';
    }

    acceptAdjustment(order: WholesaleOrder): void {
        this.act(order.id, () => this.wholesaleService.acceptAdjustment(order.id));
    }

    cancel(order: WholesaleOrder): void {
        this.act(order.id, () => this.wholesaleService.cancelOrder(order.id));
    }

    confirmReceipt(order: WholesaleOrder): void {
        this.act(order.id, () => this.wholesaleService.confirmReceipt(order.id));
    }

    private act(orderId: number, call: () => import('rxjs').Observable<void>): void {
        if (this.busyOrderId) return;
        this.busyOrderId = orderId;
        this.actionError = '';
        call().subscribe({
            next: () => { this.busyOrderId = null; this.load(); },
            error: (err) => {
                this.busyOrderId = null;
                this.actionError = err.error?.message || 'WHOLESALE_ORDERS.ERR_ACTION';
            }
        });
    }

    goToCatalogue(): void {
        this.router.navigate(['/wholesale/catalogue']);
    }

    backToStore(): void {
        this.router.navigate(['/vente/accueil']);
    }

    logout(): void {
        this.auth.logout();
    }
}
