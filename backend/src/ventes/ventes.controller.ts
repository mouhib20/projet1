import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe, Query, Headers } from '@nestjs/common';
import { VentesService } from './ventes.service';
import { RequirePermission } from '../permissions/require-permission.decorator';

@Controller('ventes')
export class VentesController {
    constructor(private readonly service: VentesService) { }

    @Get()
    @RequirePermission('ventes', 'voir')
    findAll() {
        return this.service.findAll();
    }

    @Get('stats')
    @RequirePermission('rapports', 'voir')
    getStats(@Query('period') period?: string) {
        const valides = ['today', 'week', 'month', 'year'] as const;
        const p = valides.includes(period as any) ? (period as (typeof valides)[number]) : undefined;
        return this.service.getStats(p);
    }

    @Get('stats/pertes')
    @RequirePermission('rapports', 'voir')
    getPertesDetail(@Query('period') period?: string) {
        const valides = ['today', 'week', 'month', 'year'] as const;
        const p = valides.includes(period as any) ? (period as (typeof valides)[number]) : undefined;
        return this.service.getPertesDetail(p);
    }

    @Get(':id')
    @RequirePermission('ventes', 'voir')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Post()
    @RequirePermission('ventes', 'ajouter')
    create(@Body() body: any, @Headers('authorization') auth?: string) {
        return this.service.create(body, auth);
    }

    @Post('checkout')
    @RequirePermission('ventes', 'ajouter')
    checkout(@Body() body: any, @Headers('authorization') auth?: string) {
        return this.service.checkout(body, auth);
    }

    @Delete(':id')
    @RequirePermission('ventes', 'supprimer')
    remove(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.remove(id, auth);
    }
}
