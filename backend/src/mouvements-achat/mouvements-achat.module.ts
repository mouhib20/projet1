import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MouvementAchat } from './mouvement-achat.entity';
import { MouvementsAchatService } from './mouvements-achat.service';
import { MouvementsAchatController } from './mouvements-achat.controller';

@Module({
    imports: [TypeOrmModule.forFeature([MouvementAchat])],
    providers: [MouvementsAchatService],
    controllers: [MouvementsAchatController],
    exports: [MouvementsAchatService],
})
export class MouvementsAchatModule { }
