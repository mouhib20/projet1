import { Module } from '@nestjs/common';
import { CaisseModule } from '../caisse/caisse.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './client.entity';
import { ClientDepot } from './client-depot.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Client, ClientDepot]), CaisseModule],
    controllers: [ClientsController],
    providers: [ClientsService],
    exports: [ClientsService],
})
export class ClientsModule { }
