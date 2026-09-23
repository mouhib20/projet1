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

export interface VenteStats {
    days: number;
    startDate: string;
    endDate: string;
    totalRevenue: number;
    totalTickets: number;
    avgBasket: number;
    estimatedProfit: number;
    growthPercent: number | null;
    revenueByDay: VenteStatsDay[];
    topProducts: VenteStatsProduct[];
}
