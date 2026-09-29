import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, ParseIntPipe, Headers } from '@nestjs/common';
import { WholesaleService } from './wholesale.service';
import { RequirePermission } from '../permissions/require-permission.decorator';

@Controller('wholesale')
export class WholesaleController {
    constructor(private readonly service: WholesaleService) { }

    // ── Catalogue & customer-side orders: any store with 'wholesale' permission ──

    @Get('catalog')
    @RequirePermission('wholesale', 'voir')
    getCatalogue(@Query('q') q?: string) {
        return this.service.getCatalogue(q);
    }

    @Post('orders')
    @RequirePermission('wholesale', 'ajouter')
    creerCommande(
        @Body() body: { lignes: { id_listing: number; qte: number }[]; note?: string; methode_reception?: string },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.creerCommande(body, auth);
    }

    @Get('orders')
    @RequirePermission('wholesale', 'voir')
    listerCommandes(@Headers('authorization') auth?: string) {
        return this.service.listerCommandes(auth);
    }

    @Patch('orders/:id/accept-adjustment')
    @RequirePermission('wholesale', 'ajouter')
    accepterAjustement(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.accepterAjustement(id, auth);
    }

    @Patch('orders/:id/cancel')
    @RequirePermission('wholesale', 'ajouter')
    annulerCommande(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.annulerCommande(id, auth);
    }

    @Patch('orders/:id/receive')
    @RequirePermission('wholesale', 'ajouter')
    confirmerReception(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.confirmerReception(id, auth);
    }

    // ── Wholesale store's own side: identity checked internally (estMagasinGrossisteRequis) ──

    @Patch('orders/:id/confirm')
    @RequirePermission('wholesale', 'ajouter')
    confirmerCommande(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { lignes: { id_ligne: number; qte_confirmee: number }[] },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.confirmerCommande(id, body.lignes, auth);
    }

    @Patch('orders/:id/start-preparation')
    @RequirePermission('wholesale', 'ajouter')
    demarrerPreparation(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.demarrerPreparation(id, auth);
    }

    @Patch('orders/:id/send')
    @RequirePermission('wholesale', 'ajouter')
    envoyerCommande(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.envoyerCommande(id, auth);
    }

    @Get('listings')
    @RequirePermission('wholesale', 'ajouter')
    listerOffres(@Headers('authorization') auth?: string) {
        return this.service.listerOffres(auth);
    }

    @Post('listings')
    @RequirePermission('wholesale', 'ajouter')
    creerOffre(
        @Body() body: { id_article: number; prix_gros: number; qte_min?: number },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.creerOffre(body, auth);
    }

    @Put('listings/:id')
    @RequirePermission('wholesale', 'modifier')
    modifierOffre(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { prix_gros?: number; qte_min?: number; visible?: boolean },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.modifierOffre(id, body, auth);
    }

    @Delete('listings/:id')
    @RequirePermission('wholesale', 'supprimer')
    supprimerOffre(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.supprimerOffre(id, auth);
    }
}
