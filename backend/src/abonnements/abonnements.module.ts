import { Module } from '@nestjs/common';
import { CaisseModule } from '../caisse/caisse.module';
import { MagasinsModule } from '../magasins/magasins.module';
import { AbonnementsController } from './abonnements.controller';
import { AbonnementsService } from './abonnements.service';

@Module({
    imports: [CaisseModule, MagasinsModule],
    controllers: [AbonnementsController],
    providers: [AbonnementsService],
    exports: [AbonnementsService],
})
export class AbonnementsModule { }
