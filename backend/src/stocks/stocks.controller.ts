import {
    Controller, Get, Post, Put, Delete,
    Param, Body, ParseIntPipe, HttpCode, HttpStatus
} from '@nestjs/common';
import { StocksService } from './stocks.service';
import { Stock } from './stock.entity';
import { RequirePermission } from '../permissions/require-permission.decorator';

@Controller('stocks')
export class StocksController {
    constructor(private readonly stocksService: StocksService) { }

    @Get()
    @RequirePermission('stock', 'voir')
    findAll(): Promise<Stock[]> {
        return this.stocksService.findAll();
    }

    @Get(':id')
    @RequirePermission('stock', 'voir')
    findOne(@Param('id', ParseIntPipe) id: number): Promise<Stock> {
        return this.stocksService.findOne(id);
    }

    @Post()
    @RequirePermission('stock', 'ajouter')
    create(@Body() body: Partial<Stock>): Promise<Stock> {
        return this.stocksService.create(body);
    }

    @Put(':id')
    @RequirePermission('stock', 'modifier')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: Partial<Stock>,
    ): Promise<Stock> {
        return this.stocksService.update(id, body);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @RequirePermission('stock', 'supprimer')
    remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.stocksService.remove(id);
    }
}
