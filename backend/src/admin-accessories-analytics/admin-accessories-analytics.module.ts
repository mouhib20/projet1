import { Module } from '@nestjs/common';
import { CaisseModule } from '../caisse/caisse.module';
import { AdminAccessoriesAnalyticsController } from './admin-accessories-analytics.controller';
import { AdminAccessoriesAnalyticsService } from './admin-accessories-analytics.service';

@Module({
    imports: [CaisseModule],
    controllers: [AdminAccessoriesAnalyticsController],
    providers: [AdminAccessoriesAnalyticsService],
})
export class AdminAccessoriesAnalyticsModule { }
