import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('magasin')
export class Magasin {
    @PrimaryGeneratedColumn()
    id_magasin: number;

    @Column()
    nom: string;

    @Column({ nullable: true })
    adresse: string | null;

    @Column({ nullable: true })
    telephone: string | null;

    /** Root-relative path, e.g. '/uploads/magasins/xxx.png' — same convention as Article.image. */
    @Column({ nullable: true })
    logo: string | null;

    /** Super Admin's on/off switch for the whole store (e.g. non-payment) — blocks every user of it. */
    @Column({ default: true })
    actif: boolean;

    /** The single store, if any, whose inventory is offered wholesale to every other store. */
    @Column({ default: false })
    est_grossiste: boolean;

    @CreateDateColumn()
    date_creation: Date;
}
