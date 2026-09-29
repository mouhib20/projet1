import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { VenteComponent } from './vente/vente.component';
import { ReparationComponent } from './reparation/reparation.component';
import { LoginComponent } from './login/login.component';
import { AccueilComponent } from './vente/accueil/accueil.component';
import { OperationsComponent } from './vente/operations/operations.component';
import { StatistiquesComponent } from './vente/statistiques/statistiques.component';
import { ChargesComponent } from './vente/charges/charges.component';
import { StockComponent } from './vente/stock/stock.component';
import { FournisseursComponent } from './vente/fournisseurs/fournisseurs.component';
import { FacturesComponent } from './vente/factures/factures.component';
import { ClientsComponent } from './vente/clients/clients.component';
import { EmployeesComponent } from './vente/employees/employees.component';
import { EmployeePermissionsComponent } from './vente/employees/permissions/employee-permissions.component';
import { CompatibiliteComponent } from './vente/compatibilite/compatibilite.component';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { permissionGuard } from './guards/permission.guard';
import { superAdminGuard } from './guards/super-admin.guard';
import { compatEditorGuard } from './guards/compat-editor.guard';
import { StoresListComponent } from './super-admin/stores-list/stores-list.component';
import { StoreModulesComponent } from './super-admin/store-modules/store-modules.component';
import { CompatEditorsComponent } from './super-admin/compat-editors/compat-editors.component';
import { CompatGroupsComponent } from './compat-editor/compat-groups/compat-groups.component';

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'login', component: LoginComponent },
    {
        path: 'vente',
        component: VenteComponent,
        canActivate: [authGuard],
        children: [
            { path: '', redirectTo: 'accueil', pathMatch: 'full' },
            { path: 'accueil', component: AccueilComponent },
            { path: 'operations', component: OperationsComponent, canActivate: [permissionGuard('ventes')] },
            { path: 'statistiques', component: StatistiquesComponent, canActivate: [permissionGuard('rapports')] },
            { path: 'charges', component: ChargesComponent, canActivate: [permissionGuard('charges')] },
            { path: 'stock', component: StockComponent, canActivate: [permissionGuard('stock')] },
            { path: 'fournisseurs', component: FournisseursComponent, canActivate: [permissionGuard('fournisseurs')] },
            { path: 'factures', component: FacturesComponent, canActivate: [permissionGuard('fournisseurs')], canDeactivate: [(page: FacturesComponent) => page.peutQuitter()] },
            { path: 'clients', component: ClientsComponent, canActivate: [permissionGuard('clients')] },
            { path: 'compatibilite', component: CompatibiliteComponent, canActivate: [permissionGuard('compatibilite')] },
            { path: 'employees', component: EmployeesComponent, canActivate: [adminGuard] },
            { path: 'employees/:id/permissions', component: EmployeePermissionsComponent, canActivate: [adminGuard] },
        ]
    },
    { path: 'reparation', component: ReparationComponent, canActivate: [permissionGuard('reparation')] },
    {
        path: 'super-admin/stores', component: StoresListComponent, canActivate: [superAdminGuard],
    },
    {
        path: 'super-admin/stores/:id/modules', component: StoreModulesComponent, canActivate: [superAdminGuard],
    },
    {
        path: 'super-admin/compat-editors', component: CompatEditorsComponent, canActivate: [superAdminGuard],
    },
    {
        path: 'compat-editor/groups', component: CompatGroupsComponent, canActivate: [compatEditorGuard],
    },
    { path: '**', redirectTo: '' }
];
