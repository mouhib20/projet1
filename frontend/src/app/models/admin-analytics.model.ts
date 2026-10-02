export type AnalyticsPeriode = 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface AnalyticsFiltres {
    periode: AnalyticsPeriode;
    dateDebut?: string;
    dateFin?: string;
    idPartType?: number;
    idBrand?: number;
    wilaya?: string;
}

export interface TopPiece {
    id_group: number;
    id_part_type: number;
    nom_fr: string;
    nom_en: string;
    nom_ar: string;
    marque: string | null;
    modele: string | null;
    image: string | null;
    qte_vendue: number;
    qte_reparation: number;
    nb_magasins: number;
    prix_achat_moyen: number | null;
    prix_achat_min: number | null;
    prix_achat_max: number | null;
    prix_vente_moyen: number | null;
    prix_vente_min: number | null;
    prix_vente_max: number | null;
}

export interface EcranPiece extends TopPiece {
    nb_modeles_compatibles: number;
}

export interface FournisseurLigne {
    telephone: string;
    nom: string;
    id_group: number;
    nom_fr: string;
    nom_en: string;
    nom_ar: string;
    marque: string | null;
    modele: string | null;
    prix_moyen: number;
    nb_magasins: number;
    derniere_date: string;
    moins_cher: boolean;
}

export interface RecommandationGros {
    id_group: number;
    nom_fr: string;
    nom_en: string;
    nom_ar: string;
    marque: string | null;
    modele: string | null;
    image: string | null;
    qte_vendue: number;
    qte_reparation: number;
    nb_magasins: number;
    nb_recherches_sans_stock: number;
    nb_magasins_demande: number;
    nb_modeles_compatibles: number;
    quantite_suggeree_mois: number;
    prix_vente_moyen: number | null;
    moins_cher_fournisseur: { telephone: string; nom: string; prix_moyen: number } | null;
    score: number;
}

export interface DetailPieceMois {
    mois: string;
    qte_vendue: number;
    qte_reparation: number;
    nb_magasins: number;
}

export interface DetailPiece {
    parMois: DetailPieceMois[];
    fournisseurs: { telephone: string; nom: string; prix_moyen: number; nb_magasins: number; derniere_date: string }[];
}
