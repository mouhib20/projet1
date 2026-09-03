import { Entity, Column, PrimaryGeneratedColumn, OneToOne, JoinColumn } from 'typeorm';
import { MouvementAchat } from '../mouvements-achat/mouvement-achat.entity';

@Entity('stock')
export class Stock {
    @PrimaryGeneratedColumn()
    id_stock: number;

    @Column({ type: 'varchar', length: 150 })
    emplacement: string;

    @Column({ type: 'int', default: 0 })
    qte_restante: number;

    // The stock belongs to a specific purchase movement
    @OneToOne(() => MouvementAchat, mouvement => mouvement.stock, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'id_mouvement' })
    mouvement: MouvementAchat;
}
