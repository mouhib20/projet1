import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { PartType } from './part-type.entity';

/**
 * A compatibility group: one physical part (e.g. "Écran A02s") that fits a set of device
 * models (linked via the compat_group_model join table, raw SQL - see CompatibilityService).
 * Shared across every store - no id_magasin, by design (the shared reference catalogue).
 */
@Entity('compat_group')
export class CompatGroup {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'text', nullable: true })
    note: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    image: string | null;

    @Column({ nullable: true })
    cree_par: number | null;

    @CreateDateColumn()
    date_creation: Date;

    @ManyToOne(() => PartType, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'id_part_type' })
    partType: PartType;
}
