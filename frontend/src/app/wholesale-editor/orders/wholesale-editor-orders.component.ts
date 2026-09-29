import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { WholesaleService } from '../../services/wholesale.service';
import { AuthService } from '../../services/auth.service';
import { articleImageUrl } from '../../services/article.service';
import { WholesaleOrder } from '../../models/wholesale.model';

@Component({
    selector: 'app-wholesale-editor-orders',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './wholesale-editor-orders.component.html',
    styleUrls: ['./wholesale-editor-orders.component.css']
})
export class WholesaleEditorOrdersComponent implements OnInit {
    loading = false;
    orders: WholesaleOrder[] = [];
    errorMsg = '';
    busyOrderId: number | null = null;
    /** id_ligne -> qte_confirmee, edited inline before confirming an en_attente order. */
    confirmDrafts: Record<number, Record<number, number>> = {};

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
            next: (data) => {
                this.orders = data;
                for (const o of data) {
                    if (o.statut === 'en_attente' && !this.confirmDrafts[o.id]) {
                        const draft: Record<number, number> = {};
                        for (const l of o.lignes) draft[l.id] = l.qte_demandee;
                        this.confirmDrafts[o.id] = draft;
                    }
                }
                this.loading = false;
            },
            error: (err) => {
                this.loading = false;
                this.errorMsg = err.error?.message || 'WHOLESALE_EDITOR_ORDERS.ERR_LOAD';
            }
        });
    }

    statusClass(statut: string): string {
        if (statut === 'recue') return 'status-done';
        if (statut === 'annulee') return 'status-cancelled';
        if (statut === 'ajustee') return 'status-warn';
        return 'status-progress';
    }

    confirmOrder(order: WholesaleOrder): void {
        if (this.busyOrderId) return;
        const draft = this.confirmDrafts[order.id] || {};
        const lignes = order.lignes.map((l) => ({ id_ligne: l.id, qte_confirmee: draft[l.id] ?? l.qte_demandee }));
        this.busyOrderId = order.id;
        this.errorMsg = '';
        this.wholesaleService.confirmOrder(order.id, lignes).subscribe({
            next: () => { this.busyOrderId = null; this.load(); },
            error: (err) => {
                this.busyOrderId = null;
                this.errorMsg = err.error?.message || 'WHOLESALE_EDITOR_ORDERS.ERR_ACTION';
            }
        });
    }

    startPreparation(order: WholesaleOrder): void {
        this.act(order.id, () => this.wholesaleService.startPreparation(order.id));
    }

    send(order: WholesaleOrder): void {
        this.act(order.id, () => this.wholesaleService.sendOrder(order.id));
    }

    private act(orderId: number, call: () => import('rxjs').Observable<void>): void {
        if (this.busyOrderId) return;
        this.busyOrderId = orderId;
        this.errorMsg = '';
        call().subscribe({
            next: () => { this.busyOrderId = null; this.load(); },
            error: (err) => {
                this.busyOrderId = null;
                this.errorMsg = err.error?.message || 'WHOLESALE_EDITOR_ORDERS.ERR_ACTION';
            }
        });
    }

    goToProducts(): void {
        this.router.navigate(['/wholesale-editor/products']);
    }

    logout(): void {
        this.auth.logout();
    }
}
