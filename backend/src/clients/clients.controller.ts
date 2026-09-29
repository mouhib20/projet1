import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Headers } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ScopedByStore } from '../store-context/scoped-by-store.decorator';

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
    @ScopedByStore('client', 'id_client')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Get(':id/depots')
    @RequirePermission('clients', 'voir')
    @ScopedByStore('client', 'id_client')
    getDepots(@Param('id', ParseIntPipe) id: number) {
        return this.service.getDepots(id);
    }

    @Get(':id/credits')
    @RequirePermission('clients', 'voir')
    @ScopedByStore('client', 'id_client')
    getCredits(@Param('id', ParseIntPipe) id: number) {
        return this.service.getCredits(id);
    }

    @Post(':id/depots')
    @RequirePermission('clients', 'ajouter')
    @ScopedByStore('client', 'id_client')
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
    @ScopedByStore('client', 'id_client')
    update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
        return this.service.update(id, body);
    }

    @Delete(':id')
    @RequirePermission('clients', 'supprimer')
    @ScopedByStore('client', 'id_client')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.service.remove(id);
    }
}
