import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vente } from './vente.entity';
import { Article } from '../articles/article.entity';
import { VentesService } from './ventes.service';
import { VentesController } from './ventes.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Vente, Article])],
    controllers: [VentesController],
    providers: [VentesService],
    exports: [VentesService],
})
export class VentesModule { }
