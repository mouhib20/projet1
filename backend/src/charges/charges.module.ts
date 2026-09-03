import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Charge } from './charge.entity';
import { ChargesService } from './charges.service';
import { ChargesController } from './charges.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Charge])],
    controllers: [ChargesController],
    providers: [ChargesService],
    exports: [ChargesService],
})
export class ChargesModule { }
