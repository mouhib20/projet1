import { Module } from '@nestjs/common';
import { StoreContextService } from './store-context.service';

@Module({
    providers: [StoreContextService],
    exports: [StoreContextService],
})
export class StoreContextModule { }
