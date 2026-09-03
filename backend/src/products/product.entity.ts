import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('products')
export class ProductEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 })
    price: number;

    @Column({ type: 'varchar', length: 100, nullable: true })
    barcode: string;

    @Column({ type: 'varchar', length: 150, nullable: true })
    part_brand: string;

    @Column({ type: 'varchar', length: 150, nullable: true })
    part_model: string;

    @Column({ type: 'int', default: 0 })
    quantity: number;

    @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 })
    purchase_price: number;

    @Column({ type: 'varchar', length: 20, default: 'part' })
    type: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    sub_category: string;

    @Column({ type: 'int', default: 3 })
    min_quantity: number;

    @CreateDateColumn()
    createdAt: Date;
}
