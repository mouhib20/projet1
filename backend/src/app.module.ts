import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
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
import { PermissionsModule } from './permissions/permissions.module';
import { Permission } from './permissions/permission.entity';
import { EmployeesModule } from './employees/employees.module';
import { Magasin } from './magasins/magasin.entity';
import { MagasinModule as MagasinModuleEntity } from './magasins/magasin-module.entity';
import { MagasinsModule } from './magasins/magasins.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        // Per-request store context (id_magasin/role), set once by JwtAuthGuard and read by
        // every store-scoped service via StoreContextService — avoids re-deriving it everywhere.
        ClsModule.forRoot({ global: true, middleware: { mount: true } }),
        ScheduleModule.forRoot(),
        // Broad safety net against abuse/DoS on the whole API (login already has its own,
        // stricter, per-account throttle in AuthController — this is a second, general layer).
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
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
                    entities: [Article, Fournisseur, MouvementAchat, Stock, Client, ClientDepot, Vente, Reparation, ReparationItem, ProductEntity, FactureAchat, Charge, Utilisateur, Permission, Magasin, MagasinModuleEntity],
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
        PermissionsModule,
        EmployeesModule,
        MagasinsModule,
    ],
    controllers: [AppController],
    providers: [
        AppService,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
})
export class AppModule { }
