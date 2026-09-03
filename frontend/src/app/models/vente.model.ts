import { Client } from './client.model';

export interface Vente {
    id_vente?: number;
    designation: string;
    qte: number;
    prix: number;
    date: Date | string;
    client?: Client;
    article?: any;
    clientId?: number;
    articleId?: number;
}
