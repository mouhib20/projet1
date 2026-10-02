import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Utilisateur } from '../users/user.entity';
import { CompatImportController } from './compat-import.controller';
import { CompatImportService } from './compat-import.service';
import { CaisseModule } from '../caisse/caisse.module';
import { CompatibilityModule } from '../compatibility/compatibility.module';

@Module({
    imports: [TypeOrmModule.forFeature([Utilisateur]), CaisseModule, CompatibilityModule],
    controllers: [CompatImportController],
    providers: [CompatImportService],
})
export class CompatImportModule { }
