import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('charge')
export class Charge {
    @PrimaryGeneratedColumn()
    id_charge: number;

    @Column({ type: 'varchar', length: 255 })
    description: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    montant: number;

    @Column({ type: 'date' })
    date_charge: Date;
}
