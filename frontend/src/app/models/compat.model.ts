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
    image?: string | null;
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

export type CompatGroupStatut = 'confirmed' | 'needs_test';

export interface CompatGroupListItem {
    id: number;
    note: string | null;
    image: string | null;
    date_creation: string;
    id_part_type: number;
    nom_fr: string;
    nom_en: string;
    nom_ar: string;
    id_base_model: number | null;
    base_nom: string | null;
    base_marque: string | null;
    statut: CompatGroupStatut;
    modeles: string[];
}

export interface CompatGroupDetail {
    id: number;
    note: string | null;
    image: string | null;
    id_part_type: number;
    id_base_model: number | null;
    statut: CompatGroupStatut;
    modeleIds: number[];
}

export interface CompatGroupSave {
    id_part_type: number;
    id_base_model: number;
    modeleIds: number[];
    note?: string;
    image?: string;
    statut?: CompatGroupStatut;
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
