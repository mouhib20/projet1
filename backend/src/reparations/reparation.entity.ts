import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Client } from '../clients/client.entity';

@Entity('reparation')
export class Reparation {
    @PrimaryGeneratedColumn()
    id_reparation: number;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description: string;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    prix: number;

    @Column({ type: 'varchar', length: 50, nullable: true })
    statut: string;

    @Column({ type: 'date', nullable: true })
    date_reception: Date;

    @ManyToOne(() => Client, client => client.reparations, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'id_client' })
    client: Client;
}
