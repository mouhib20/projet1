import {
    Controller, Get, Post, Put, Delete,
    Param, Body, ParseIntPipe, HttpCode, HttpStatus
} from '@nestjs/common';
import { StocksService } from './stocks.service';
import { Stock } from './stock.entity';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ScopedByStore } from '../store-context/scoped-by-store.decorator';

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
    @ScopedByStore('stock', 'id_stock')
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
    @ScopedByStore('stock', 'id_stock')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: Partial<Stock>,
    ): Promise<Stock> {
        return this.stocksService.update(id, body);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @RequirePermission('stock', 'supprimer')
    @ScopedByStore('stock', 'id_stock')
    remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.stocksService.remove(id);
    }
}
