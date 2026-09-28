import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { EmployeeService } from '../../services/employee.service';
import { AuthService } from '../../services/auth.service';
import { Employee } from '../../models/employee.model';

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './employees.component.html',
  styleUrls: ['./employees.component.css']
})
export class EmployeesComponent implements OnInit {
  employees: Employee[] = [];
  searchTerm = '';
  loading = false;
  errorMsg = '';
  successMsg = '';

  // Add/edit form
  showForm = false;
  isEditing = false;
  editingId: number | null = null;
  resetPassword = false;
  form: Employee = this.emptyForm();
  savingEmployee = false;

  constructor(private employeeService: EmployeeService, public auth: AuthService, private router: Router) { }

  ngOnInit(): void {
    this.loadEmployees();
  }

  emptyForm(): Employee {
    return { nom: '', telephone: '', username: '', password: '' };
  }

  loadEmployees(): void {
    this.loading = true;
    this.employeeService.getEmployees().subscribe({
      next: (data) => { this.employees = data; this.loading = false; },
      error: () => { this.errorMsg = 'EMPLOYEES.ERR_LOAD'; this.loading = false; }
    });
  }

  get filteredEmployees(): Employee[] {
    if (!this.searchTerm) return this.employees;
    const term = this.searchTerm.toLowerCase();
    return this.employees.filter(e =>
      (e.nom || '').toLowerCase().includes(term) ||
      (e.telephone || '').toLowerCase().includes(term) ||
      (e.username || '').toLowerCase().includes(term)
    );
  }

  clearMessages(): void {
    this.errorMsg = '';
    this.successMsg = '';
  }

  openAddForm(): void {
    this.isEditing = false;
    this.editingId = null;
    this.resetPassword = false;
    this.form = this.emptyForm();
    this.showForm = true;
    this.clearMessages();
  }

  openEditForm(employee: Employee): void {
    this.isEditing = true;
    this.editingId = employee.id ?? null;
    this.resetPassword = false;
    this.form = { ...employee, password: '' };
    this.showForm = true;
    this.clearMessages();
  }

  cancelForm(): void {
    this.showForm = false;
  }

  saveEmployee(): void {
    if (this.savingEmployee) return;
    if (!this.form.nom?.trim()) {
      this.errorMsg = 'EMPLOYEES.ERR_NAME_REQUIRED';
      return;
    }
    this.clearMessages();
    this.savingEmployee = true;

    if (this.isEditing && this.editingId !== null) {
      const payload: Partial<Employee> = { nom: this.form.nom, telephone: this.form.telephone };
      if (this.resetPassword && this.form.password) payload.password = this.form.password;
      this.employeeService.updateEmployee(this.editingId, payload).subscribe({
        next: () => {
          this.savingEmployee = false;
          this.successMsg = 'EMPLOYEES.SUCCESS_UPDATE';
          this.showForm = false;
          this.loadEmployees();
        },
        error: (err) => {
          this.savingEmployee = false;
          this.errorMsg = err.error?.message || 'EMPLOYEES.ERR_UPDATE';
        }
      });
    } else {
      this.employeeService.createEmployee(this.form).subscribe({
        next: () => {
          this.savingEmployee = false;
          this.successMsg = 'EMPLOYEES.SUCCESS_CREATE';
          this.showForm = false;
          this.loadEmployees();
        },
        error: (err) => {
          this.savingEmployee = false;
          this.errorMsg = err.error?.message || 'EMPLOYEES.ERR_CREATE';
        }
      });
    }
  }

  toggleStatut(employee: Employee): void {
    if (!employee.id) return;
    const next = !employee.actif;
    this.employeeService.setStatut(employee.id, next).subscribe({
      next: () => {
        this.successMsg = next ? 'EMPLOYEES.SUCCESS_REACTIVATED' : 'EMPLOYEES.SUCCESS_SUSPENDED';
        this.loadEmployees();
      },
      error: (err) => { this.errorMsg = err.error?.message || 'EMPLOYEES.ERR_STATUT'; }
    });
  }

  openPermissions(employee: Employee): void {
    if (!employee.id) return;
    this.router.navigate(['/vente/employees', employee.id, 'permissions']);
  }
}
