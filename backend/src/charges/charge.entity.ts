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

    // Dépense du jour (café, transport…) ou charge mensuelle fixe (loyer, salaires…)
    @Column({ type: 'varchar', length: 12, default: 'mensuelle' })
    type_depense: 'mensuelle' | 'journaliere';

    // Payée en espèces avec l'argent de la caisse: la sortie est alors enregistrée dans la caisse
    @Column({ type: 'boolean', default: false })
    paye_caisse: boolean;
}
