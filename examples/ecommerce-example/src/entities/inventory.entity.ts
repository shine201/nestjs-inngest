import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('inventory')
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productId: string;

  @OneToOne(() => Product, product => product.inventory)
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column('int', { default: 0 })
  quantity: number;

  @Column('int', { default: 0 })
  reserved: number;

  @Column('int', { default: 0 })
  committed: number;

  @Column('int', { default: 5 })
  lowStockThreshold: number;

  @Column('int', { nullable: true })
  reorderPoint: number;

  @Column('int', { nullable: true })
  reorderQuantity: number;

  @Column({ nullable: true })
  warehouseLocation: string;

  @Column({ default: true })
  trackQuantity: boolean;

  @Column({ default: false })
  allowBackorder: boolean;

  @Column('json', { nullable: true })
  reservations: Array<{
    orderId: string;
    quantity: number;
    reservedAt: Date;
    expiresAt: Date;
  }>;

  @Column('json', { nullable: true })
  movements: Array<{
    type: 'in' | 'out' | 'adjustment';
    quantity: number;
    reason: string;
    timestamp: Date;
    reference?: string;
  }>;

  @Column('json', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get availableQuantity(): number {
    return Math.max(0, this.quantity - this.reserved - this.committed);
  }

  get isLowStock(): boolean {
    return this.availableQuantity <= this.lowStockThreshold;
  }

  get isOutOfStock(): boolean {
    return this.availableQuantity <= 0;
  }

  get needsReorder(): boolean {
    return this.reorderPoint !== null && this.availableQuantity <= this.reorderPoint;
  }
}