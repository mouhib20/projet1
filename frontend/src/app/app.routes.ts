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
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

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
            { path: 'operations', component: OperationsComponent },
            { path: 'statistiques', component: StatistiquesComponent },
            { path: 'charges', component: ChargesComponent, canActivate: [authGuard], data: { roles: ['admin', 'vendeur', 'vendeuse'] } },
            { path: 'stock', component: StockComponent, canActivate: [adminGuard] },
            { path: 'fournisseurs', component: FournisseursComponent, canActivate: [adminGuard] },
            { path: 'factures', component: FacturesComponent, canActivate: [adminGuard] },
            { path: 'clients', component: ClientsComponent, canActivate: [authGuard], data: { roles: ['admin', 'vendeur', 'vendeuse'] } },
        ]
    },
    { path: 'reparation', component: ReparationComponent, canActivate: [authGuard] },
    { path: '**', redirectTo: '' }
];
