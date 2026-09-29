import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Vente } from '../ventes/vente.entity';
import { Reparation } from '../reparations/reparation.entity';

@Entity('client')
export class Client {
    @PrimaryGeneratedColumn()
    id_client: number;

    @Column({ type: 'varchar', length: 255 })
    nom: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    telephone: string;

    // Solde créditeur : argent déposé par le client, utilisable sur ses futurs achats
    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    solde: number;

    @Column({ nullable: true })
    id_magasin: number;

    /** Kept fresh by a DB trigger (set_updated_at) - drives the offline mode's incremental sync. */
    @Column({ type: 'timestamp' })
    updated_at: Date;

    @OneToMany(() => Vente, vente => vente.client)
    ventes: Vente[];

    @OneToMany(() => Reparation, reparation => reparation.client)
    reparations: Reparation[];
}
