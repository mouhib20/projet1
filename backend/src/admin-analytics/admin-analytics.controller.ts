import { Controller, Get, Post, Param, Query, ParseIntPipe, Headers } from '@nestjs/common';
import { AdminAnalyticsService, Filtres, Periode } from './admin-analytics.service';

@Controller('admin-analytics')
export class AdminAnalyticsController {
    constructor(private readonly service: AdminAnalyticsService) { }

    private filtres(q: { periode?: string; dateDebut?: string; dateFin?: string; idPartType?: string; idBrand?: string; wilaya?: string }): Filtres {
        return {
            periode: (q.periode as Periode) || 'month',
            dateDebut: q.dateDebut,
            dateFin: q.dateFin,
            idPartType: q.idPartType ? Number(q.idPartType) : undefined,
            idBrand: q.idBrand ? Number(q.idBrand) : undefined,
            wilaya: q.wilaya || undefined,
        };
    }

    @Get('top-pieces')
    topPieces(@Query() q: any, @Headers('authorization') auth?: string) {
        return this.service.topPieces(this.filtres(q), auth);
    }

    @Get('top-pieces/:id')
    detailPiece(@Param('id', ParseIntPipe) id: number, @Query() q: any, @Headers('authorization') auth?: string) {
        return this.service.detailPiece(id, this.filtres(q), auth);
    }

    @Get('ecrans')
    ecrans(@Query() q: any, @Headers('authorization') auth?: string) {
        return this.service.ecrans(this.filtres(q), auth);
    }

    @Get('fournisseurs')
    fournisseurs(@Query() q: any, @Headers('authorization') auth?: string) {
        return this.service.fournisseurs(this.filtres(q), auth);
    }

    @Get('recommandations-gros')
    recommandationsGros(@Query() q: any, @Headers('authorization') auth?: string) {
        return this.service.recommandationsGros(this.filtres(q), auth);
    }

    @Post('recalculer')
    recalculer(@Headers('authorization') auth?: string) {
        return this.service.recalculerResumeQuotidien(auth);
    }
}
