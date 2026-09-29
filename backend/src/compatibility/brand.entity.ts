import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/** A device manufacturer (Samsung, Apple...). Shared across every store - no id_magasin. */
@Entity('brand')
export class Brand {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 150 })
    nom: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    logo: string | null;
}
