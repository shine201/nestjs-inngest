import { Injectable, Logger } from '@nestjs/common';
import { InngestService } from 'nestjs-inngest';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(private readonly inngestService: InngestService) {}

  async prepareShipment(orderId: string, shippingData: any) {
    this.logger.log(`Preparing shipment for order ${orderId}`);

    const shipmentId = `ship_${Date.now()}`;
    const estimatedDelivery = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.inngestService.send({
      name: 'shipping.prepared',
      data: {
        orderId,
        shipmentId,
        carrier: 'UPS',
        method: shippingData.method || 'standard',
        estimatedDelivery: estimatedDelivery.toISOString(),
        preparedAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      shipmentId,
      estimatedDelivery: estimatedDelivery.toISOString(),
    };
  }

  async dispatchShipment(shipmentId: string) {
    this.logger.log(`Dispatching shipment ${shipmentId}`);

    const trackingNumber = `1Z${Math.random().toString(36).substr(2, 12).toUpperCase()}`;

    await this.inngestService.send({
      name: 'shipping.dispatched',
      data: {
        shipmentId,
        trackingNumber,
        carrier: 'UPS',
        dispatchedAt: new Date().toISOString(),
        estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    return { success: true, trackingNumber };
  }
}