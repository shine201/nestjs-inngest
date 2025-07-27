import { Injectable, Logger } from '@nestjs/common';
import { InngestFunction } from 'nestjs-inngest';

@Injectable()
export class AnalyticsEventHandlers {
  private readonly logger = new Logger(AnalyticsEventHandlers.name);

  @InngestFunction({
    id: 'analytics-order-handler',
    triggers: [{ event: 'analytics.order' }],
  })
  async handleOrderAnalytics(event: any) {
    this.logger.log(`Order analytics: ${JSON.stringify(event.data)}`);
    return { success: true };
  }

  @InngestFunction({
    id: 'analytics-inventory-handler',
    triggers: [{ event: 'analytics.inventory' }],
  })
  async handleInventoryAnalytics(event: any) {
    this.logger.log(`Inventory analytics: ${JSON.stringify(event.data)}`);
    return { success: true };
  }
}