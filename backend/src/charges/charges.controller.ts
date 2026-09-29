import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Headers } from '@nestjs/common';
import { ChargesService } from './charges.service';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ScopedByStore } from '../store-context/scoped-by-store.decorator';

@Controller('charges')
export class ChargesController {
    constructor(private readonly service: ChargesService) { }

    @Get()
    @RequirePermission('charges', 'voir')
    findAll() {
        return this.service.findAll();
    }

    @Get(':id')
    @RequirePermission('charges', 'voir')
    @ScopedByStore('charge', 'id_charge')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Post()
    @RequirePermission('charges', 'ajouter')
    create(@Body() body: any, @Headers('authorization') auth?: string) {
        return this.service.create(body, auth);
    }

    @Put(':id')
    @RequirePermission('charges', 'modifier')
    @ScopedByStore('charge', 'id_charge')
    update(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Headers('authorization') auth?: string) {
        return this.service.update(id, body, auth);
    }

    @Delete(':id')
    @RequirePermission('charges', 'supprimer')
    @ScopedByStore('charge', 'id_charge')
    remove(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.remove(id, auth);
    }
}
