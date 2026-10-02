import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { MouvementAchat } from '../mouvements-achat/mouvement-achat.entity';


@Entity('article')
export class Article {
    @PrimaryGeneratedColumn()
    id_article: number;

    @Column({ type: 'varchar', length: 255 })
    designation: string;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    prix_achat: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, nullable: true })
    prix_vente: number;

    @Column({ type: 'varchar', length: 100, nullable: true })
    barcode: string;

    @Column({ type: 'varchar', length: 150, nullable: true })
    marque: string;

    @Column({ type: 'varchar', length: 150, nullable: true })
    modele: string;

    @Column({ type: 'varchar', length: 20, default: 'part', nullable: true })
    type: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    sous_categorie: string;

    @Column({ type: 'int', default: 0 })
    quantite: number;

    @Column({ type: 'int', default: 3, nullable: true })
    qte_min: number;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    image: string;

    @Column({ nullable: true })
    id_magasin: number;

    /** Optional link to the shared compatibility catalogue (compat_group.id) - see CompatibilityService. */
    @Column({ nullable: true })
    compat_group_id: number | null;

    /** Optional link to the shared accessory catalogue (accessoire_produit.id) - see
     *  AdminAccessoriesAnalyticsService. Accessory equivalent of compat_group_id, filled by that
     *  service's nightly auto-link pass or by a manual link, never by the article create/edit flow. */
    @Column({ nullable: true })
    accessoire_produit_id: number | null;

    /** Kept fresh by a DB trigger (set_updated_at) regardless of ORM or raw-SQL updates - drives the
     *  offline mode's incremental sync (ArticlesService.syncDepuis). */
    @Column({ type: 'timestamp' })
    updated_at: Date;

    @OneToMany(() => MouvementAchat, mouvement => mouvement.article)
    mouvements_achat: MouvementAchat[];
}
