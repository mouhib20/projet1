import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/** The seven departments an employee's access can be granted on. */
export type Departement = 'ventes' | 'stock' | 'reparation' | 'fournisseurs' | 'charges' | 'clients' | 'rapports';

export const DEPARTEMENTS: Departement[] = ['ventes', 'stock', 'reparation', 'fournisseurs', 'charges', 'clients', 'rapports'];

@Entity('permission')
@Index(['id_utilisateur', 'departement'], { unique: true })
export class Permission {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    id_utilisateur: number;

    @Column({ length: 20 })
    departement: Departement;

    @Column({ default: false })
    peut_voir: boolean;

    @Column({ default: false })
    peut_ajouter: boolean;

    @Column({ default: false })
    peut_modifier: boolean;

    @Column({ default: false })
    peut_supprimer: boolean;
}
