export interface ImportEmployee {
    id?: number;
    nom: string;
    username: string;
    password?: string;
    actif?: boolean;
}

export interface MarquePreviewRow {
    cleModele: string;
    marque: string;
    modele: string;
    code: string | null;
    statut: 'new' | 'existing' | 'error';
    aUneImage: boolean;
    thumbnail: string | null;
    erreur?: string;
}

export interface MarqueSummary {
    marque: string;
    nouveaux: number;
    existants: number;
    sansImage: number;
    erreurs: number;
}

export interface BrandsModelsPreview {
    importId: string;
    marques: MarqueSummary[];
    modeles: MarquePreviewRow[];
    erreursFichier: string[];
}

export interface BrandsModelsSelections {
    marquesExclues?: string[];
    modelesExclus?: string[];
}

export interface BrandsModelsResult {
    ajoutes: number;
    misAJour: number;
    ignores: number;
    erreurs: { marque: string; message: string }[];
}

export interface CompatGroupPreviewRow {
    cleGroupe: string;
    partTypeKey: string;
    statutPropose: 'confirmed' | 'needs_test';
    modeles: { brand: string; nom: string; code: string | null; trouve: boolean }[];
    action: 'create' | 'merge' | 'none';
    fusionAvecGroupeId?: number;
    fusionAvecModeles?: string[];
}

export interface CompatTypeSummary {
    partTypeKey: string;
    nouveaux: number;
    aFusionner: number;
    modelesIntrouvables: number;
}

export interface CompatibilitiesPreview {
    importId: string;
    types: CompatTypeSummary[];
    groupes: CompatGroupPreviewRow[];
}

export interface CompatibilitiesSelections {
    groupesExclus?: string[];
    fusionsConfirmees?: string[];
}

export interface CompatibilitiesResult {
    crees: number;
    fusionnes: number;
    ignores: number;
    modelesIntrouvables: number;
}

export const PART_TYPE_KEYS = ['display', 'battery', 'glass', 'vitre', 'coque'] as const;
export type PartTypeKey = typeof PART_TYPE_KEYS[number];
