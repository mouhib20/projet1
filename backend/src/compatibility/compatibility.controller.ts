import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, ParseIntPipe, Headers } from '@nestjs/common';
import { CompatibilityService } from './compatibility.service';
import { RequirePermission } from '../permissions/require-permission.decorator';

@Controller('compat')
export class CompatibilityController {
    constructor(private readonly service: CompatibilityService) { }

    // ── Search: any store user with 'compatibilite' view/add permission ──

    @Get('search')
    @RequirePermission('compatibilite', 'voir')
    rechercheModeles(@Query('q') q: string) {
        return this.service.rechercheModeles(q);
    }

    @Get('models/:id/parts')
    @RequirePermission('compatibilite', 'voir')
    piecesPourModele(@Param('id', ParseIntPipe) id: number) {
        return this.service.piecesPourModele(id);
    }

    @Post('suggestions')
    @RequirePermission('compatibilite', 'ajouter')
    creerSuggestion(
        @Body() body: { id_model?: number; texte_libre?: string; id_part_type?: number },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.creerSuggestion(body, auth);
    }

    // ── Groups: compat_editor / super_admin (checked inside the service) ──

    @Post('groups')
    creerGroupe(
        @Body() body: { id_part_type: number; modeleIds: number[]; note?: string; image?: string },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.creerGroupe(body, auth);
    }

    @Put('groups/:id')
    modifierGroupe(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { id_part_type?: number; modeleIds?: number[]; note?: string; image?: string },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.modifierGroupe(id, body, auth);
    }

    @Delete('groups/:id')
    supprimerGroupe(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.supprimerGroupe(id, auth);
    }

    // ── Suggestions review: compat_editor / super_admin ──

    @Get('suggestions')
    listerSuggestions(@Headers('authorization') auth?: string) {
        return this.service.listerSuggestions(auth);
    }

    @Patch('suggestions/:id')
    traiterSuggestion(
        @Param('id', ParseIntPipe) id: number,
        @Body('statut') statut: 'acceptee' | 'refusee',
        @Headers('authorization') auth?: string,
    ) {
        return this.service.traiterSuggestion(id, statut, auth);
    }

    // ── Compat-editor accounts: super_admin only ──

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
        return this.service.suspendreEditeur(id, !!actif, auth);
    }
}
