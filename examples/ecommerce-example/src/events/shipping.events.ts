import { Injectable, Logger } from '@nestjs/common';
import { InngestFunction } from 'nestjs-inngest';

@Injectable()
export class ShippingEventHandlers {
  private readonly logger = new Logger(ShippingEventHandlers.name);

  @InngestFunction({
    id: 'shipping-prepared-handler',
    triggers: [{ event: 'shipping.prepared' }],
  })
  async handleShippingPrepared(event: any) {
    this.logger.log(`Shipping prepared: ${JSON.stringify(event.data)}`);
    return { success: true };
  }

  @InngestFunction({
    id: 'shipping-dispatched-handler',
    triggers: [{ event: 'shipping.dispatched' }],
  })
  async handleShippingDispatched(event: any) {
    this.logger.log(`Shipping dispatched: ${JSON.stringify(event.data)}`);
    return { success: true };
  }
}