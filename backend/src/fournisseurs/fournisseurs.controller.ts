import {
    Controller, Get, Post, Put, Delete,
    Param, Body, ParseIntPipe, HttpCode, HttpStatus
} from '@nestjs/common';
import { FournisseursService } from './fournisseurs.service';
import { Fournisseur } from './fournisseur.entity';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ScopedByStore } from '../store-context/scoped-by-store.decorator';

@Controller('fournisseurs')
export class FournisseursController {
    constructor(private readonly fournisseursService: FournisseursService) { }

    @Get()
    @RequirePermission('fournisseurs', 'voir')
    findAll(): Promise<Fournisseur[]> {
        return this.fournisseursService.findAll();
    }

    @Get(':id')
    @RequirePermission('fournisseurs', 'voir')
    @ScopedByStore('fournisseur', 'id_fournisseur')
    findOne(@Param('id', ParseIntPipe) id: number): Promise<Fournisseur> {
        return this.fournisseursService.findOne(id);
    }

    @Post()
    @RequirePermission('fournisseurs', 'ajouter')
    create(@Body() body: Partial<Fournisseur>): Promise<Fournisseur> {
        return this.fournisseursService.create(body);
    }

    @Put(':id')
    @RequirePermission('fournisseurs', 'modifier')
    @ScopedByStore('fournisseur', 'id_fournisseur')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: Partial<Fournisseur>,
    ): Promise<Fournisseur> {
        return this.fournisseursService.update(id, body);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @RequirePermission('fournisseurs', 'supprimer')
    @ScopedByStore('fournisseur', 'id_fournisseur')
    remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.fournisseursService.remove(id);
    }
}
