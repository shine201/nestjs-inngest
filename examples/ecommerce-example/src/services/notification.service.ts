import { Injectable, Logger } from '@nestjs/common';
import { InngestService } from 'nestjs-inngest';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly inngestService: InngestService) {}

  async sendOrderConfirmation(orderId: string, customerId: string) {
    this.logger.log(`Sending order confirmation for order ${orderId}`);

    await this.inngestService.send({
      name: 'notification.sent',
      data: {
        orderId,
        customerId,
        type: 'email',
        template: 'order-confirmation',
        recipient: `customer-${customerId}@example.com`,
        sentAt: new Date().toISOString(),
        success: true,
      },
    });

    return { success: true };
  }

  async sendOrderCancellation(orderId: string, customerId: string, reason: string) {
    this.logger.log(`Sending order cancellation for order ${orderId}`);

    await this.inngestService.send({
      name: 'notification.sent',
      data: {
        orderId,
        customerId,
        type: 'email',
        template: 'order-cancellation',
        recipient: `customer-${customerId}@example.com`,
        sentAt: new Date().toISOString(),
        success: true,
      },
    });

    return { success: true };
  }

  async sendOrderFailure(orderId: string, errorMessage: string) {
    this.logger.log(`Sending order failure notification for order ${orderId}`);

    await this.inngestService.send({
      name: 'notification.sent',
      data: {
        orderId,
        type: 'email',
        template: 'order-failure',
        recipient: 'support@example.com',
        sentAt: new Date().toISOString(),
        success: true,
      },
    });

    return { success: true };
  }

  async sendEmail(params: { customerId: string; template: string; data: any }) {
    this.logger.log(`Sending email with template ${params.template}`);

    await this.inngestService.send({
      name: 'notification.sent',
      data: {
        customerId: params.customerId,
        type: 'email',
        template: params.template,
        recipient: `customer-${params.customerId}@example.com`,
        sentAt: new Date().toISOString(),
        success: true,
      },
    });

    return { success: true };
  }

  async scheduleFollowUp(orderId: string, delay: string) {
    this.logger.log(`Scheduling follow-up for order ${orderId} in ${delay}`);
    return { success: true, scheduled: true };
  }
}