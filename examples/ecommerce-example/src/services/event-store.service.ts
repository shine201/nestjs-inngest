import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventStore } from '../entities/event-store.entity';

@Injectable()
export class EventStoreService {
  private readonly logger = new Logger(EventStoreService.name);

  constructor(
    @InjectRepository(EventStore)
    private readonly eventStoreRepository: Repository<EventStore>,
  ) {}

  async recordEvent(
    streamId: string,
    eventType: string,
    eventData: any,
    metadata?: any,
  ): Promise<EventStore> {
    const eventRecord = this.eventStoreRepository.create({
      streamId,
      eventType,
      eventData,
      metadata,
      aggregateType: 'order', // Could be dynamic based on stream
    });

    return this.eventStoreRepository.save(eventRecord);
  }

  async recordAnalytics(eventType: string, data: any): Promise<EventStore> {
    return this.recordEvent(
      `analytics-${Date.now()}`,
      eventType,
      data,
      { source: 'analytics' },
    );
  }

  async getEventStream(streamId: string): Promise<EventStore[]> {
    return this.eventStoreRepository.find({
      where: { streamId },
      order: { version: 'ASC' },
    });
  }

  async getEventsByType(eventType: string, limit = 100): Promise<EventStore[]> {
    return this.eventStoreRepository.find({
      where: { eventType },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}