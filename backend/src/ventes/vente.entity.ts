import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Client } from '../clients/client.entity';
import { Article } from '../articles/article.entity';

@Entity('vente')
export class Vente {
    @PrimaryGeneratedColumn()
    id_vente: number;

    @Column({ type: 'varchar', length: 255, nullable: true })
    designation: string;

    @Column({ type: 'int', default: 1 })
    qte: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    prix: number;

    @Column({ type: 'date' })
    date: Date;

    /** Cost of the parts for a line without article (repairs); articles use their own purchase price. */
    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    cout: number | null;

    @ManyToOne(() => Client, client => client.ventes, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'id_client' })
    client: Client;

    @ManyToOne(() => Article, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'id_article' })
    article: Article;
}
