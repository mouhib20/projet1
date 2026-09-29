import { Global, Module } from '@nestjs/common';
import { StoreContextService } from './store-context.service';

/** Global: every store-scoped service across the app injects StoreContextService without each
 * feature module having to import this one explicitly (same reasoning as ClsModule being global). */
@Global()
@Module({
    providers: [StoreContextService],
    exports: [StoreContextService],
})
export class StoreContextModule { }
