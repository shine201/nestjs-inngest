/**
 * Base interface for Inngest events
 */
export interface InngestEvent<T = any> {
  /**
   * The name of the event
   */
  name: string;

  /**
   * The event data payload
   */
  data: T;

  /**
   * Optional user information
   */
  user?: {
    id: string;
    email?: string;
    [key: string]: any;
  };

  /**
   * Event timestamp (defaults to current time if not provided)
   */
  ts?: number;

  /**
   * Unique event ID (auto-generated if not provided)
   */
  id?: string;

  /**
   * Optional version for event schema versioning
   */
  v?: string;
}

/**
 * Type for event name extraction
 */
export type EventName<T extends InngestEvent> = T["name"];

/**
 * Type for event data extraction
 */
export type EventData<T extends InngestEvent> = T["data"];

/**
 * Utility type for creating typed events
 */
export type TypedEvent<
  TName extends string,
  TData = any
> = InngestEvent<TData> & {
  name: TName;
};

/**
 * Batch of events for bulk sending
 */
export type InngestEventBatch = InngestEvent[];
