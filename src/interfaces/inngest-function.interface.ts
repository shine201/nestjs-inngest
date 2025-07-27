import { InngestEvent, CronTrigger } from "./inngest-event.interface";

/**
 * Rate limiting configuration
 */
export interface RateLimit {
  /**
   * Maximum number of function executions per period
   */
  limit: number;

  /**
   * Time period in seconds
   */
  period: string;

  /**
   * Optional key for rate limiting (defaults to function ID)
   */
  key?: string;
}

/**
 * Concurrency configuration
 */
export interface ConcurrencyConfig {
  /**
   * Maximum number of concurrent executions
   */
  limit: number;

  /**
   * Optional key for concurrency limiting (defaults to function ID)
   */
  key?: string;
}

/**
 * Event trigger configuration
 */
export interface EventTrigger {
  /**
   * Event name to trigger on
   */
  event: string;

  /**
   * Optional condition expression
   */
  if?: string;
}

// CronTrigger is imported from inngest-event.interface.ts

/**
 * Union type for all trigger types
 */
export type InngestTrigger = EventTrigger | CronTrigger;

/**
 * Configuration for an Inngest function
 */
export interface InngestFunctionConfig {
  /**
   * Unique identifier for the function
   */
  id: string;

  /**
   * Human-readable name for the function
   */
  name?: string;

  /**
   * Array of triggers that will invoke this function
   */
  triggers: InngestTrigger[];

  /**
   * Concurrency configuration
   */
  concurrency?: number | ConcurrencyConfig;

  /**
   * Rate limiting configuration
   */
  rateLimit?: RateLimit;

  /**
   * Number of retries on failure (defaults to 3)
   */
  retries?: number;

  /**
   * Timeout in milliseconds (defaults to 30000)
   */
  timeout?: number;
}

/**
 * Step tools interface for function execution
 */
export interface StepTools {
  /**
   * Run a step with automatic retries and error handling
   */
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>;

  /**
   * Sleep for a specified duration
   */
  sleep(duration: string | number): Promise<void>;

  /**
   * Wait for an event
   */
  waitForEvent(
    event: string,
    options?: { timeout?: string | number; if?: string }
  ): Promise<InngestEvent>;

  /**
   * Send an event from within a function
   */
  sendEvent(event: InngestEvent | InngestEvent[]): Promise<void>;

  /**
   * Invoke another function
   */
  invoke<T>(functionId: string, data?: any): Promise<T>;
}

/**
 * Context object passed to Inngest functions
 */
export interface InngestFunctionContext<T = any> {
  /**
   * The event that triggered this function
   */
  event: InngestEvent<T>;

  /**
   * Step tools for orchestrating function execution
   */
  step: StepTools;

  /**
   * Logger instance
   */
  logger: {
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
  };

  /**
   * Function run ID
   */
  runId: string;

  /**
   * Attempt number (for retries)
   */
  attempt: number;
}

/**
 * Type for Inngest function handlers
 */
export type InngestFunctionHandler<T = any> = (
  context: InngestFunctionContext<T>
) => Promise<any>;

/**
 * Metadata for registered Inngest functions
 */
export interface InngestFunctionMetadata {
  /**
   * The target class instance
   */
  target: any;

  /**
   * The method name
   */
  propertyKey: string;

  /**
   * Function configuration
   */
  config: InngestFunctionConfig;

  /**
   * The actual handler function
   */
  handler: InngestFunctionHandler;
}
