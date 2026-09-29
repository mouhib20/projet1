import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { EmployeeService } from '../../../services/employee.service';
import { PermissionEntry, Departement } from '../../../services/auth.service';

const DEPARTEMENTS: Departement[] = ['ventes', 'stock', 'reparation', 'fournisseurs', 'charges', 'clients', 'rapports'];

@Component({
  selector: 'app-employee-permissions',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './employee-permissions.component.html',
  styleUrls: ['./employee-permissions.component.css']
})
export class EmployeePermissionsComponent implements OnInit {
  readonly departements = DEPARTEMENTS;
  employeeId!: number;
  matrix: Record<Departement, PermissionEntry> = this.emptyMatrix();
  loading = false;
  saving = false;
  errorMsg = '';
  successMsg = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private employeeService: EmployeeService,
  ) { }

  ngOnInit(): void {
    this.employeeId = Number(this.route.snapshot.paramMap.get('id'));
    this.load();
  }

  private emptyMatrix(): Record<Departement, PermissionEntry> {
    const m = {} as Record<Departement, PermissionEntry>;
    for (const d of DEPARTEMENTS) m[d] = { voir: false, ajouter: false, modifier: false, supprimer: false };
    return m;
  }

  load(): void {
    this.loading = true;
    this.employeeService.getPermissions(this.employeeId).subscribe({
      next: (data) => {
        const m = this.emptyMatrix();
        for (const d of DEPARTEMENTS) if (data[d]) m[d] = data[d] as PermissionEntry;
        this.matrix = m;
        this.loading = false;
      },
      error: () => { this.errorMsg = 'EMPLOYEES.ERR_LOAD_PERMISSIONS'; this.loading = false; }
    });
  }

  save(): void {
    if (this.saving) return;
    this.saving = true;
    this.errorMsg = '';
    this.successMsg = '';
    this.employeeService.setPermissions(this.employeeId, this.matrix).subscribe({
      next: () => { this.saving = false; this.successMsg = 'EMPLOYEES.SUCCESS_PERMISSIONS_SAVED'; },
      error: (err) => { this.saving = false; this.errorMsg = err.error?.message || 'EMPLOYEES.ERR_SAVE_PERMISSIONS'; }
    });
  }

  back(): void {
    this.router.navigate(['/vente/employees']);
  }
}
