import { Client } from './client.model';

export interface Vente {
    id_vente?: number;
    designation: string;
    qte: number;
    prix: number;
    /** Cost of the parts for a repair line (no article). */
    cout?: number | string | null;
    date: Date | string;
    client?: Client;
    article?: any;
    clientId?: number;
    articleId?: number;
}
