import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { VentesService } from './ventes.service';

@Controller('ventes')
export class VentesController {
    constructor(private readonly service: VentesService) { }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get('stats')
    getStats(@Query('days') days?: string) {
        return this.service.getStats(days ? parseInt(days, 10) : undefined);
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Post()
    create(@Body() body: any) {
        return this.service.create(body);
    }

    @Post('checkout')
    checkout(@Body() body: any) {
        return this.service.checkout(body);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.service.remove(id);
    }
}
