export interface Charge {
    id_charge?: number;
    description: string;
    montant: number;
    date_charge: Date | string;
    paye_caisse?: boolean;
    type_depense?: 'mensuelle' | 'journaliere';
}
