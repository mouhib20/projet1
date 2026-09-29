import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type UserRole = 'super_admin' | 'admin' | 'vendeur' | 'vendeuse' | 'visiteur';

@Entity('utilisateurs')
export class Utilisateur {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    username: string;

    @Column()
    nom: string;

    @Column()
    password: string;

    @Column({ default: 'visiteur' })
    role: UserRole;

    @Column({ nullable: true })
    telephone: string | null;

    /** Login is refused as soon as this is false — checked on every request. */
    @Column({ default: true })
    actif: boolean;

    /**
     * Deprecated: superseded by id_magasin (kept in the DB, no longer read/written by the code).
     * Was: NULL for an owner/admin account; the owner's own id for every employee they created.
     */
    @Column({ nullable: true })
    id_proprietaire: number | null;

    /** Which store this account belongs to. NULL only for super_admin (not scoped to any store). */
    @Column({ nullable: true })
    id_magasin: number | null;
}
