import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Magasin } from './magasin.entity';
import { MagasinModule as MagasinModuleEntity } from './magasin-module.entity';
import { Utilisateur } from '../users/user.entity';
import { CaisseModule } from '../caisse/caisse.module';
import { MagasinsService } from './magasins.service';
import { MagasinsController } from './magasins.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Magasin, MagasinModuleEntity, Utilisateur]), CaisseModule],
    controllers: [MagasinsController],
    providers: [MagasinsService],
    exports: [MagasinsService],
})
export class MagasinsModule { }
