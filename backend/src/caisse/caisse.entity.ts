import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('caisse_cloture')
export class CaisseCloture {
    @PrimaryGeneratedColumn()
    id_cloture: number;

    @Column({ type: 'date', unique: true })
    date: string;

    // "Jour d'appel" — total des ventes du jour, calculé à la fermeture
    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    total_ventes: number;

    // Montant réellement compté en caisse, saisi plus tard (souvent le lendemain)
    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    montant_compte: number;

    @Column({ type: 'date', nullable: true })
    date_comptage: string;
}
