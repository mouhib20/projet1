import { Departement } from '../services/auth.service';

export interface Magasin {
    id_magasin?: number;
    nom: string;
    adresse?: string | null;
    telephone?: string | null;
    logo?: string | null;
    actif?: boolean;
    est_grossiste?: boolean;
    date_creation?: string;
}

/** Store + owner created together, in one step (matches the backend's MagasinsService.create). */
export interface MagasinCreate {
    nom: string;
    adresse?: string;
    telephone?: string;
    ownerNom: string;
    ownerTelephone?: string;
    ownerUsername: string;
    ownerPassword: string;
}

export type MagasinModulesMatrix = Partial<Record<Departement, boolean>>;
