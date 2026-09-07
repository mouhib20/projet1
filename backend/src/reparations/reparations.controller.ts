import { Controller, Get, Post, Body, Param, Put, Delete, Patch } from '@nestjs/common';
import { ReparationsService } from './reparations.service';
import { CreateReparationDto } from './dtos/create-reparation.dto';

@Controller('reparations')
export class ReparationsController {
    constructor(private readonly reparationsService: ReparationsService) { }

    @Get()
    findAll() {
        return this.reparationsService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.reparationsService.findOne(+id);
    }

    @Post()
    create(@Body() createDto: CreateReparationDto) {
        return this.reparationsService.create(createDto);
    }

    @Patch(':id/statut')
    updateStatus(@Param('id') id: string, @Body('statut') statut: string) {
        return this.reparationsService.updateStatus(+id, statut);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.reparationsService.remove(+id);
    }
}
