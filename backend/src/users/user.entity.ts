import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type UserRole = 'admin' | 'vendeur' | 'vendeuse' | 'visiteur';

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

    /** NULL for an owner/admin account; set to the owner's own id for every employee they create. */
    @Column({ nullable: true })
    id_proprietaire: number | null;
}
