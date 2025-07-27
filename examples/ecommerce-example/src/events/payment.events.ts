import { Injectable, Logger } from '@nestjs/common';
import { InngestFunction } from 'nestjs-inngest';

@Injectable()
export class PaymentEventHandlers {
  private readonly logger = new Logger(PaymentEventHandlers.name);

  @InngestFunction({
    id: 'payment-processed-handler',
    triggers: [{ event: 'payment.processed' }],
  })
  async handlePaymentProcessed(event: any) {
    this.logger.log(`Payment processed: ${JSON.stringify(event.data)}`);
    return { success: true };
  }

  @InngestFunction({
    id: 'payment-failed-handler',
    triggers: [{ event: 'payment.failed' }],
  })
  async handlePaymentFailed(event: any) {
    this.logger.log(`Payment failed: ${JSON.stringify(event.data)}`);
    return { success: true };
  }
}