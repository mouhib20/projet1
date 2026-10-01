import { Injectable } from '@angular/core';

export interface PendingRepairCartItem {
    reparationId: number;
    designation: string;
    prix: number;
    prix_achat: number;
}

/** Hands a repair ticket off from the Reparation page to the POS cart in Ventes, and (from the
 *  Compatibility search page) hands a specific stocked article off to either destination - just
 *  the id, since both Operations and Reparation already keep their own loaded article list to
 *  resolve it against. Each pending slot is read-then-cleared (one-shot), same as the repair item
 *  above, so a later unrelated page load never re-fires it. */
@Injectable({ providedIn: 'root' })
export class PosBridgeService {
    pendingRepairItem: PendingRepairCartItem | null = null;
    private pendingArticleIdForSale: number | null = null;
    private pendingArticleIdForRepair: number | null = null;

    sendRepairToPos(item: PendingRepairCartItem): void {
        this.pendingRepairItem = item;
    }

    consumePendingRepairItem(): PendingRepairCartItem | null {
        const item = this.pendingRepairItem;
        this.pendingRepairItem = null;
        return item;
    }

    sendArticleToSale(idArticle: number): void {
        this.pendingArticleIdForSale = idArticle;
    }

    consumePendingArticleIdForSale(): number | null {
        const id = this.pendingArticleIdForSale;
        this.pendingArticleIdForSale = null;
        return id;
    }

    sendArticleToRepair(idArticle: number): void {
        this.pendingArticleIdForRepair = idArticle;
    }

    consumePendingArticleIdForRepair(): number | null {
        const id = this.pendingArticleIdForRepair;
        this.pendingArticleIdForRepair = null;
        return id;
    }
}
