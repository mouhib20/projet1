import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe, Query, Headers, Res } from '@nestjs/common';
import type { Response } from 'express';
import { VentesService } from './ventes.service';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ScopedByStore } from '../store-context/scoped-by-store.decorator';

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
    @ScopedByStore('vente', 'id_vente')
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
    async checkout(
        @Body() body: any,
        @Headers('authorization') auth: string | undefined,
        @Res({ passthrough: true }) res: Response,
    ) {
        const ventes = await this.service.checkout(body, auth);
        // Array own-properties don't survive JSON serialization, so any offline-sync warning
        // (only ever set when body.client_id is present) rides along as a response header instead -
        // the response body itself stays the plain Vente[] every existing caller already expects.
        if (ventes.avertissements?.length) {
            res.set('X-Vente-Avertissements', JSON.stringify(ventes.avertissements));
        }
        return ventes;
    }

    @Delete(':id')
    @RequirePermission('ventes', 'supprimer')
    @ScopedByStore('vente', 'id_vente')
    remove(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.remove(id, auth);
    }
}
