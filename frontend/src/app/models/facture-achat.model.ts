import { Fournisseur } from './fournisseur.model';

export interface MouvementAchat {
    id_mouvement?: number;
    qte: number;
    prix: number;
    date_mouvement?: Date;
    articleId: number;
    articleLabel?: string;
    article?: any;
}

export interface FactureItem {
    articleId: number | null;       // null = nouvel article
    isNew: boolean;                 // toggle: true = saisie libre
    designation: string;            // nom du nouvel article
    barcode: string;                // code barre
    qte: number;
    prix: number;                   // Prix d'achat
    prix_vente?: number;            // Prix de vente suggéré
    marque?: string;
    modele?: string;
    type?: string;
    image?: string;                 // chemin de l'image téléchargée
    tva_rate: number;               // TVA % (0, 7, 13, 19...)
    total_ttc: number;              // calculated: qte * prix * (1 + tva/100)
}

export interface FactureAchat {
    id_facture?: number;
    reference: string;
    date_facture: Date;
    total_ht: number;
    total_tva: number;
    remise: number;
    net_a_payer: number;
    montant_paye: number;
    reste_a_payer: number;
    fournisseurId?: number;
    fournisseur?: Fournisseur;
    mouvements_achat?: MouvementAchat[];
    items?: FactureItem[];
}
