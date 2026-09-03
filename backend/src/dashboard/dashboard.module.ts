import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Article } from '../articles/article.entity';
import { Fournisseur } from '../fournisseurs/fournisseur.entity';
import { FactureAchat } from '../factures-achat/facture-achat.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Article, Fournisseur, FactureAchat])],
    controllers: [DashboardController],
    providers: [DashboardService],
})
export class DashboardModule { }
