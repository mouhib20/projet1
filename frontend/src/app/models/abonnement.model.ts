import { Departement } from '../services/auth.service';

export type StatutAbonnement = 'trial' | 'active' | 'grace' | 'suspended';

export interface PrixSection {
    departement: Departement;
    prix_annuel: number | null;
}

export interface ParametresAbonnement {
    id: number;
    prix_base_annuel: number;
    duree_essai_jours: number;
    duree_grace_jours: number;
    sections: PrixSection[];
}

export interface AbonnementListeItem {
    id_magasin: number;
    nom: string;
    wilaya: string | null;
    magasin_actif: boolean;
    statut: StatutAbonnement;
    date_fin_essai: string;
    date_fin_abonnement: string | null;
    reduction_montant: number | null;
    reduction_pourcentage: number | null;
    derniere_date_paiement: string | null;
    prix_annuel: number;
    jours_restants: number | null;
}

export interface ResumeFinancier {
    nb_actifs: number;
    revenus_mois: number;
    revenus_annee: number;
    revenus_attendus_30j: number;
    nb_renouvellements_30j: number;
}

export interface PaiementAbonnement {
    id: number;
    id_magasin: number;
    montant: number;
    methode: string;
    reference: string | null;
    date_paiement: string;
    note: string | null;
    cree_par: number | null;
    date_creation: string;
}

export interface HistoriqueAbonnement {
    id: number;
    id_magasin: number | null;
    type: string;
    id_utilisateur: number | null;
    ancienne_valeur: string | null;
    nouvelle_valeur: string | null;
    raison: string | null;
    date_creation: string;
}

export interface ModuleAbonnement {
    departement: Departement;
    prix_annuel: number | null;
    actif: boolean;
}

export interface AbonnementDetail extends AbonnementListeItem {
    modules: ModuleAbonnement[];
    paiements: PaiementAbonnement[];
    historique: HistoriqueAbonnement[];
}
