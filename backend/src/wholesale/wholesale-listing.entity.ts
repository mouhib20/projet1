import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Article } from '../articles/article.entity';

/**
 * A wholesale store's article offered to every other store at a wholesale price. Shared
 * across every store by design (no id_magasin on the listing itself - it's reached through
 * id_article, which already belongs to the wholesale store).
 */
@Entity('wholesale_listing')
export class WholesaleListing {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    prix_gros: number;

    @Column({ type: 'int', default: 1 })
    qte_min: number;

    @Column({ default: true })
    visible: boolean;

    @ManyToOne(() => Article, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'id_article' })
    article: Article;
}
