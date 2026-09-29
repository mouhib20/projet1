import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Utilisateur } from '../users/user.entity';
import { WholesaleController } from './wholesale.controller';
import { WholesaleService } from './wholesale.service';
import { CaisseModule } from '../caisse/caisse.module';

@Module({
    imports: [TypeOrmModule.forFeature([Utilisateur]), CaisseModule],
    controllers: [WholesaleController],
    providers: [WholesaleService],
})
export class WholesaleModule { }
