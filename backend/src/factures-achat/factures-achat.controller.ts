import { Controller, Get, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { FacturesAchatService } from './factures-achat.service';

@Controller('factures-achat')
export class FacturesAchatController {
    constructor(private readonly service: FacturesAchatService) { }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Post()
    create(@Body() body: any) {
        return this.service.create(body);
    }
}
