import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Utilisateur } from '../users/user.entity';
import { CaisseModule } from '../caisse/caisse.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Utilisateur]), CaisseModule, PermissionsModule],
    controllers: [EmployeesController],
    providers: [EmployeesService],
})
export class EmployeesModule { }
