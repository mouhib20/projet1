import { Controller, Get, Post, Body, Param, Query, Put, Delete, Patch, Headers } from '@nestjs/common';
import { ReparationsService } from './reparations.service';
import { CreateReparationDto } from './dtos/create-reparation.dto';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ScopedByStore } from '../store-context/scoped-by-store.decorator';

@Controller('reparations')
export class ReparationsController {
    constructor(private readonly reparationsService: ReparationsService) { }

    @Get()
    @RequirePermission('reparation', 'voir')
    findAll() {
        return this.reparationsService.findAll();
    }

    @Get('retours')
    @RequirePermission('reparation', 'voir')
    findRetours() {
        return this.reparationsService.findRetours();
    }

    /** Offline mode: incremental pull of tickets ready for pickup, for the POS's local cache. */
    @Get('pickup-ready')
    @RequirePermission('reparation', 'voir')
    pickupReady(@Query('since') since?: string) {
        return this.reparationsService.pickupReady(since);
    }

    @Get(':id')
    @RequirePermission('reparation', 'voir')
    @ScopedByStore('reparation', 'id_reparation')
    findOne(@Param('id') id: string) {
        return this.reparationsService.findOne(+id);
    }

    @Post()
    @RequirePermission('reparation', 'ajouter')
    create(@Body() createDto: CreateReparationDto, @Headers('authorization') auth?: string) {
        return this.reparationsService.create(createDto, auth);
    }

    @Post(':id/items')
    @RequirePermission('reparation', 'modifier')
    @ScopedByStore('reparation', 'id_reparation')
    addItem(@Param('id') id: string, @Body() body: { id_article: number; qte?: number; prix?: number }) {
        return this.reparationsService.addItem(+id, body);
    }

    @Patch(':id/statut')
    @RequirePermission('reparation', 'modifier')
    @ScopedByStore('reparation', 'id_reparation')
    updateStatus(@Param('id') id: string, @Body('statut') statut: string) {
        return this.reparationsService.updateStatus(+id, statut);
    }

    @Patch(':id/finaliser-vente')
    @RequirePermission('reparation', 'modifier')
    @ScopedByStore('reparation', 'id_reparation')
    finaliserVente(@Param('id') id: string, @Body('montant_recu') montant_recu: number) {
        return this.reparationsService.finaliserVente(+id, montant_recu);
    }

    @Post(':id/annuler')
    @RequirePermission('reparation', 'modifier')
    @ScopedByStore('reparation', 'id_reparation')
    annuler(@Param('id') id: string, @Body('motif') motif: string | undefined, @Headers('authorization') auth?: string) {
        return this.reparationsService.annuler(+id, motif, auth);
    }

    @Delete(':id')
    @RequirePermission('reparation', 'supprimer')
    @ScopedByStore('reparation', 'id_reparation')
    remove(@Param('id') id: string) {
        return this.reparationsService.remove(+id);
    }
}
