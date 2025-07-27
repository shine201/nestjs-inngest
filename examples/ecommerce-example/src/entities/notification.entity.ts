import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum NotificationType {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  WEBHOOK = 'webhook',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  BOUNCED = 'bounced',
  CLICKED = 'clicked',
  OPENED = 'opened',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  status: NotificationStatus;

  @Column()
  recipient: string;

  @Column()
  subject: string;

  @Column('text')
  content: string;

  @Column()
  template: string;

  @Column('json', { nullable: true })
  templateData: Record<string, any>;

  @Column({ nullable: true })
  orderId: string;

  @Column({ nullable: true })
  customerId: string;

  @Column({ nullable: true })
  provider: string;

  @Column({ nullable: true })
  externalId: string;

  @Column('json', { nullable: true })
  providerResponse: Record<string, any>;

  @Column({ nullable: true })
  errorMessage: string;

  @Column('int', { default: 0 })
  attempts: number;

  @Column('int', { default: 3 })
  maxAttempts: number;

  @Column({ nullable: true })
  nextRetryAt: Date;

  @Column('json', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  sentAt: Date;

  @Column({ nullable: true })
  deliveredAt: Date;

  @Column({ nullable: true })
  openedAt: Date;

  @Column({ nullable: true })
  clickedAt: Date;

  get canRetry(): boolean {
    return this.attempts < this.maxAttempts && this.status === NotificationStatus.FAILED;
  }

  get isDelivered(): boolean {
    return [
      NotificationStatus.DELIVERED,
      NotificationStatus.OPENED,
      NotificationStatus.CLICKED,
    ].includes(this.status);
  }
}