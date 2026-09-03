import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Stock } from './stock.entity';
import { StocksService } from './stocks.service';
import { StocksController } from './stocks.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Stock])],
    providers: [StocksService],
    controllers: [StocksController],
    exports: [StocksService],
})
export class StocksModule { }
