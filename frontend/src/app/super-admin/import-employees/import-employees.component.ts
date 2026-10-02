import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CompatImportService } from '../../services/compat-import.service';
import { AuthService } from '../../services/auth.service';
import { ImportEmployee } from '../../models/compat-import.model';

@Component({
    selector: 'app-import-employees',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './import-employees.component.html',
    styleUrls: ['./import-employees.component.css']
})
export class ImportEmployeesComponent implements OnInit {
    employees: ImportEmployee[] = [];
    loading = false;
    errorMsg = '';
    successMsg = '';

    showForm = false;
    form: ImportEmployee = this.emptyForm();
    saving = false;

    constructor(private importService: CompatImportService, public auth: AuthService, private router: Router) { }

    ngOnInit(): void {
        this.loadEmployees();
    }

    emptyForm(): ImportEmployee {
        return { nom: '', username: '', password: '' };
    }

    loadEmployees(): void {
        this.loading = true;
        this.importService.getEmployees().subscribe({
            next: (data) => { this.employees = data; this.loading = false; },
            error: () => { this.errorMsg = 'IMPORT_EMPLOYEES.ERR_LOAD'; this.loading = false; }
        });
    }

    clearMessages(): void {
        this.errorMsg = '';
        this.successMsg = '';
    }

    openAddForm(): void {
        this.form = this.emptyForm();
        this.showForm = true;
        this.clearMessages();
    }

    cancelForm(): void {
        this.showForm = false;
    }

    save(): void {
        if (this.saving) return;
        if (!this.form.nom?.trim()) { this.errorMsg = 'IMPORT_EMPLOYEES.ERR_NAME_REQUIRED'; return; }
        if (!this.form.username?.trim()) { this.errorMsg = 'IMPORT_EMPLOYEES.ERR_USERNAME_REQUIRED'; return; }
        if (!this.form.password || this.form.password.length < 6) { this.errorMsg = 'IMPORT_EMPLOYEES.ERR_PASSWORD_LENGTH'; return; }

        this.clearMessages();
        this.saving = true;
        this.importService.createEmployee(this.form).subscribe({
            next: () => {
                this.saving = false;
                this.successMsg = 'IMPORT_EMPLOYEES.SUCCESS_CREATE';
                this.showForm = false;
                this.loadEmployees();
            },
            error: (err) => {
                this.saving = false;
                this.errorMsg = err.error?.message || 'IMPORT_EMPLOYEES.ERR_CREATE';
            }
        });
    }

    toggleStatut(employee: ImportEmployee): void {
        if (!employee.id) return;
        const next = !employee.actif;
        this.importService.setEmployeeStatut(employee.id, next).subscribe({
            next: () => {
                this.successMsg = next ? 'IMPORT_EMPLOYEES.SUCCESS_REACTIVATED' : 'IMPORT_EMPLOYEES.SUCCESS_SUSPENDED';
                this.loadEmployees();
            },
            error: (err) => { this.errorMsg = err.error?.message || 'IMPORT_EMPLOYEES.ERR_STATUT'; }
        });
    }

    back(): void {
        this.router.navigate(['/super-admin/stores']);
    }
}
