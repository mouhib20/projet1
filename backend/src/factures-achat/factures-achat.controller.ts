import { Controller, Get, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { FacturesAchatService } from './factures-achat.service';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ScopedByStore } from '../store-context/scoped-by-store.decorator';

@Controller('factures-achat')
export class FacturesAchatController {
    constructor(private readonly service: FacturesAchatService) { }

    @Get()
    @RequirePermission('fournisseurs', 'voir')
    findAll() {
        return this.service.findAll();
    }

    @Get(':id')
    @RequirePermission('fournisseurs', 'voir')
    @ScopedByStore('facture_achat', 'id_facture')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Post()
    @RequirePermission('fournisseurs', 'ajouter')
    create(@Body() body: any) {
        return this.service.create(body);
    }
}
