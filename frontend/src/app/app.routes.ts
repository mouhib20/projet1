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
export const routes: Routes = [
    { path: '', component: HomeComponent },
    {
        path: 'vente',
        component: VenteComponent,
        children: [
            { path: '', redirectTo: 'accueil', pathMatch: 'full' },
            { path: 'accueil', component: AccueilComponent },
            { path: 'operations', component: OperationsComponent },
            { path: 'statistiques', component: StatistiquesComponent },
            { path: 'charges', component: ChargesComponent },
            { path: 'stock', component: StockComponent },
            { path: 'fournisseurs', component: FournisseursComponent },
            { path: 'factures', component: FacturesComponent }
        ]
    },
    { path: 'reparation', component: ReparationComponent },
    { path: 'login', component: LoginComponent },
    { path: '**', redirectTo: '' }
];
