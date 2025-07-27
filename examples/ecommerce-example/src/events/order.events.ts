import { Injectable, Logger } from '@nestjs/common';
import { InngestFunction } from 'nestjs-inngest';
import { OrderService } from '../services/order.service';
import { InventoryService } from '../services/inventory.service';
import { PaymentService } from '../services/payment.service';
import { NotificationService } from '../services/notification.service';
import { ShippingService } from '../services/shipping.service';
import { EventStoreService } from '../services/event-store.service';

@Injectable()
export class OrderEventHandlers {
  private readonly logger = new Logger(OrderEventHandlers.name);

  constructor(
    private readonly orderService: OrderService,
    private readonly inventoryService: InventoryService,
    private readonly paymentService: PaymentService,
    private readonly notificationService: NotificationService,
    private readonly shippingService: ShippingService,
    private readonly eventStoreService: EventStoreService,
  ) {}

  @InngestFunction({
    id: 'order-processing-saga',
    name: 'Order Processing Saga',
    triggers: [{ event: 'order.created' }],
  })
  async processOrderSaga(event: any, { step }: any) {
    const { orderId, customerId, items, payment, shipping } = event.data;
    
    this.logger.log(`Starting order processing saga for order ${orderId}`);

    try {
      // Step 1: Reserve inventory
      const inventoryReservation = await step.run('reserve-inventory', async () => {
        this.logger.log(`Reserving inventory for order ${orderId}`);
        return this.inventoryService.reserveItems(orderId, items);
      });

      if (!inventoryReservation.success) {
        throw new Error(`Inventory reservation failed: ${inventoryReservation.reason}`);
      }

      // Step 2: Process payment
      const paymentResult = await step.run('process-payment', async () => {
        this.logger.log(`Processing payment for order ${orderId}`);
        return this.paymentService.processPayment(orderId, payment);
      });

      // Step 3: Confirm order
      await step.run('confirm-order', async () => {
        this.logger.log(`Confirming order ${orderId}`);
        return this.orderService.confirmOrder(orderId);
      });

      // Step 4: Prepare shipping
      await step.run('prepare-shipping', async () => {
        this.logger.log(`Preparing shipping for order ${orderId}`);
        return this.shippingService.prepareShipment(orderId, shipping);
      });

      // Step 5: Send confirmation notification
      await step.run('send-confirmation', async () => {
        this.logger.log(`Sending confirmation for order ${orderId}`);
        return this.notificationService.sendOrderConfirmation(orderId, customerId);
      });

      this.logger.log(`Order processing saga completed successfully for order ${orderId}`);
      
      return {
        success: true,
        orderId,
        status: 'completed',
        steps: ['inventory', 'payment', 'confirmation', 'shipping', 'notification'],
      };

    } catch (error) {
      this.logger.error(`Order processing saga failed for order ${orderId}: ${error.message}`);
      
      // Compensation logic
      await this.compensateOrder(orderId, error, { step });
      
      throw error;
    }
  }

  @InngestFunction({
    id: 'order-confirmation-handler',
    name: 'Order Confirmation Handler',
    triggers: [{ event: 'order.confirmed' }],
  })
  async handleOrderConfirmation(event: any, { step }: any) {
    const { orderId, customerId } = event.data;
    
    this.logger.log(`Handling order confirmation for order ${orderId}`);

    // Send confirmation email
    await step.run('send-confirmation-email', async () => {
      return this.notificationService.sendEmail({
        customerId,
        template: 'order-confirmation',
        data: { orderId, ...event.data },
      });
    });

    // Update analytics
    await step.run('update-analytics', async () => {
      return this.eventStoreService.recordAnalytics('order_confirmed', {
        orderId,
        customerId,
        timestamp: new Date(),
      });
    });

    // Schedule follow-up notifications
    await step.run('schedule-follow-up', async () => {
      return this.notificationService.scheduleFollowUp(orderId, '24 hours');
    });

    return { success: true, orderId };
  }

  @InngestFunction({
    id: 'order-cancellation-handler',
    name: 'Order Cancellation Handler',
    triggers: [{ event: 'order.cancelled' }],
  })
  async handleOrderCancellation(event: any, { step }: any) {
    const { orderId, customerId, reason, refundAmount } = event.data;
    
    this.logger.log(`Handling order cancellation for order ${orderId}`);

    // Release inventory reservations
    await step.run('release-inventory', async () => {
      return this.inventoryService.releaseReservations(orderId, 'order_cancelled');
    });

    // Process refund if applicable
    if (refundAmount > 0) {
      await step.run('process-refund', async () => {
        return this.paymentService.processRefund(orderId, refundAmount, reason);
      });
    }

    // Send cancellation notification
    await step.run('send-cancellation-notification', async () => {
      return this.notificationService.sendOrderCancellation(orderId, customerId, reason);
    });

    // Update analytics
    await step.run('update-analytics', async () => {
      return this.eventStoreService.recordAnalytics('order_cancelled', {
        orderId,
        customerId,
        reason,
        refundAmount,
        timestamp: new Date(),
      });
    });

    return { success: true, orderId, refundAmount };
  }

  /**
   * Compensation logic for failed order processing
   */
  private async compensateOrder(orderId: string, error: Error, { step }: any) {
    this.logger.warn(`Starting compensation for order ${orderId}`);

    try {
      // Release any inventory reservations
      await step.run('compensate-inventory', async () => {
        return this.inventoryService.releaseReservations(orderId, 'saga_failure');
      });

      // Reverse any payments if they were processed
      await step.run('compensate-payment', async () => {
        return this.paymentService.reversePayment(orderId, 'saga_failure');
      });

      // Mark order as failed
      await step.run('mark-order-failed', async () => {
        return this.orderService.updateOrderStatus(orderId, 'cancelled');
      });

      // Notify customer of failure
      await step.run('notify-failure', async () => {
        return this.notificationService.sendOrderFailure(orderId, error.message);
      });

      this.logger.log(`Compensation completed for order ${orderId}`);
      
    } catch (compensationError) {
      this.logger.error(`Compensation failed for order ${orderId}: ${compensationError.message}`);
      // Log to monitoring system for manual intervention
    }
  }
}