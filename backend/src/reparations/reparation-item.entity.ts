import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Reparation } from './reparation.entity';
import { Article } from '../articles/article.entity';

@Entity('reparation_item')
export class ReparationItem {
    @PrimaryGeneratedColumn()
    id_reparation_item: number;

    @Column({ type: 'int', default: 1 })
    qte: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    prix: number; // Selling price for this part in the repair

    @ManyToOne(() => Reparation, reparation => reparation.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'id_reparation' })
    reparation: Reparation;

    @ManyToOne(() => Article, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'id_article' })
    article: Article;
}
