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
import { WholesaleCatalogueComponent } from './wholesale/catalogue/wholesale-catalogue.component';
import { WholesaleOrdersComponent } from './wholesale/mes-commandes/wholesale-orders.component';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { permissionGuard } from './guards/permission.guard';
import { superAdminGuard } from './guards/super-admin.guard';
import { compatEditorGuard } from './guards/compat-editor.guard';
import { compatImportGuard } from './guards/compat-import.guard';
import { wholesaleEditorGuard } from './guards/wholesale-editor.guard';
import { StoresListComponent } from './super-admin/stores-list/stores-list.component';
import { StoreModulesComponent } from './super-admin/store-modules/store-modules.component';
import { CompatEditorsComponent } from './super-admin/compat-editors/compat-editors.component';
import { ImportEmployeesComponent } from './super-admin/import-employees/import-employees.component';
import { WholesaleEditorsComponent } from './super-admin/wholesale-editors/wholesale-editors.component';
import { CompatGroupsComponent } from './compat-editor/compat-groups/compat-groups.component';
import { CompatCatalogComponent } from './compat-editor/compat-catalog/compat-catalog.component';
import { MarketAnalyticsComponent } from './super-admin/market-analytics/market-analytics.component';
import { AccessoriesAnalyticsComponent } from './super-admin/accessories-analytics/accessories-analytics.component';
import { SubscriptionsComponent } from './super-admin/subscriptions/subscriptions.component';
import { SuggestionsComponent } from './compat-editor/suggestions/suggestions.component';
import { ImportDataComponent } from './compat-import/import-data/import-data.component';
import { WholesaleEditorProductsComponent } from './wholesale-editor/products/wholesale-editor-products.component';
import { WholesaleEditorOrdersComponent } from './wholesale-editor/orders/wholesale-editor-orders.component';
import { PendingOperationsComponent } from './offline/pending-operations/pending-operations.component';

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
            { path: 'operations-en-attente', component: PendingOperationsComponent, canActivate: [permissionGuard('ventes')] },
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
        path: 'super-admin/wholesale-editors', component: WholesaleEditorsComponent, canActivate: [superAdminGuard],
    },
    {
        path: 'super-admin/import-employees', component: ImportEmployeesComponent, canActivate: [superAdminGuard],
    },
    {
        path: 'super-admin/market-analytics', component: MarketAnalyticsComponent, canActivate: [superAdminGuard],
    },
    {
        path: 'super-admin/accessories-analytics', component: AccessoriesAnalyticsComponent, canActivate: [superAdminGuard],
    },
    {
        path: 'super-admin/subscriptions', component: SubscriptionsComponent, canActivate: [superAdminGuard],
    },
    {
        path: 'compat-editor/groups', component: CompatGroupsComponent, canActivate: [compatEditorGuard],
    },
    {
        path: 'compat-editor/catalog', component: CompatCatalogComponent, canActivate: [compatEditorGuard],
    },
    {
        path: 'compat-editor/suggestions', component: SuggestionsComponent, canActivate: [compatEditorGuard],
    },
    {
        path: 'compat-import', component: ImportDataComponent, canActivate: [compatImportGuard],
    },
    {
        path: 'wholesale-editor/products', component: WholesaleEditorProductsComponent, canActivate: [wholesaleEditorGuard],
    },
    {
        path: 'wholesale-editor/orders', component: WholesaleEditorOrdersComponent, canActivate: [wholesaleEditorGuard],
    },
    {
        path: 'wholesale/catalogue', component: WholesaleCatalogueComponent, canActivate: [permissionGuard('wholesale')],
    },
    {
        path: 'wholesale/commandes', component: WholesaleOrdersComponent, canActivate: [permissionGuard('wholesale')],
    },
    { path: '**', redirectTo: '' }
];
