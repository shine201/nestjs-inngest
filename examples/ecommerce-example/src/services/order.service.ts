import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InngestService } from 'nestjs-inngest';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { OrderCreatedData, OrderConfirmedData, OrderCancelledData } from '../types/events';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    private readonly inngestService: InngestService,
  ) {}

  async createOrder(orderData: Partial<Order>): Promise<Order> {
    this.logger.log(`Creating order for customer ${orderData.customerId}`);

    const order = this.orderRepository.create({
      ...orderData,
      status: OrderStatus.PENDING,
    });

    const savedOrder = await this.orderRepository.save(order);

    // Trigger order processing saga
    await this.inngestService.send({
      name: 'order.created',
      data: {
        orderId: savedOrder.id,
        customerId: savedOrder.customerId,
        items: orderData.items?.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.unitPrice,
        })) || [],
        totalAmount: savedOrder.totalAmount,
        payment: {
          method: 'card',
          amount: savedOrder.totalAmount,
        },
        shipping: {
          address: JSON.stringify(savedOrder.shippingAddress),
          method: 'standard',
        },
      } as OrderCreatedData,
    });

    return savedOrder;
  }

  async confirmOrder(orderId: string): Promise<Order> {
    this.logger.log(`Confirming order ${orderId}`);

    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['items'],
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    order.status = OrderStatus.CONFIRMED;
    order.confirmedAt = new Date();
    order.estimatedDelivery = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const savedOrder = await this.orderRepository.save(order);

    // Send confirmation event
    await this.inngestService.send({
      name: 'order.confirmed',
      data: {
        orderId: savedOrder.id,
        customerId: savedOrder.customerId,
        confirmedAt: savedOrder.confirmedAt.toISOString(),
        estimatedDelivery: savedOrder.estimatedDelivery.toISOString(),
      } as OrderConfirmedData,
    });

    // Trigger analytics
    await this.inngestService.send({
      name: 'analytics.order',
      data: {
        orderId: savedOrder.id,
        customerId: savedOrder.customerId,
        event: 'confirmed',
        value: savedOrder.totalAmount,
        metadata: { status: savedOrder.status },
        timestamp: new Date().toISOString(),
      },
    });

    return savedOrder;
  }

  async cancelOrder(orderId: string, reason: string): Promise<Order> {
    this.logger.log(`Cancelling order ${orderId}: ${reason}`);

    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    order.cancellationReason = reason;

    const savedOrder = await this.orderRepository.save(order);

    // Send cancellation event
    await this.inngestService.send({
      name: 'order.cancelled',
      data: {
        orderId: savedOrder.id,
        customerId: savedOrder.customerId,
        reason,
        cancelledAt: savedOrder.cancelledAt.toISOString(),
        refundAmount: savedOrder.totalAmount,
      } as OrderCancelledData,
    });

    return savedOrder;
  }

  async getOrder(orderId: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['items', 'customer', 'payments', 'shipments'],
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    return order;
  }

  async getOrdersByCustomer(customerId: string): Promise<Order[]> {
    return this.orderRepository.find({
      where: { customerId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    order.status = status;
    return this.orderRepository.save(order);
  }
}