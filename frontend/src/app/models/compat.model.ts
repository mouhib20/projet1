export interface CompatEditor {
    id?: number;
    nom: string;
    username: string;
    password?: string;
    actif?: boolean;
}

export interface Brand {
    id: number;
    nom: string;
    logo?: string | null;
}

export interface DeviceModel {
    id: number;
    nom: string;
    nom_commercial?: string | null;
    code?: string | null;
    id_brand: number;
    marque: string;
}

export interface PartType {
    id: number;
    nom_fr: string;
    nom_en: string;
    nom_ar: string;
    categorie: 'part' | 'accessory';
}

export interface CompatGroupListItem {
    id: number;
    note: string | null;
    image: string | null;
    date_creation: string;
    id_part_type: number;
    nom_fr: string;
    nom_en: string;
    nom_ar: string;
    modeles: string[];
}

export interface CompatGroupDetail {
    id: number;
    note: string | null;
    image: string | null;
    id_part_type: number;
    modeleIds: number[];
}

export interface CompatGroupSave {
    id_part_type: number;
    modeleIds: number[];
    note?: string;
    image?: string;
}

export interface CompatSuggestion {
    id: number;
    id_magasin: number;
    magasin_nom: string | null;
    id_model: number | null;
    modele_nom: string | null;
    texte_libre: string | null;
    id_part_type: number | null;
    part_type_nom: string | null;
    statut: 'en_attente' | 'acceptee' | 'refusee';
    cree_par: number | null;
    cree_par_nom: string | null;
    date_creation: string;
}
