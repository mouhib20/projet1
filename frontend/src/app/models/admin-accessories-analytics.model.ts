export type AccAnalyticsPeriode = 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface AccAnalyticsFiltres {
    periode: AccAnalyticsPeriode;
    dateDebut?: string;
    dateFin?: string;
    categorie?: string;
    marque?: string;
    wilaya?: string;
}

export interface FournisseurResume {
    telephone: string;
    nom: string;
    prix_moyen: number;
}

export interface TopProduitAccessoire {
    id_produit: number;
    categorie: string;
    marque: string | null;
    nom: string;
    barcode: string | null;
    image: string | null;
    qte_vendue: number;
    nb_magasins: number;
    revenus: number;
    profit: number;
    marge_pct: number | null;
    prix_achat_moyen: number | null;
    prix_achat_min: number | null;
    prix_achat_max: number | null;
    prix_vente_moyen: number | null;
    prix_vente_min: number | null;
    prix_vente_max: number | null;
    moins_cher_fournisseur: FournisseurResume | null;
}

export interface CategorieResume {
    categorie: string;
    qte_vendue: number;
    revenus: number;
    profit: number;
    marge_pct: number | null;
    meilleur_produit: { nom: string; marque: string | null; qte_vendue: number } | null;
}

export interface ResumeAccessoires {
    parCategorie: CategorieResume[];
    top10Qte: TopProduitAccessoire[];
    top10Profit: TopProduitAccessoire[];
}

export interface FournisseurLigneAccessoire {
    telephone: string;
    nom: string;
    id_produit: number;
    categorie: string;
    marque: string | null;
    nom_produit: string;
    prix_moyen: number;
    nb_magasins: number;
    derniere_date: string;
    moins_cher: boolean;
}

export interface RecommandationGrosAccessoire {
    id_produit: number;
    categorie: string;
    marque: string | null;
    nom: string;
    image: string | null;
    qte_vendue: number;
    nb_magasins: number;
    marge_pct: number | null;
    jours_rupture: number;
    tendance: 'hausse' | 'baisse' | 'stable';
    quantite_suggeree_mois: number;
    prix_vente_moyen: number | null;
    moins_cher_fournisseur: FournisseurResume | null;
    score: number;
}

export interface ArticleNonLie {
    id_article: number;
    designation: string;
    marque: string | null;
    sous_categorie: string;
    barcode: string | null;
    image: string | null;
    id_magasin: number;
}

export interface SuggestionProduit {
    id: number;
    categorie: string;
    marque: string | null;
    nom: string;
    barcode: string | null;
    image: string | null;
}

export interface DetailProduitAccessoire {
    parMois: { mois: string; qte_vendue: number; nb_magasins: number }[];
    fournisseurs: { telephone: string; nom: string; prix_moyen: number; nb_magasins: number; derniere_date: string }[];
}
