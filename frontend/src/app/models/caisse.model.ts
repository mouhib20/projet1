export interface CaisseCloture {
    id_cloture: number;
    date: string;
    total_ventes: number;
    montant_compte: number | null;
    date_comptage: string | null;
}

export interface CaisseStatus {
    date: string;
    isClosed: boolean;
    cloture: CaisseCloture | null;
    totalVentesDuJour: number;
}
