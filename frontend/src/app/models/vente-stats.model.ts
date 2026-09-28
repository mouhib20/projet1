export interface VenteStatsDay {
    date: string;
    total: number;
}

export interface VenteStatsProduct {
    articleId: number;
    designation: string;
    qte: number;
    revenue: number;
}

export interface VenteStatsPiece {
    articleId: number;
    designation: string;
    marque: string | null;
    modele: string | null;
    qte: number;
    revenue?: number;
}

export type PeriodeStats = 'today' | 'week' | 'month' | 'year';

export interface VenteStats {
    period: PeriodeStats;
    /** Whether revenueByDay is bucketed per day ('jour') or per month ('mois', for the 'year' period). */
    granularite: 'jour' | 'mois';
    startDate: string;
    endDate: string;
    totalRevenue: number;
    totalTickets: number;
    avgBasket: number;
    totalCogs: number;
    estimatedProfit: number;
    growthPercent: number | null;
    revenueByDay: VenteStatsDay[];
    topProducts: VenteStatsProduct[];
    /** Parts used on repair tickets this period, most used first. */
    topPieces: VenteStatsPiece[];
    /** Accessories sold this period, most used first. */
    topAccessoires: VenteStatsPiece[];
    /** Repair lines (deposits and pickups) only, kept apart from articles sold. */
    reparations: {
        revenue: number;
        cout: number;
        benefice: number;
        /** Sum of the shortfall on repairs where the amount received was below the parts cost. */
        pertes: number;
    };
    /** Accessory articles sold, kept apart from repair parts and other articles. */
    accessoires: {
        revenue: number;
        cout: number;
        benefice: number;
    };
}
