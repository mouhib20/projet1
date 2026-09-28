import { UserRole, PermissionMatrix } from '../services/auth.service';

export interface Employee {
    id?: number;
    nom: string;
    telephone?: string | null;
    username: string;
    password?: string;
    role?: UserRole;
    actif?: boolean;
    id_proprietaire?: number | null;
}

export type { PermissionMatrix };
