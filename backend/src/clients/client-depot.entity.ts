import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Client } from './client.entity';

@Entity('client_depot')
export class ClientDepot {
    @PrimaryGeneratedColumn()
    id_depot: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    montant: number;

    @Column({ type: 'date' })
    date: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    note: string;

    @ManyToOne(() => Client, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'id_client' })
    client: Client;
}
