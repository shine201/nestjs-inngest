import { GetStepTools, Inngest } from "inngest";
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
 * Step tools interface for function execution - extends official Inngest step tools
 * We can extend this with custom functionality while maintaining compatibility with Inngest types
 */
export interface StepTools extends GetStepTools<Inngest> {
  // We can add any additional step tools specific to our NestJS integration here
  // For now, we use the official Inngest step tools as the base
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
   * Step tools for orchestrating function execution - now properly typed with official Inngest types
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
 * Type for Inngest function handlers - supports original two-parameter pattern
 * Compatible with: async handleEvent(event, { step, logger, runId, attempt })
 * Now properly typed with official Inngest step tools instead of any
 */
export type InngestFunctionHandler<T = any> = (
  event: InngestEvent<T>,
  context: {
    step: StepTools;
    logger: {
      info(message: string, ...args: any[]): void;
      warn(message: string, ...args: any[]): void;
      error(message: string, ...args: any[]): void;
      debug(message: string, ...args: any[]): void;
    };
    runId: string;
    attempt: number;
  },
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
