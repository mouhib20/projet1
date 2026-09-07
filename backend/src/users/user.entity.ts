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
}
