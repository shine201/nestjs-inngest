import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AnalyticsService } from '../services/analytics.service';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('orders')
  @ApiOperation({ summary: 'Get order analytics' })
  @ApiResponse({ status: 200, description: 'Order metrics' })
  async getOrderMetrics() {
    return this.analyticsService.getOrderMetrics();
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Get revenue analytics' })
  @ApiResponse({ status: 200, description: 'Revenue metrics' })
  async getRevenueMetrics() {
    return this.analyticsService.getRevenueMetrics();
  }

  @Get('customers')
  @ApiOperation({ summary: 'Get customer analytics' })
  @ApiResponse({ status: 200, description: 'Customer metrics' })
  async getCustomerMetrics() {
    return this.analyticsService.getCustomerMetrics();
  }
}