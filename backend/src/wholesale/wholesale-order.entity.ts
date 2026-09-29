import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export type WholesaleOrderStatut = 'en_attente' | 'ajustee' | 'confirmee' | 'en_preparation' | 'envoyee' | 'recue' | 'annulee';

/**
 * A wholesale order placed by a store (id_magasin_demandeur) against the (single) wholesale
 * store's catalogue. Lines and status-change events live in wholesale_order_line/
 * wholesale_order_event - raw SQL only, no separate entities (same convention as
 * compat_group_model).
 */
@Entity('wholesale_order')
export class WholesaleOrder {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    id_magasin_demandeur: number;

    @Column({ type: 'varchar', length: 30, default: 'en_attente' })
    statut: WholesaleOrderStatut;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    total: number;

    @Column({ type: 'text', nullable: true })
    note: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    methode_reception: string | null;

    @Column({ nullable: true })
    cree_par: number | null;

    @CreateDateColumn()
    date_creation: Date;

    @Column({ type: 'timestamp', nullable: true })
    date_confirmation: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    date_envoi: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    date_reception: Date | null;
}
