import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Utilisateur } from '../users/user.entity';
import { CompatibilityController } from './compatibility.controller';
import { CompatibilityService } from './compatibility.service';
import { CaisseModule } from '../caisse/caisse.module';

@Module({
    imports: [TypeOrmModule.forFeature([Utilisateur]), CaisseModule],
    controllers: [CompatibilityController],
    providers: [CompatibilityService],
})
export class CompatibilityModule { }
