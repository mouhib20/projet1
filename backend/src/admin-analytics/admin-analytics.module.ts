import { Module } from '@nestjs/common';
import { CaisseModule } from '../caisse/caisse.module';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';

@Module({
    imports: [CaisseModule],
    controllers: [AdminAnalyticsController],
    providers: [AdminAnalyticsService],
})
export class AdminAnalyticsModule { }
