export interface Product {
    id: number;
    name: string;
    description?: string;
    price: number;
    createdAt?: Date;

    // GSM Inventory fields
    barcode?: string;
    part_brand?: string;
    part_model?: string;
    quantity?: number;
    purchase_price?: number;
    type?: 'part' | 'accessory';
    sub_category?: string;
    min_quantity?: number;
    status?: string;
}
