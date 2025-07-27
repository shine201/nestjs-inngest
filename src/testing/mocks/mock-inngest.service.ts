import { Injectable } from '@nestjs/common';
import { InngestEvent } from '../../interfaces/inngest-event.interface';

/**
 * Mock implementation of InngestService for testing
 */
@Injectable()
export class MockInngestService {
  private sentEvents: InngestEvent[] = [];
  private sendEventMock = jest.fn();
  private sendEventsMock = jest.fn();

  /**
   * Mock send single event
   */
  async send(event: InngestEvent): Promise<void> {
    this.sentEvents.push(event);
    this.sendEventMock(event);
    return Promise.resolve();
  }

  /**
   * Mock send multiple events
   */
  async sendEvents(events: InngestEvent[]): Promise<void> {
    this.sentEvents.push(...events);
    this.sendEventsMock(events);
    return Promise.resolve();
  }

  /**
   * Get all sent events for testing assertions
   */
  getSentEvents(): InngestEvent[] {
    return [...this.sentEvents];
  }

  /**
   * Get events filtered by name
   */
  getSentEventsByName(name: string): InngestEvent[] {
    return this.sentEvents.filter(event => event.name === name);
  }

  /**
   * Clear sent events history
   */
  clearSentEvents(): void {
    this.sentEvents = [];
    this.sendEventMock.mockClear();
    this.sendEventsMock.mockClear();
  }

  /**
   * Get the jest mock for send method
   */
  getSendMock(): jest.Mock {
    return this.sendEventMock;
  }

  /**
   * Get the jest mock for sendEvents method
   */
  getSendEventsMock(): jest.Mock {
    return this.sendEventsMock;
  }

  /**
   * Configure the mock to throw an error
   */
  mockSendError(error: Error): void {
    this.sendEventMock.mockRejectedValue(error);
    this.sendEventsMock.mockRejectedValue(error);
  }

  /**
   * Configure the mock to succeed after a delay
   */
  mockSendDelay(delay: number): void {
    this.sendEventMock.mockImplementation(async (event: InngestEvent) => {
      await new Promise(resolve => setTimeout(resolve, delay));
      this.sentEvents.push(event);
    });

    this.sendEventsMock.mockImplementation(async (events: InngestEvent[]) => {
      await new Promise(resolve => setTimeout(resolve, delay));
      this.sentEvents.push(...events);
    });
  }

  /**
   * Reset all mocks to default behavior
   */
  resetMocks(): void {
    this.sendEventMock.mockReset();
    this.sendEventsMock.mockReset();
    this.clearSentEvents();
    
    // Restore default behavior
    this.sendEventMock.mockImplementation((event: InngestEvent) => {
      this.sentEvents.push(event);
      return Promise.resolve();
    });

    this.sendEventsMock.mockImplementation((events: InngestEvent[]) => {
      this.sentEvents.push(...events);
      return Promise.resolve();
    });
  }

  /**
   * Assert that an event was sent
   */
  expectEventSent(eventName: string, eventData?: any): void {
    const matchingEvents = this.getSentEventsByName(eventName);
    expect(matchingEvents.length).toBeGreaterThan(0);

    if (eventData) {
      const matchingEvent = matchingEvents.find(event => 
        JSON.stringify(event.data) === JSON.stringify(eventData)
      );
      expect(matchingEvent).toBeDefined();
    }
  }

  /**
   * Assert that no events were sent
   */
  expectNoEventsSent(): void {
    expect(this.sentEvents).toHaveLength(0);
  }

  /**
   * Assert specific number of events were sent
   */
  expectEventCount(count: number): void {
    expect(this.sentEvents).toHaveLength(count);
  }

  /**
   * Assert that send was called specific number of times
   */
  expectSendCalledTimes(times: number): void {
    expect(this.sendEventMock).toHaveBeenCalledTimes(times);
  }
}