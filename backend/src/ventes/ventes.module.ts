import { CaisseModule } from '../caisse/caisse.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vente } from './vente.entity';
import { Article } from '../articles/article.entity';
import { VentesService } from './ventes.service';
import { VentesController } from './ventes.controller';
import { StocksModule } from '../stocks/stocks.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
    imports: [TypeOrmModule.forFeature([Vente, Article]), StocksModule, ClientsModule, CaisseModule],
    controllers: [VentesController],
    providers: [VentesService],
    exports: [VentesService],
})
export class VentesModule { }
