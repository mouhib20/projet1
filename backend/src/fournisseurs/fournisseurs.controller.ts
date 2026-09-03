import {
    Controller, Get, Post, Put, Delete,
    Param, Body, ParseIntPipe, HttpCode, HttpStatus
} from '@nestjs/common';
import { FournisseursService } from './fournisseurs.service';
import { Fournisseur } from './fournisseur.entity';

@Controller('fournisseurs')
export class FournisseursController {
    constructor(private readonly fournisseursService: FournisseursService) { }

    @Get()
    findAll(): Promise<Fournisseur[]> {
        return this.fournisseursService.findAll();
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number): Promise<Fournisseur> {
        return this.fournisseursService.findOne(id);
    }

    @Post()
    create(@Body() body: Partial<Fournisseur>): Promise<Fournisseur> {
        return this.fournisseursService.create(body);
    }

    @Put(':id')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: Partial<Fournisseur>,
    ): Promise<Fournisseur> {
        return this.fournisseursService.update(id, body);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.fournisseursService.remove(id);
    }
}
