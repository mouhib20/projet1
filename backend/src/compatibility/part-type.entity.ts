import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/** A kind of part (screen, battery, glass...), name in the app's three languages. Shared - no id_magasin. */
@Entity('part_type')
export class PartType {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 100 })
    nom_fr: string;

    @Column({ type: 'varchar', length: 100 })
    nom_en: string;

    @Column({ type: 'varchar', length: 100 })
    nom_ar: string;

    @Column({ type: 'varchar', length: 20, default: 'part' })
    categorie: 'part' | 'accessory';
}
