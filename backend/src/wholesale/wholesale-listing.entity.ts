import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A product offered by the wholesale portal at a wholesale price. Fully standalone - no store
 * owns it (the wholesale_editor account that manages it has no id_magasin either, same as
 * compat_editor's Brand/DeviceModel) - so the row IS the product, not a price wrapper around an
 * existing store's Article.
 */
@Entity('wholesale_listing')
export class WholesaleListing {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ default: '' })
    designation: string;

    @Column({ nullable: true })
    marque: string | null;

    @Column({ nullable: true })
    modele: string | null;

    @Column({ nullable: true })
    barcode: string | null;

    @Column({ nullable: true })
    image: string | null;

    @Column({ nullable: true })
    type: string | null;

    @Column({ nullable: true })
    sous_categorie: string | null;

    @Column({ type: 'int', default: 0 })
    quantite: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    prix_gros: number;

    @Column({ type: 'int', default: 1 })
    qte_min: number;

    @Column({ default: true })
    visible: boolean;
}
