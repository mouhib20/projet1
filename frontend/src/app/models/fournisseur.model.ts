export interface Fournisseur {
    id_fournisseur?: number;
    nom: string;
    prenom?: string;
    tel?: string;
    entreprise?: string;
    adresse?: string;
    matricule_fiscal?: string;
    rib?: string;
    solde?: number;
    articles?: any[];
    articleIds?: number[];
    type_articles?: string;
}
