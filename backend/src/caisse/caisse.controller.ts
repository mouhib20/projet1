import { Controller, Get, Post, Put, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CaisseService } from './caisse.service';

@Controller('caisse')
export class CaisseController {
    constructor(private readonly service: CaisseService) { }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get('status')
    getStatus(@Query('date') date?: string) {
        return this.service.getStatus(date);
    }

    @Post('cloturer')
    cloturer(@Body() body: { date?: string }) {
        return this.service.cloturer(body?.date);
    }

    @Put(':id/comptage')
    saisirComptage(@Param('id', ParseIntPipe) id: number, @Body() body: { montant_compte: number }) {
        return this.service.saisirComptage(id, body.montant_compte);
    }
}
