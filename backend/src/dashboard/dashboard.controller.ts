import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { RequirePermission } from '../permissions/require-permission.decorator';

@Controller('dashboard')
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    @Get('stats')
    @RequirePermission('rapports', 'voir')
    getStats() {
        return this.dashboardService.getStats();
    }
}
