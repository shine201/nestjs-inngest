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
import { Customer } from './customer.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
}

export enum PaymentMethod {
  CARD = 'card',
  PAYPAL = 'paypal',
  BANK_TRANSFER = 'bank_transfer',
  CRYPTO = 'crypto',
  WALLET = 'wallet',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @ManyToOne(() => Order, order => order.payments)
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column()
  customerId: string;

  @ManyToOne(() => Customer, customer => customer.payments)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
  })
  method: PaymentMethod;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  refundedAmount: number;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column({ nullable: true })
  externalTransactionId: string;

  @Column({ nullable: true })
  externalPaymentId: string;

  @Column({ nullable: true })
  gatewayProvider: string;

  @Column('json', { nullable: true })
  paymentDetails: {
    cardLast4?: string;
    cardBrand?: string;
    cardExpMonth?: number;
    cardExpYear?: number;
    paypalEmail?: string;
    bankName?: string;
    [key: string]: any;
  };

  @Column('json', { nullable: true })
  billingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };

  @Column({ nullable: true })
  failureReason: string;

  @Column({ nullable: true })
  failureCode: string;

  @Column('json', { nullable: true })
  refunds: Array<{
    id: string;
    amount: number;
    reason: string;
    refundedAt: Date;
    externalRefundId?: string;
  }>;

  @Column('json', { nullable: true })
  fraudCheck: {
    riskScore: number;
    outcome: 'low' | 'medium' | 'high';
    verifications: Record<string, any>;
  };

  @Column('json', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  processedAt: Date;

  @Column({ nullable: true })
  failedAt: Date;

  get isCompleted(): boolean {
    return this.status === PaymentStatus.COMPLETED;
  }

  get isFailed(): boolean {
    return this.status === PaymentStatus.FAILED;
  }

  get isRefunded(): boolean {
    return this.status === PaymentStatus.REFUNDED || this.status === PaymentStatus.PARTIALLY_REFUNDED;
  }

  get remainingRefundAmount(): number {
    return this.amount - this.refundedAmount;
  }
}