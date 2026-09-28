import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Employee } from '../models/employee.model';
import { PermissionMatrix } from './auth.service';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class EmployeeService {

    private apiUrl = `${environment.apiUrl}/employees`;

    constructor(private http: HttpClient) { }

    getEmployees(): Observable<Employee[]> {
        return this.http.get<Employee[]>(this.apiUrl);
    }

    createEmployee(employee: Employee): Observable<Employee> {
        return this.http.post<Employee>(this.apiUrl, employee);
    }

    updateEmployee(id: number, employee: Partial<Employee>): Observable<Employee> {
        return this.http.put<Employee>(`${this.apiUrl}/${id}`, employee);
    }

    setStatut(id: number, actif: boolean): Observable<Employee> {
        return this.http.patch<Employee>(`${this.apiUrl}/${id}/statut`, { actif });
    }

    getPermissions(id: number): Observable<PermissionMatrix> {
        return this.http.get<PermissionMatrix>(`${this.apiUrl}/${id}/permissions`);
    }

    setPermissions(id: number, matrix: PermissionMatrix): Observable<PermissionMatrix> {
        return this.http.put<PermissionMatrix>(`${this.apiUrl}/${id}/permissions`, matrix);
    }
}
