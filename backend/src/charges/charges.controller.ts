import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Headers } from '@nestjs/common';
import { ChargesService } from './charges.service';
import { RequirePermission } from '../permissions/require-permission.decorator';

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
    update(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Headers('authorization') auth?: string) {
        return this.service.update(id, body, auth);
    }

    @Delete(':id')
    @RequirePermission('charges', 'supprimer')
    remove(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.remove(id, auth);
    }
}
