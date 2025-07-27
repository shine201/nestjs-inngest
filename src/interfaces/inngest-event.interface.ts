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
 * Event schema definition for type safety
 */
export interface EventSchema<TName extends string = string, TData = any> {
  name: TName;
  data: TData;
}

/**
 * Event registry type for mapping event names to their data types
 */
export type EventRegistry = Record<string, any>;

/**
 * Default event registry (can be extended by users)
 */
export interface DefaultEventRegistry extends EventRegistry {
  // Users can extend this interface to add their own events
}

/**
 * Typed event based on registry
 */
export type RegistryEvent<
  TRegistry extends EventRegistry = DefaultEventRegistry,
  TName extends keyof TRegistry = keyof TRegistry
> = TName extends string ? TypedEvent<TName, TRegistry[TName]> : never;

/**
 * Extract event names from registry
 */
export type EventNames<TRegistry extends EventRegistry = DefaultEventRegistry> =
  keyof TRegistry & string;

/**
 * Extract event data type from registry
 */
export type EventDataType<
  TRegistry extends EventRegistry = DefaultEventRegistry,
  TName extends EventNames<TRegistry> = EventNames<TRegistry>
> = TRegistry[TName];

/**
 * Type-safe event creation helper
 */
export type CreateEvent<
  TRegistry extends EventRegistry = DefaultEventRegistry,
  TName extends EventNames<TRegistry> = EventNames<TRegistry>
> = {
  name: TName;
  data: EventDataType<TRegistry, TName>;
  user?: InngestEvent["user"];
  ts?: number;
  id?: string;
  v?: string;
};

/**
 * Event validation schema
 */
export interface EventValidationSchema<TData = any> {
  /**
   * Validate event data
   */
  validate: (data: unknown) => data is TData;

  /**
   * Transform/sanitize event data
   */
  transform?: (data: TData) => TData;

  /**
   * Schema description for documentation
   */
  description?: string;

  /**
   * Schema version
   */
  version?: string;
}

/**
 * Event schema registry for validation
 */
export type EventSchemaRegistry<
  TRegistry extends EventRegistry = DefaultEventRegistry
> = {
  [K in EventNames<TRegistry>]?: EventValidationSchema<
    EventDataType<TRegistry, K>
  >;
};

/**
 * Batch of events for bulk sending
 */
export type InngestEventBatch<
  TRegistry extends EventRegistry = DefaultEventRegistry
> = RegistryEvent<TRegistry>[];

/**
 * Event handler context with typed event
 */
export interface TypedEventContext<
  TRegistry extends EventRegistry = DefaultEventRegistry,
  TName extends EventNames<TRegistry> = EventNames<TRegistry>
> {
  event: RegistryEvent<TRegistry, TName>;
  runId: string;
  attempt: number;
}

/**
 * Event trigger configuration with type safety
 */
export interface TypedEventTrigger<
  TRegistry extends EventRegistry = DefaultEventRegistry,
  TName extends EventNames<TRegistry> = EventNames<TRegistry>
> {
  event: TName;
  if?: string;
  expression?: string;
}

/**
 * Cron trigger configuration
 */
export interface CronTrigger {
  cron: string;
  timezone?: string;
}

/**
 * Union of all trigger types
 */
export type FunctionTrigger<
  TRegistry extends EventRegistry = DefaultEventRegistry
> = TypedEventTrigger<TRegistry> | CronTrigger;
