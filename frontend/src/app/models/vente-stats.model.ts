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
}
