import { CaisseModule } from '../caisse/caisse.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reparation } from './reparation.entity';
import { ReparationItem } from './reparation-item.entity';
import { ReparationsService } from './reparations.service';
import { ReparationsController } from './reparations.controller';
import { StocksModule } from '../stocks/stocks.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Reparation, ReparationItem]),
        StocksModule,
        CaisseModule,
    ],
    controllers: [ReparationsController],
    providers: [ReparationsService],
    exports: [ReparationsService],
})
export class ReparationsModule { }
