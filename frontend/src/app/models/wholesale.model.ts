export interface WholesaleCatalogueEntry {
    id_listing: number;
    prix_gros: number;
    qte_min: number;
    id_article: number;
    designation: string;
    marque: string | null;
    modele: string | null;
    barcode: string | null;
    image: string | null;
    type: string | null;
    sous_categorie: string | null;
    quantite_disponible: number;
}

export type WholesaleOrderStatut = 'en_attente' | 'ajustee' | 'confirmee' | 'en_preparation' | 'envoyee' | 'recue' | 'annulee';

export interface WholesaleOrderLine {
    id: number;
    id_listing: number;
    qte_demandee: number;
    qte_confirmee: number | null;
    prix_unitaire: number;
    designation: string;
    marque: string | null;
    modele: string | null;
    image: string | null;
}

export interface WholesaleOrder {
    id: number;
    id_magasin_demandeur: number;
    magasin_nom: string;
    statut: WholesaleOrderStatut;
    total: number;
    note: string | null;
    methode_reception: string | null;
    date_creation: string;
    date_confirmation: string | null;
    date_envoi: string | null;
    date_reception: string | null;
    lignes: WholesaleOrderLine[];
}

export interface WholesaleOrderLineInput {
    id_listing: number;
    qte: number;
}

export interface WholesaleListing {
    id: number;
    prix_gros: number;
    qte_min: number;
    visible: boolean;
    id_article: number;
    designation: string;
    marque: string | null;
    modele: string | null;
    quantite: number;
    image: string | null;
}
