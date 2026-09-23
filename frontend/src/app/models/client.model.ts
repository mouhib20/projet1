export interface Client {
    id_client?: number;
    nom: string;
    telephone?: string;
    solde?: number;
}

export interface ClientDepot {
    id_depot: number;
    montant: number;
    date: string;
    note?: string | null;
}

export interface ClientDepotSummary {
    id_client: number;
    nom: string;
    totalDepose: number;
    solde: number;
}
