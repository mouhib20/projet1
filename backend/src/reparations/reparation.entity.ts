import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Client } from '../clients/client.entity';
import { ReparationItem } from './reparation-item.entity';

@Entity('reparation')
export class Reparation {
    @PrimaryGeneratedColumn()
    id_reparation: number;

    @Column({ type: 'varchar', length: 255, nullable: true })
    appareil: string;

    @Column({ type: 'text', nullable: true })
    description: string; // Symptom or description

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    cout_main_oeuvre: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    prix: number; // Total price

    @Column({ type: 'varchar', length: 50, default: 'En attente' })
    statut: string;

    @Column({ type: 'date', nullable: true })
    date_reception: Date;

    @ManyToOne(() => Client, client => client.reparations, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'id_client' })
    client: Client;

    @OneToMany(() => ReparationItem, item => item.reparation, { cascade: true })
    items: ReparationItem[];
}
