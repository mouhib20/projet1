import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Fournisseur } from './fournisseur.entity';
import { FournisseursService } from './fournisseurs.service';
import { FournisseursController } from './fournisseurs.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Fournisseur])],
    providers: [FournisseursService],
    controllers: [FournisseursController],
    exports: [FournisseursService],
})
export class FournisseursModule { }
