import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Headers } from '@nestjs/common';
import { ClientsService } from './clients.service';

@Controller('clients')
export class ClientsController {
    constructor(private readonly service: ClientsService) { }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get('depots/summary')
    getDepotsSummary() {
        return this.service.getDepotsSummary();
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Get(':id/depots')
    getDepots(@Param('id', ParseIntPipe) id: number) {
        return this.service.getDepots(id);
    }

    @Post(':id/depots')
    deposer(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { montant: number; note?: string; date?: string },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.deposer(id, body.montant, body.note, body.date, auth);
    }

    @Post()
    create(@Body() body: any) {
        return this.service.create(body);
    }

    @Put(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
        return this.service.update(id, body);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.service.remove(id);
    }
}
