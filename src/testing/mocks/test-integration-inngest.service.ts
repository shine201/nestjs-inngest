import { Injectable, Inject, Logger } from "@nestjs/common";
import { InngestService } from "../../services/inngest.service";
import {
  InngestEvent,
  InngestEventBatch,
} from "../../interfaces/inngest-event.interface";
import { INNGEST_CONFIG } from "../../constants";
import { MergedInngestConfig } from "../../utils/config-validation";

/**
 * Test-friendly version of InngestService for integration tests
 *
 * This service behaves like the real InngestService but doesn't make actual
 * external API calls, making it perfect for integration testing where we want
 * to test the full service logic without external dependencies.
 */
@Injectable()
export class TestIntegrationInngestService extends InngestService {
  private readonly testLogger = new Logger(TestIntegrationInngestService.name);
  private sentEvents: InngestEvent[] = [];
  private sendCalls: Array<{ events: InngestEvent[]; timestamp: number }> = [];

  constructor(@Inject(INNGEST_CONFIG) config: MergedInngestConfig) {
    super(config);
  }

  /**
   * Check if we should use real API calls or mock them
   */
  private get shouldUseRealAPI(): boolean {
    return (
      process.env.INNGEST_USE_REAL_API === "true" ||
      process.env.NODE_ENV === "e2e"
    );
  }

  /**
   * Override the send method to support both mock and real API modes
   */
  async send(event: InngestEvent): Promise<void>;
  async send(events: InngestEventBatch): Promise<void>;
  async send(eventOrEvents: InngestEvent | InngestEventBatch): Promise<void> {
    const eventArray = Array.isArray(eventOrEvents)
      ? eventOrEvents
      : [eventOrEvents];

    // Check for error simulation first
    if (this.shouldSimulateError && this.errorToSimulate) {
      this.shouldSimulateError = false;
      const error = this.errorToSimulate;
      this.errorToSimulate = null;
      throw error;
    }

    if (this.shouldUseRealAPI) {
      // Use real Inngest API - call the parent implementation
      this.testLogger.log(
        `Using real Inngest API for ${eventArray.length} event(s)`,
      );
      try {
        if (Array.isArray(eventOrEvents)) {
          await super.send(eventOrEvents);
        } else {
          await super.send(eventOrEvents);
        }
        // Still record for testing assertions
        this.sentEvents.push(...eventArray);
        this.sendCalls.push({
          events: [...eventArray],
          timestamp: Date.now(),
        });
      } catch (error) {
        this.testLogger.error(
          `Real API call failed: ${(error as Error).message}`,
        );
        throw error;
      }
    } else {
      // Mock mode - simulate successful API calls without network requests but still validate batch size
      this.testLogger.log(
        `Mock: Sending ${eventArray.length} event(s) to Inngest (test mode)`,
      );

      // Validate batch size limits even in mock mode
      if (eventArray.length > 100) {
        // Use hardcoded maxBatchSize for testing
        throw new Error(
          `Batch size exceeds maximum allowed (100). Got ${eventArray.length} events.`,
        );
      }

      // Record the events for testing assertions
      this.sentEvents.push(...eventArray);
      this.sendCalls.push({
        events: [...eventArray],
        timestamp: Date.now(),
      });

      // Simulate processing time
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate successful response
      this.testLogger.log(
        `Mock: Successfully sent ${eventArray.length} event(s) to Inngest`,
      );
    }
  }

  /**
   * Testing utilities
   */

  /**
   * Get all events that were "sent" during testing
   */
  getSentEvents(): InngestEvent[] {
    return [...this.sentEvents];
  }

  /**
   * Get events filtered by name
   */
  getSentEventsByName(name: string): InngestEvent[] {
    return this.sentEvents.filter((event) => event.name === name);
  }

  /**
   * Get the history of send calls with timestamps
   */
  getSendCallHistory(): Array<{ events: InngestEvent[]; timestamp: number }> {
    return [...this.sendCalls];
  }

  /**
   * Get the number of times send was called
   */
  getSendCallCount(): number {
    return this.sendCalls.length;
  }

  /**
   * Clear the testing history
   */
  clearTestHistory(): void {
    this.sentEvents = [];
    this.sendCalls = [];
  }

  /**
   * Check if a specific event was sent
   */
  wasEventSent(eventName: string, data?: any): boolean {
    return this.sentEvents.some((event) => {
      if (event.name !== eventName) return false;
      if (data && JSON.stringify(event.data) !== JSON.stringify(data))
        return false;
      return true;
    });
  }

  /**
   * Get the last sent event
   */
  getLastSentEvent(): InngestEvent | undefined {
    return this.sentEvents[this.sentEvents.length - 1];
  }

  /**
   * Simulate a network error for testing error handling
   */
  private shouldSimulateError = false;
  private errorToSimulate: Error | null = null;

  /**
   * Configure the service to simulate an error on the next send
   */
  simulateErrorOnNextSend(error: Error): void {
    this.shouldSimulateError = true;
    this.errorToSimulate = error;
  }
}
