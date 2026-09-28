import { Controller, Get, Post, Put, Patch, Body, Param, ParseIntPipe, Headers } from '@nestjs/common';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
    constructor(private readonly service: EmployeesService) { }

    @Get()
    findAll(@Headers('authorization') auth?: string) {
        return this.service.findAll(auth);
    }

    @Post()
    create(@Body() body: any, @Headers('authorization') auth?: string) {
        return this.service.create(body, auth);
    }

    @Put(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Headers('authorization') auth?: string) {
        return this.service.update(id, body, auth);
    }

    @Patch(':id/statut')
    setStatut(@Param('id', ParseIntPipe) id: number, @Body() body: { actif: boolean }, @Headers('authorization') auth?: string) {
        return this.service.setStatut(id, !!body.actif, auth);
    }

    @Get(':id/permissions')
    getPermissions(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.getPermissions(id, auth);
    }

    @Put(':id/permissions')
    setPermissions(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Headers('authorization') auth?: string) {
        return this.service.setPermissions(id, body, auth);
    }
}
