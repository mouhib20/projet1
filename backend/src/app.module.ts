import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { Utilisateur } from './users/user.entity';
import { AppService } from './app.service';
import { Article } from './articles/article.entity';
import { Fournisseur } from './fournisseurs/fournisseur.entity';
import { MouvementAchat } from './mouvements-achat/mouvement-achat.entity';
import { Stock } from './stocks/stock.entity';
import { Client } from './clients/client.entity';
import { ClientDepot } from './clients/client-depot.entity';
import { Vente } from './ventes/vente.entity';
import { Reparation } from './reparations/reparation.entity';
import { ReparationItem } from './reparations/reparation-item.entity';
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
import { ReparationsModule } from './reparations/reparations.module';
import { CaisseModule } from './caisse/caisse.module';
import { PaiementsFournisseurModule } from './paiements-fournisseur/paiements-fournisseur.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        ScheduleModule.forRoot(),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
                // DATABASE_URL (given by Render) takes over the separate DB_* settings
                const url = configService.get<string>('DATABASE_URL');
                const connexion = url
                    ? { url }
                    : {
                        host: configService.get<string>('DB_HOST', 'localhost'),
                        port: configService.get<number>('DB_PORT', 5432),
                        username: configService.get<string>('DB_USERNAME', 'postgres'),
                        password: configService.get<string>('DB_PASSWORD', ''),
                        database: configService.get<string>('DB_DATABASE', 'postgres'),
                    };
                return {
                    type: 'postgres' as const,
                    ...connexion,
                    entities: [Article, Fournisseur, MouvementAchat, Stock, Client, ClientDepot, Vente, Reparation, ReparationItem, ProductEntity, FactureAchat, Charge, Utilisateur],
                    synchronize: configService.get<string>('DB_SYNC', 'false') === 'true',
                    ssl: configService.get<string>('DB_SSL', 'true') === 'true' ? { rejectUnauthorized: false } : false,
                };
            },
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
        AuthModule,
        UsersModule,
        ReparationsModule,
        CaisseModule,
        PaiementsFournisseurModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule { }
