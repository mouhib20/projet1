import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

/**
 * A store's suggestion to enrich the shared catalogue (a model/part combination it noticed is
 * missing). id_magasin here just records who suggested it, for the editors' review queue - it
 * does NOT make this row store-scoped data the way article/vente/etc. are.
 */
@Entity('compat_suggestion')
export class CompatSuggestion {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    id_magasin: number;

    @Column({ nullable: true })
    id_model: number | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    texte_libre: string | null;

    @Column({ nullable: true })
    id_part_type: number | null;

    @Column({ type: 'varchar', length: 20, default: 'en_attente' })
    statut: 'en_attente' | 'acceptee' | 'refusee';

    @Column({ nullable: true })
    cree_par: number | null;

    @CreateDateColumn()
    date_creation: Date;
}
