import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { MouvementAchat } from '../mouvements-achat/mouvement-achat.entity';
import { FactureAchat } from '../factures-achat/facture-achat.entity';


@Entity('fournisseur')
export class Fournisseur {
    @PrimaryGeneratedColumn()
    id_fournisseur: number;

    @Column({ type: 'varchar', length: 255 })
    nom: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    prenom: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    tel: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    entreprise: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    adresse: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    matricule_fiscal: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    rib: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    type_articles: string;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    solde: number;

    @OneToMany(() => MouvementAchat, mouvement => mouvement.fournisseur)
    mouvements_achat: MouvementAchat[];

    @OneToMany(() => FactureAchat, facture => facture.fournisseur)
    factures_achat: FactureAchat[];
}
