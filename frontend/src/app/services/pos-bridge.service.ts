import { Injectable } from '@angular/core';

export interface PendingRepairCartItem {
    reparationId: number;
    designation: string;
    prix: number;
    prix_achat: number;
}

/** Hands a repair ticket off from the Reparation page to the POS cart in Ventes. */
@Injectable({ providedIn: 'root' })
export class PosBridgeService {
    pendingRepairItem: PendingRepairCartItem | null = null;

    sendRepairToPos(item: PendingRepairCartItem): void {
        this.pendingRepairItem = item;
    }

    consumePendingRepairItem(): PendingRepairCartItem | null {
        const item = this.pendingRepairItem;
        this.pendingRepairItem = null;
        return item;
    }
}
