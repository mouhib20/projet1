import { Module } from '@nestjs/common';
import { WholesaleController } from './wholesale.controller';
import { WholesaleService } from './wholesale.service';
import { CaisseModule } from '../caisse/caisse.module';

@Module({
    imports: [CaisseModule],
    controllers: [WholesaleController],
    providers: [WholesaleService],
})
export class WholesaleModule { }
