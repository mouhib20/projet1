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

    // ── Wholesale-editor side: independent role, checked internally (editeurRequis) —
    // no @RequirePermission here, same convention as CompatibilityController's editor routes
    // (compat_editor/wholesale_editor accounts have no store, so the department-permission
    // matrix doesn't apply to them at all).

    @Patch('orders/:id/confirm')
    confirmerCommande(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { lignes: { id_ligne: number; qte_confirmee: number }[] },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.confirmerCommande(id, body.lignes, auth);
    }

    @Patch('orders/:id/start-preparation')
    demarrerPreparation(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.demarrerPreparation(id, auth);
    }

    @Patch('orders/:id/send')
    envoyerCommande(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.envoyerCommande(id, auth);
    }

    @Get('listings')
    listerOffres(@Headers('authorization') auth?: string) {
        return this.service.listerOffres(auth);
    }

    @Post('listings')
    creerOffre(
        @Body() body: {
            designation: string; marque?: string; modele?: string; barcode?: string; image?: string;
            type?: string; sous_categorie?: string; quantite?: number; prix_gros: number; qte_min?: number;
        },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.creerOffre(body, auth);
    }

    @Put('listings/:id')
    modifierOffre(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: {
            designation?: string; marque?: string; modele?: string; barcode?: string; image?: string;
            type?: string; sous_categorie?: string; quantite?: number; prix_gros?: number; qte_min?: number; visible?: boolean;
        },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.modifierOffre(id, body, auth);
    }

    @Delete('listings/:id')
    supprimerOffre(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.supprimerOffre(id, auth);
    }

    // ── Wholesale-editor accounts (super_admin only, checked internally) ────────

    @Post('editors')
    creerEditeur(@Body() body: { nom: string; username: string; password: string }, @Headers('authorization') auth?: string) {
        return this.service.creerEditeur(body, auth);
    }

    @Get('editors')
    listerEditeurs(@Headers('authorization') auth?: string) {
        return this.service.listerEditeurs(auth);
    }

    @Patch('editors/:id/statut')
    suspendreEditeur(
        @Param('id', ParseIntPipe) id: number,
        @Body('actif') actif: boolean,
        @Headers('authorization') auth?: string,
    ) {
        return this.service.suspendreEditeur(id, actif, auth);
    }
}
