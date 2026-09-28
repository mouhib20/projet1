import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission, Departement, DEPARTEMENTS } from './permission.entity';
import { PermissionAction } from './require-permission.decorator';

export type PermissionEntry = { voir: boolean; ajouter: boolean; modifier: boolean; supprimer: boolean };
export type PermissionMatrix = Record<Departement, PermissionEntry>;

const VIDE: PermissionEntry = { voir: false, ajouter: false, modifier: false, supprimer: false };

@Injectable()
export class PermissionsService {
    constructor(
        @InjectRepository(Permission)
        private readonly repo: Repository<Permission>,
    ) { }

    /** Full 7-department matrix for one user, missing departments filled with all-false. */
    async getMatrix(id_utilisateur: number): Promise<PermissionMatrix> {
        const lignes = await this.repo.find({ where: { id_utilisateur } });
        const matrix = {} as PermissionMatrix;
        for (const dep of DEPARTEMENTS) {
            const ligne = lignes.find((l) => l.departement === dep);
            matrix[dep] = ligne
                ? { voir: ligne.peut_voir, ajouter: ligne.peut_ajouter, modifier: ligne.peut_modifier, supprimer: ligne.peut_supprimer }
                : { ...VIDE };
        }
        return matrix;
    }

    /** Replaces the full matrix for one employee (upsert per department). */
    async setMatrix(id_utilisateur: number, matrix: Partial<Record<Departement, Partial<PermissionEntry>>>): Promise<PermissionMatrix> {
        for (const dep of DEPARTEMENTS) {
            const entry = matrix[dep] || {};
            const existante = await this.repo.findOne({ where: { id_utilisateur, departement: dep } });
            const valeurs = {
                id_utilisateur,
                departement: dep,
                peut_voir: !!entry.voir,
                peut_ajouter: !!entry.ajouter,
                peut_modifier: !!entry.modifier,
                peut_supprimer: !!entry.supprimer,
            };
            if (existante) await this.repo.update(existante.id, valeurs);
            else await this.repo.save(this.repo.create(valeurs));
        }
        return this.getMatrix(id_utilisateur);
    }

    /**
     * Whether a user may perform `action` on `departement`.
     * Backward compatibility: a user with NO permission rows at all (every account that existed
     * before this feature — the seeded admin, or any vendeur/vendeuse/visiteur account) keeps
     * behaving exactly like today: reads are open, writes are blocked only for 'visiteur'.
     * Only employees created through this feature (who always have rows, even if all false)
     * are checked strictly against their granted matrix.
     */
    async can(id_utilisateur: number, role: string, departement: Departement, action: PermissionAction): Promise<boolean> {
        const lignes = await this.repo.find({ where: { id_utilisateur } });
        if (lignes.length === 0) {
            return action === 'voir' ? true : role !== 'visiteur';
        }
        const ligne = lignes.find((l) => l.departement === departement);
        if (!ligne) return false;
        if (action === 'voir') return ligne.peut_voir;
        if (action === 'ajouter') return ligne.peut_ajouter;
        if (action === 'modifier') return ligne.peut_modifier;
        return ligne.peut_supprimer;
    }
}
