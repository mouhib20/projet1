import { Controller, Get, Post, Body, Param, Put, Delete, Patch, Headers } from '@nestjs/common';
import { ReparationsService } from './reparations.service';
import { CreateReparationDto } from './dtos/create-reparation.dto';

@Controller('reparations')
export class ReparationsController {
    constructor(private readonly reparationsService: ReparationsService) { }

    @Get()
    findAll() {
        return this.reparationsService.findAll();
    }

    @Get('retours')
    findRetours() {
        return this.reparationsService.findRetours();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.reparationsService.findOne(+id);
    }

    @Post()
    create(@Body() createDto: CreateReparationDto, @Headers('authorization') auth?: string) {
        return this.reparationsService.create(createDto, auth);
    }

    @Post(':id/items')
    addItem(@Param('id') id: string, @Body() body: { id_article: number; qte?: number; prix?: number }) {
        return this.reparationsService.addItem(+id, body);
    }

    @Patch(':id/statut')
    updateStatus(@Param('id') id: string, @Body('statut') statut: string) {
        return this.reparationsService.updateStatus(+id, statut);
    }

    @Patch(':id/finaliser-vente')
    finaliserVente(@Param('id') id: string, @Body('montant_recu') montant_recu: number) {
        return this.reparationsService.finaliserVente(+id, montant_recu);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.reparationsService.remove(+id);
    }
}
