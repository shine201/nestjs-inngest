import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('event_store')
@Index(['streamId'])
@Index(['eventType'])
@Index(['createdAt'])
export class EventStore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  streamId: string;

  @Column()
  eventType: string;

  @Column('jsonb')
  eventData: Record<string, any>;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @Column('bigserial')
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  aggregateType: string;

  @Column({ nullable: true })
  causationId: string;

  @Column({ nullable: true })
  correlationId: string;

  @Column({ nullable: true })
  userId: string;
}