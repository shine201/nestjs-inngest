import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';

export enum ShipmentStatus {
  PENDING = 'pending',
  PREPARED = 'prepared',
  DISPATCHED = 'dispatched',
  IN_TRANSIT = 'in_transit',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  FAILED_DELIVERY = 'failed_delivery',
  RETURNED = 'returned',
}

@Entity('shipments')
export class Shipment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @ManyToOne(() => Order, order => order.shipments)
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    default: ShipmentStatus.PENDING,
  })
  status: ShipmentStatus;

  @Column()
  carrier: string;

  @Column({ nullable: true })
  trackingNumber: string;

  @Column({ nullable: true })
  trackingUrl: string;

  @Column()
  shippingMethod: string;

  @Column('decimal', { precision: 8, scale: 3, nullable: true })
  weight: number;

  @Column('json')
  shippingAddress: {
    name: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    phone?: string;
  };

  @Column('json', { nullable: true })
  dimensions: {
    length: number;
    width: number;
    height: number;
    unit: 'cm' | 'in';
  };

  @Column('json', { nullable: true })
  items: Array<{
    orderItemId: string;
    productId: string;
    quantity: number;
    sku: string;
  }>;

  @Column('json', { nullable: true })
  trackingEvents: Array<{
    status: string;
    description: string;
    location?: string;
    timestamp: Date;
  }>;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  shippingCost: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  insuranceValue: number;

  @Column({ nullable: true })
  notes: string;

  @Column('json', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  preparedAt: Date;

  @Column({ nullable: true })
  dispatchedAt: Date;

  @Column({ nullable: true })
  deliveredAt: Date;

  @Column({ nullable: true })
  estimatedDelivery: Date;

  get isDelivered(): boolean {
    return this.status === ShipmentStatus.DELIVERED;
  }

  get isInTransit(): boolean {
    return [
      ShipmentStatus.DISPATCHED,
      ShipmentStatus.IN_TRANSIT,
      ShipmentStatus.OUT_FOR_DELIVERY,
    ].includes(this.status);
  }

  get daysSinceDispatch(): number {
    if (!this.dispatchedAt) return 0;
    return Math.floor((Date.now() - this.dispatchedAt.getTime()) / (1000 * 60 * 60 * 24));
  }
}