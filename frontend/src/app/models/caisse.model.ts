export type SourceMouvement = 'manuel' | 'vente' | 'reparation' | 'depot_client' | 'charge' | 'retour' | 'paiement_fournisseur';

export interface CaisseMouvement {
    id: number;
    type: 'entree' | 'sortie';
    source: SourceMouvement;
    montant: number | string;
    motif: string;
    reference: string | null;
    avant_ouverture: boolean;
    par_nom: string;
    cree_le: string;
}

export interface CaisseSession {
    id: number;
    statut: 'ouverte' | 'fermee';
    ouvert_par_id: number | null;
    ouvert_par_nom: string;
    ouvert_le: string;
    fond_attendu_ouverture: number | string;
    fond_ouverture: number | string;
    ferme_par_nom: string | null;
    ferme_le: string | null;
    montant_attendu: number | string | null;
    montant_compte: number | string | null;
    ecart: number | string | null;
    fond_laisse: number | string | null;
    note: string | null;
}

export interface CaisseStatus {
    ouverte: boolean;
    session: CaisseSession | null;
    // Closed drawer: what the float should be when it is opened
    fondAttenduOuverture?: number;
    horsSession?: number;
    // Open drawer
    entrees?: number;
    sorties?: number;
    attendu?: number;
    mouvements?: CaisseMouvement[];
}

export interface CaisseRapportEmploye {
    employe: string;
    ventes: string;
    acomptes_depots: string;
    entrees_manuelles: string;
    sorties_manuelles: string;
    depenses: string;
    retours: string;
    net: string;
    nb_mouvements: string;
}

export interface CaisseRapport {
    date: string;
    employes: CaisseRapportEmploye[];
    sessions: CaisseSession[];
}
