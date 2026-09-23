import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CaisseCloture } from './caisse.entity';
import { Vente } from '../ventes/vente.entity';
import { CaisseService } from './caisse.service';
import { CaisseController } from './caisse.controller';

@Module({
    imports: [TypeOrmModule.forFeature([CaisseCloture, Vente])],
    controllers: [CaisseController],
    providers: [CaisseService],
    exports: [CaisseService],
})
export class CaisseModule { }
