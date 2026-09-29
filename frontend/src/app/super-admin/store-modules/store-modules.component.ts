import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { MagasinService } from '../../services/magasin.service';
import { Magasin, MagasinModulesMatrix } from '../../models/magasin.model';
import { Departement } from '../../services/auth.service';

const DEPARTEMENTS: Departement[] = ['ventes', 'stock', 'reparation', 'fournisseurs', 'charges', 'clients', 'rapports'];

@Component({
    selector: 'app-store-modules',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './store-modules.component.html',
    styleUrls: ['./store-modules.component.css']
})
export class StoreModulesComponent implements OnInit {
    readonly departements = DEPARTEMENTS;
    storeId!: number;
    store: Magasin | null = null;
    matrix: Record<Departement, boolean> = this.emptyMatrix();
    loading = false;
    saving = false;
    errorMsg = '';
    successMsg = '';

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private magasinService: MagasinService,
    ) { }

    ngOnInit(): void {
        this.storeId = Number(this.route.snapshot.paramMap.get('id'));
        this.load();
    }

    private emptyMatrix(): Record<Departement, boolean> {
        const m = {} as Record<Departement, boolean>;
        for (const d of DEPARTEMENTS) m[d] = true;
        return m;
    }

    load(): void {
        this.loading = true;
        this.magasinService.getMagasin(this.storeId).subscribe({
            next: (store) => { this.store = store; },
            error: () => { this.errorMsg = 'SUPER_ADMIN.ERR_LOAD'; }
        });
        this.magasinService.getModules(this.storeId).subscribe({
            next: (data: MagasinModulesMatrix) => {
                const m = this.emptyMatrix();
                for (const d of DEPARTEMENTS) if (data[d] !== undefined) m[d] = !!data[d];
                this.matrix = m;
                this.loading = false;
            },
            error: () => { this.errorMsg = 'SUPER_ADMIN.ERR_LOAD_MODULES'; this.loading = false; }
        });
    }

    save(): void {
        if (this.saving) return;
        this.saving = true;
        this.errorMsg = '';
        this.successMsg = '';
        this.magasinService.setModules(this.storeId, this.matrix).subscribe({
            next: () => { this.saving = false; this.successMsg = 'SUPER_ADMIN.SUCCESS_MODULES_SAVED'; },
            error: (err) => { this.saving = false; this.errorMsg = err.error?.message || 'SUPER_ADMIN.ERR_SAVE_MODULES'; }
        });
    }

    back(): void {
        this.router.navigate(['/super-admin/stores']);
    }
}
