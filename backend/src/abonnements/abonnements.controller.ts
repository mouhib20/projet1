import { Controller, Get, Put, Post, Param, Body, ParseIntPipe, Headers } from '@nestjs/common';
import { AbonnementsService } from './abonnements.service';
import { Departement } from '../permissions/permission.entity';

@Controller('abonnements')
export class AbonnementsController {
    constructor(private readonly service: AbonnementsService) { }

    @Get('parametres')
    obtenirParametres(@Headers('authorization') auth?: string) {
        return this.service.obtenirParametres(auth);
    }

    @Put('parametres')
    modifierParametres(@Body() body: { prix_base_annuel?: number; duree_essai_jours?: number; duree_grace_jours?: number }, @Headers('authorization') auth?: string) {
        return this.service.modifierParametres(body, auth);
    }

    @Put('parametres/sections/:departement')
    modifierPrixSection(@Param('departement') departement: Departement, @Body() body: { prix_annuel: number | null }, @Headers('authorization') auth?: string) {
        return this.service.modifierPrixSection(departement, body.prix_annuel, auth);
    }

    @Get('resume')
    resumeFinancier(@Headers('authorization') auth?: string) {
        return this.service.resumeFinancier(auth);
    }

    @Get()
    listerAbonnements(@Headers('authorization') auth?: string) {
        return this.service.listerAbonnements(auth);
    }

    @Get(':idMagasin')
    obtenirAbonnement(@Param('idMagasin', ParseIntPipe) idMagasin: number, @Headers('authorization') auth?: string) {
        return this.service.obtenirAbonnement(idMagasin, auth);
    }

    @Post(':idMagasin/paiement')
    enregistrerPaiement(
        @Param('idMagasin', ParseIntPipe) idMagasin: number,
        @Body() body: { montant: number; methode: string; reference?: string; date_paiement: string; note?: string; sections: Departement[] },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.enregistrerPaiement(idMagasin, body, auth);
    }

    @Post(':idMagasin/prolonger-essai')
    prolongerEssai(@Param('idMagasin', ParseIntPipe) idMagasin: number, @Body() body: { jours: number; raison: string }, @Headers('authorization') auth?: string) {
        return this.service.prolongerEssai(idMagasin, body.jours, body.raison, auth);
    }

    @Post(':idMagasin/prolonger')
    prolongerAbonnement(@Param('idMagasin', ParseIntPipe) idMagasin: number, @Body() body: { jours: number; raison: string }, @Headers('authorization') auth?: string) {
        return this.service.prolongerAbonnement(idMagasin, body.jours, body.raison, auth);
    }

    @Post(':idMagasin/suspendre')
    suspendre(@Param('idMagasin', ParseIntPipe) idMagasin: number, @Body() body: { raison: string }, @Headers('authorization') auth?: string) {
        return this.service.suspendre(idMagasin, body.raison, auth);
    }

    @Post(':idMagasin/reactiver')
    reactiver(@Param('idMagasin', ParseIntPipe) idMagasin: number, @Body() body: { raison: string }, @Headers('authorization') auth?: string) {
        return this.service.reactiver(idMagasin, body.raison, auth);
    }

    @Put(':idMagasin/reduction')
    changerReduction(@Param('idMagasin', ParseIntPipe) idMagasin: number, @Body() body: { montant?: number | null; pourcentage?: number | null; raison: string }, @Headers('authorization') auth?: string) {
        return this.service.changerReduction(idMagasin, body, auth);
    }
}
