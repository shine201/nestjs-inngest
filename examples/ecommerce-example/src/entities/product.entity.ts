import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { OrderItem } from './order-item.entity';
import { Inventory } from './inventory.entity';

export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DISCONTINUED = 'discontinued',
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  sku: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  compareAtPrice: number;

  @Column('decimal', { precision: 8, scale: 3, nullable: true })
  weight: number;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
  })
  status: ProductStatus;

  @Column({ nullable: true })
  category: string;

  @Column({ nullable: true })
  brand: string;

  @Column('simple-array', { nullable: true })
  tags: string[];

  @Column('json', { nullable: true })
  images: Array<{
    url: string;
    alt?: string;
    primary?: boolean;
  }>;

  @Column('json', { nullable: true })
  variants: Array<{
    name: string;
    values: string[];
  }>;

  @Column('json', { nullable: true })
  specifications: Record<string, any>;

  @Column('json', { nullable: true })
  seoData: {
    title: string;
    description: string;
    keywords: string[];
  };

  @Column('json', { nullable: true })
  metadata: Record<string, any>;

  @OneToMany(() => OrderItem, item => item.product)
  orderItems: OrderItem[];

  @OneToOne(() => Inventory, inventory => inventory.product)
  inventory: Inventory;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get isOnSale(): boolean {
    return this.compareAtPrice && this.compareAtPrice > this.price;
  }

  get discountPercentage(): number {
    if (!this.isOnSale) return 0;
    return Math.round(((this.compareAtPrice - this.price) / this.compareAtPrice) * 100);
  }
}