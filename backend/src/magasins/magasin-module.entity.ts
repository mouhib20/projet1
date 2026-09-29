import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { Departement } from '../permissions/permission.entity';

/** Per-store, per-department on/off switch — Super Admin's lever over what a store can access at all. */
@Entity('magasin_module')
@Index(['id_magasin', 'departement'], { unique: true })
export class MagasinModule {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    id_magasin: number;

    @Column({ length: 20 })
    departement: Departement;

    @Column({ default: true })
    actif: boolean;
}
