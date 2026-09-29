import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MagasinModule as MagasinModuleEntity } from '../magasins/magasin-module.entity';
import { MagasinModulesService } from './magasin-modules.service';

@Module({
    imports: [TypeOrmModule.forFeature([MagasinModuleEntity])],
    providers: [MagasinModulesService],
    exports: [MagasinModulesService],
})
export class MagasinModulesModule { }
