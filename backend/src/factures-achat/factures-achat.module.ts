import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacturesAchatController } from './factures-achat.controller';
import { FacturesAchatService } from './factures-achat.service';
import { FactureAchat } from './facture-achat.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FactureAchat])],
  controllers: [FacturesAchatController],
  providers: [FacturesAchatService],
  exports: [FacturesAchatService]
})
export class FacturesAchatModule { }
