import { Controller, Get, Post, Param, Body, Query, ParseIntPipe, Headers } from '@nestjs/common';
import { AdminAccessoriesAnalyticsService, Filtres, Periode } from './admin-accessories-analytics.service';

@Controller('admin-accessories-analytics')
export class AdminAccessoriesAnalyticsController {
    constructor(private readonly service: AdminAccessoriesAnalyticsService) { }

    private filtres(q: { periode?: string; dateDebut?: string; dateFin?: string; categorie?: string; marque?: string; wilaya?: string }): Filtres {
        return {
            periode: (q.periode as Periode) || 'month',
            dateDebut: q.dateDebut,
            dateFin: q.dateFin,
            categorie: q.categorie || undefined,
            marque: q.marque || undefined,
            wilaya: q.wilaya || undefined,
        };
    }

    @Get('resume')
    resume(@Query() q: any, @Headers('authorization') auth?: string) {
        return this.service.resume(this.filtres(q), auth);
    }

    @Get('top-produits')
    topProduits(@Query() q: any, @Headers('authorization') auth?: string) {
        return this.service.topProduits(this.filtres(q), auth);
    }

    @Get('top-produits/:id')
    detailProduit(@Param('id', ParseIntPipe) id: number, @Query() q: any, @Headers('authorization') auth?: string) {
        return this.service.detailProduit(id, this.filtres(q), auth);
    }

    @Get('fournisseurs')
    fournisseurs(@Query() q: any, @Headers('authorization') auth?: string) {
        return this.service.fournisseurs(this.filtres(q), auth);
    }

    @Get('recommandations-gros')
    recommandationsGros(@Query() q: any, @Headers('authorization') auth?: string) {
        return this.service.recommandationsGros(this.filtres(q), auth);
    }

    @Get('non-lies')
    nonLies(@Headers('authorization') auth?: string) {
        return this.service.nonLies(auth);
    }

    @Get('non-lies/:id/suggestions')
    suggestions(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.suggestionsPourArticle(id, auth);
    }

    @Post('non-lies/:id/lier')
    lier(@Param('id', ParseIntPipe) id: number, @Body() body: { id_produit?: number }, @Headers('authorization') auth?: string) {
        return this.service.lierArticle(id, body.id_produit, auth);
    }

    @Post('recalculer')
    recalculer(@Headers('authorization') auth?: string) {
        return this.service.recalculerResumeQuotidien(auth);
    }
}
