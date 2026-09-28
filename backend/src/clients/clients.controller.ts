import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Headers } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { RequirePermission } from '../permissions/require-permission.decorator';

@Controller('clients')
export class ClientsController {
    constructor(private readonly service: ClientsService) { }

    @Get()
    @RequirePermission('clients', 'voir')
    findAll() {
        return this.service.findAll();
    }

    @Get('depots/summary')
    @RequirePermission('clients', 'voir')
    getDepotsSummary() {
        return this.service.getDepotsSummary();
    }

    @Get(':id')
    @RequirePermission('clients', 'voir')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Get(':id/depots')
    @RequirePermission('clients', 'voir')
    getDepots(@Param('id', ParseIntPipe) id: number) {
        return this.service.getDepots(id);
    }

    @Get(':id/credits')
    @RequirePermission('clients', 'voir')
    getCredits(@Param('id', ParseIntPipe) id: number) {
        return this.service.getCredits(id);
    }

    @Post(':id/depots')
    @RequirePermission('clients', 'ajouter')
    deposer(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { montant: number; note?: string; date?: string },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.deposer(id, body.montant, body.note, body.date, auth);
    }

    @Post()
    @RequirePermission('clients', 'ajouter')
    create(@Body() body: any) {
        return this.service.create(body);
    }

    @Post('fusionner-doublons')
    @RequirePermission('clients', 'modifier')
    fusionnerDoublons() {
        return this.service.fusionnerDoublons();
    }

    @Put(':id')
    @RequirePermission('clients', 'modifier')
    update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
        return this.service.update(id, body);
    }

    @Delete(':id')
    @RequirePermission('clients', 'supprimer')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.service.remove(id);
    }
}
