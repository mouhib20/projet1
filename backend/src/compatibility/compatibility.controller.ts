import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, ParseIntPipe, Headers, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { promises as fs } from 'fs';
import { CompatibilityService } from './compatibility.service';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { imageUploadOptions } from '../common/image-upload.util';

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

    @Get('groups/:id/models')
    @RequirePermission('compatibilite', 'voir')
    modelesPourGroupe(@Param('id', ParseIntPipe) id: number) {
        return this.service.modelesPourGroupe(id);
    }

    @Get('search/part-types')
    @RequirePermission('compatibilite', 'voir')
    listerTypesPiecesRecherche() {
        return this.service.listerTypesPiecesRecherche();
    }

    @Get('search/brands')
    @RequirePermission('compatibilite', 'voir')
    listerMarquesRecherche() {
        return this.service.listerMarquesRecherche();
    }

    @Get('search/models')
    @RequirePermission('compatibilite', 'voir')
    listerModelesParMarqueRecherche(@Query('id_brand', ParseIntPipe) idBrand: number) {
        return this.service.listerModelesParMarqueRecherche(idBrand);
    }

    @Get('search/resolve-group')
    @RequirePermission('compatibilite', 'voir')
    resolveGroupeRecherche(@Query('id_model', ParseIntPipe) idModel: number, @Query('id_part_type', ParseIntPipe) idPartType: number) {
        return this.service.resolveGroupeRecherche(idModel, idPartType);
    }

    @Get('search/auto-resolve')
    @RequirePermission('compatibilite', 'voir')
    autoResolveGroupeRecherche(@Query('type') type: string, @Query('marque') marque: string, @Query('modele') modele: string) {
        const termes = (type || '').split(',').map((t) => t.trim()).filter(Boolean);
        return this.service.autoResolveGroupeRecherche(termes, marque || '', modele || '');
    }

    @Get('search/groups/:id')
    @RequirePermission('compatibilite', 'voir')
    groupeInfoRecherche(@Param('id', ParseIntPipe) id: number) {
        return this.service.groupeInfoRecherche(id);
    }

    @Post('suggestions')
    @RequirePermission('compatibilite', 'ajouter')
    creerSuggestion(
        @Body() body: { id_model?: number; texte_libre?: string; id_part_type?: number },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.creerSuggestion(body, auth);
    }

    // ── Reference data: compat_editor / super_admin (checked inside the service) ──

    @Get('brands')
    listerMarques(@Headers('authorization') auth?: string) {
        return this.service.listerMarques(auth);
    }

    @Post('brands')
    creerMarque(@Body() body: { nom: string; logo?: string }, @Headers('authorization') auth?: string) {
        return this.service.creerMarque(body, auth);
    }

    @Put('brands/:id')
    modifierMarque(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { nom?: string; logo?: string },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.modifierMarque(id, body, auth);
    }

    @Delete('brands/:id')
    supprimerMarque(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.supprimerMarque(id, auth);
    }

    @Get('models')
    listerModeles(@Headers('authorization') auth?: string) {
        return this.service.listerModeles(auth);
    }

    @Post('models')
    creerModele(
        @Body() body: { id_brand: number; nom: string; nom_commercial?: string; code?: string; image?: string },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.creerModele(body, auth);
    }

    @Put('models/:id')
    modifierModele(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { nom?: string; nom_commercial?: string; code?: string; image?: string },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.modifierModele(id, body, auth);
    }

    @Delete('models/:id')
    supprimerModele(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.supprimerModele(id, auth);
    }

    @Post('models/upload-image')
    @UseInterceptors(FileInterceptor('image', imageUploadOptions('compat-models')))
    async uploadModelImage(@UploadedFile() file: Express.Multer.File, @Headers('authorization') auth?: string) {
        if (!file) throw new BadRequestException('Aucun fichier reçu.');
        try {
            await this.service.verifierEditeur(auth);
        } catch (e) {
            await fs.unlink(file.path).catch(() => undefined); // avoid an orphaned file if the role check fails
            throw e;
        }
        return { url: `/uploads/compat-models/${file.filename}` };
    }

    @Get('part-types')
    listerTypesPieces(@Headers('authorization') auth?: string) {
        return this.service.listerTypesPieces(auth);
    }

    @Post('part-types')
    creerTypePiece(
        @Body() body: { nom_fr: string; nom_en: string; nom_ar: string; categorie?: 'part' | 'accessory' },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.creerTypePiece(body, auth);
    }

    // ── Groups: compat_editor / super_admin (checked inside the service) ──

    @Get('groups')
    listerGroupes(@Headers('authorization') auth?: string) {
        return this.service.listerGroupes(auth);
    }

    @Get('groups/check-overlap')
    verifierChevauchementGroupe(
        @Query('id_model', ParseIntPipe) idModel: number,
        @Query('id_part_type', ParseIntPipe) idPartType: number,
        @Query('exclude_group_id') excludeGroupId: string | undefined,
        @Headers('authorization') auth?: string,
    ) {
        return this.service.verifierChevauchementGroupe(idModel, idPartType, excludeGroupId ? Number(excludeGroupId) : undefined, auth);
    }

    @Get('groups/:id')
    obtenirGroupe(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.obtenirGroupe(id, auth);
    }

    @Post('groups')
    creerGroupe(
        @Body() body: { id_part_type: number; id_base_model: number; modeleIds: number[]; note?: string; image?: string; statut?: string },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.creerGroupe(body, auth);
    }

    @Put('groups/:id')
    modifierGroupe(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { id_part_type?: number; id_base_model?: number; modeleIds?: number[]; note?: string; image?: string; statut?: string },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.modifierGroupe(id, body, auth);
    }

    @Delete('groups/:id')
    supprimerGroupe(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.supprimerGroupe(id, auth);
    }

    @Post('groups/:id/merge')
    fusionnerGroupes(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { id_cible: number },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.fusionnerGroupes(id, Number(body.id_cible), auth);
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
