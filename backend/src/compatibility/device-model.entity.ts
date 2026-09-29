import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Brand } from './brand.entity';

/** A device model (e.g. Galaxy A03s). Shared across every store - no id_magasin. */
@Entity('device_model')
export class DeviceModel {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 150 })
    nom: string;

    @Column({ type: 'varchar', length: 150, nullable: true })
    nom_commercial: string | null;

    /** Manufacturer reference code (e.g. SM-A025F) - makes search precise even across renamed models. */
    @Column({ type: 'varchar', length: 100, nullable: true })
    code: string | null;

    @ManyToOne(() => Brand, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'id_brand' })
    brand: Brand;
}
