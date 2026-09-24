import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Headers } from '@nestjs/common';
import { ChargesService } from './charges.service';

@Controller('charges')
export class ChargesController {
    constructor(private readonly service: ChargesService) { }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Post()
    create(@Body() body: any, @Headers('authorization') auth?: string) {
        return this.service.create(body, auth);
    }

    @Put(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Headers('authorization') auth?: string) {
        return this.service.update(id, body, auth);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.remove(id, auth);
    }
}
