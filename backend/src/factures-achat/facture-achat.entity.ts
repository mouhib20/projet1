import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Fournisseur } from '../fournisseurs/fournisseur.entity';
import { MouvementAchat } from '../mouvements-achat/mouvement-achat.entity';

@Entity('facture_achat')
export class FactureAchat {
    @PrimaryGeneratedColumn()
    id_facture: number;

    @Column({ type: 'varchar', length: 150 })
    reference: string;

    @Column({ type: 'date' })
    date_facture: Date;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    total_ht: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    total_tva: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    remise: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    net_a_payer: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    montant_paye: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    reste_a_payer: number;

    @ManyToOne(() => Fournisseur, fournisseur => fournisseur.factures_achat, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'id_fournisseur' })
    fournisseur: Fournisseur;

    @OneToMany(() => MouvementAchat, mouvement => mouvement.facture_achat)
    mouvements_achat: MouvementAchat[];
}
