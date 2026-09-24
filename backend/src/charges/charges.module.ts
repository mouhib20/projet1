import { Module } from '@nestjs/common';
import { CaisseModule } from '../caisse/caisse.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Charge } from './charge.entity';
import { ChargesService } from './charges.service';
import { ChargesController } from './charges.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Charge]), CaisseModule],
    controllers: [ChargesController],
    providers: [ChargesService],
    exports: [ChargesService],
})
export class ChargesModule { }
