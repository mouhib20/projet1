import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Article } from './articles/article.entity';
import { Fournisseur } from './fournisseurs/fournisseur.entity';
import { MouvementAchat } from './mouvements-achat/mouvement-achat.entity';
import { Stock } from './stocks/stock.entity';
import { Client } from './clients/client.entity';
import { Vente } from './ventes/vente.entity';
import { Reparation } from './reparations/reparation.entity';
import { ProductsModule } from './products/products.module';
import { ProductEntity } from './products/product.entity';
import { ArticlesModule } from './articles/articles.module';
import { FournisseursModule } from './fournisseurs/fournisseurs.module';
import { MouvementsAchatModule } from './mouvements-achat/mouvements-achat.module';
import { StocksModule } from './stocks/stocks.module';
import { FacturesAchatModule } from './factures-achat/factures-achat.module';
import { FactureAchat } from './factures-achat/facture-achat.entity';
import { DashboardModule } from './dashboard/dashboard.module';
import { ClientsModule } from './clients/clients.module';
import { VentesModule } from './ventes/ventes.module';
import { ChargesModule } from './charges/charges.module';
import { Charge } from './charges/charge.entity';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                type: 'mysql',
                host: configService.get<string>('DB_HOST', 'localhost'),
                port: configService.get<number>('DB_PORT', 3306),
                username: configService.get<string>('DB_USERNAME', 'root'),
                password: configService.get<string>('DB_PASSWORD', ''),
                database: configService.get<string>('DB_DATABASE', 'gsmpro'),
                entities: [Article, Fournisseur, MouvementAchat, Stock, Client, Vente, Reparation, ProductEntity, FactureAchat, Charge],
                synchronize: false,
            }),
        }),
        ProductsModule,
        ArticlesModule,
        FournisseursModule,
        MouvementsAchatModule,
        StocksModule,
        FacturesAchatModule,
        DashboardModule,
        ClientsModule,
        VentesModule,
        ChargesModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule { }
