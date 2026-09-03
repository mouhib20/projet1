import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { Article } from '../articles/article.entity';
import { Fournisseur } from '../fournisseurs/fournisseur.entity';
import { Stock } from '../stocks/stock.entity';
import { FactureAchat } from '../factures-achat/facture-achat.entity';

@Entity('mouvement_achat')
export class MouvementAchat {
    @PrimaryGeneratedColumn()
    id_mouvement: number;

    @Column({ type: 'int' })
    qte: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    prix: number;

    @Column({ type: 'date' })
    date_mouvement: Date;

    @ManyToOne(() => Article, article => article.mouvements_achat, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'id_article' })
    article: Article;

    @ManyToOne(() => Fournisseur, fournisseur => fournisseur.mouvements_achat, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'id_fournisseur' })
    fournisseur: Fournisseur;

    @OneToOne(() => Stock, stock => stock.mouvement)
    stock: Stock;

    @ManyToOne(() => FactureAchat, facture => facture.mouvements_achat, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'id_facture' })
    facture_achat: FactureAchat;
}
