import "reflect-metadata";

import {
  EventRegistry,
  DefaultEventRegistry,
  EventNames,
  FunctionTrigger,
  TypedEventContext,
} from "../interfaces/inngest-event.interface";
import { InngestFunctionError } from "../errors";
import { METADATA_KEYS, ERROR_MESSAGES } from "../constants";

/**
 * Type-safe Inngest function configuration
 */
export interface TypedInngestFunctionConfig<
  TRegistry extends EventRegistry = DefaultEventRegistry,
  TEventName extends EventNames<TRegistry> = EventNames<TRegistry>,
> {
  /**
   * Unique identifier for the function
   */
  id: string;

  /**
   * Human-readable name for the function
   */
  name?: string;

  /**
   * Function triggers (events or cron)
   */
  triggers: FunctionTrigger<TRegistry>[];

  /**
   * Function configuration options
   */
  config?: {
    /**
     * Maximum number of retries
     */
    retries?: number;

    /**
     * Function timeout in milliseconds
     */
    timeout?: number;

    /**
     * Rate limiting configuration
     */
    rateLimit?: {
      limit: number;
      period: string;
      key?: string;
    };

    /**
     * Concurrency configuration
     */
    concurrency?: {
      limit: number;
      key?: string;
    };

    /**
     * Batch configuration for event processing
     */
    batchEvents?: {
      maxSize: number;
      timeout: string;
    };

    /**
     * Priority level (1-4, where 1 is highest)
     */
    priority?: 1 | 2 | 3 | 4;
  };

  /**
   * Event name type constraint (for type inference)
   */
  _eventName?: TEventName;
}

/**
 * Type-safe function handler signature
 */
export type TypedFunctionHandler<
  TRegistry extends EventRegistry = DefaultEventRegistry,
  TEventName extends EventNames<TRegistry> = EventNames<TRegistry>,
  TReturn = any,
> = (
  context: TypedEventContext<TRegistry, TEventName>,
) => Promise<TReturn> | TReturn;

/**
 * Validates the typed Inngest function configuration
 */
function validateTypedFunctionConfig<
  TRegistry extends EventRegistry,
  TEventName extends EventNames<TRegistry>,
>(config: TypedInngestFunctionConfig<TRegistry, TEventName>): void {
  // Validate function ID
  if (!config.id || typeof config.id !== "string" || config.id.trim() === "") {
    throw new InngestFunctionError(
      ERROR_MESSAGES.INVALID_FUNCTION_ID,
      config.id,
    );
  }

  // Validate function ID format (should be kebab-case)
  const functionIdPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  if (!functionIdPattern.test(config.id)) {
    throw new InngestFunctionError(
      'Function ID must be in kebab-case format (e.g., "user-created", "order-completed")',
      config.id,
    );
  }

  // Validate triggers
  if (
    !config.triggers ||
    !Array.isArray(config.triggers) ||
    config.triggers.length === 0
  ) {
    throw new InngestFunctionError(ERROR_MESSAGES.INVALID_TRIGGERS, config.id);
  }

  // Validate each trigger
  config.triggers.forEach((trigger, index) => {
    if ("event" in trigger) {
      // Event trigger validation
      if (!trigger.event || typeof trigger.event !== "string") {
        throw new InngestFunctionError(
          `Invalid event trigger at index ${index}: event name must be a non-empty string`,
          config.id,
        );
      }
    } else if ("cron" in trigger) {
      // Cron trigger validation
      if (!trigger.cron || typeof trigger.cron !== "string") {
        throw new InngestFunctionError(
          `Invalid cron trigger at index ${index}: cron expression must be a non-empty string`,
          config.id,
        );
      }
    } else {
      throw new InngestFunctionError(
        `Invalid trigger at index ${index}: must be either event or cron trigger`,
        config.id,
      );
    }
  });

  // Validate configuration options
  if (config.config) {
    const { retries, timeout, rateLimit, concurrency, batchEvents, priority } =
      config.config;

    if (retries !== undefined && (typeof retries !== "number" || retries < 0)) {
      throw new InngestFunctionError(
        "Retries must be a non-negative number",
        config.id,
      );
    }

    if (
      timeout !== undefined &&
      (typeof timeout !== "number" || timeout <= 0)
    ) {
      throw new InngestFunctionError(
        "Timeout must be a positive number",
        config.id,
      );
    }

    if (rateLimit) {
      if (typeof rateLimit.limit !== "number" || rateLimit.limit <= 0) {
        throw new InngestFunctionError(
          "Rate limit must be a positive number",
          config.id,
        );
      }
      if (!rateLimit.period || typeof rateLimit.period !== "string") {
        throw new InngestFunctionError(
          "Rate limit period must be a non-empty string",
          config.id,
        );
      }
    }

    if (concurrency) {
      if (typeof concurrency.limit !== "number" || concurrency.limit <= 0) {
        throw new InngestFunctionError(
          "Concurrency limit must be a positive number",
          config.id,
        );
      }
    }

    if (batchEvents) {
      if (typeof batchEvents.maxSize !== "number" || batchEvents.maxSize <= 0) {
        throw new InngestFunctionError(
          "Batch max size must be a positive number",
          config.id,
        );
      }
      if (!batchEvents.timeout || typeof batchEvents.timeout !== "string") {
        throw new InngestFunctionError(
          "Batch timeout must be a non-empty string",
          config.id,
        );
      }
    }

    if (priority !== undefined && ![1, 2, 3, 4].includes(priority)) {
      throw new InngestFunctionError(
        "Priority must be 1, 2, 3, or 4",
        config.id,
      );
    }
  }
}

/**
 * Type-safe Inngest function decorator
 *
 * @example
 * ```typescript
 * interface MyEventRegistry {
 *   'user.created': { userId: string; email: string };
 *   'order.completed': { orderId: string; amount: number };
 * }
 *
 * @TypedInngestFunction<MyEventRegistry, 'user.created'>({
 *   id: 'handle-user-created',
 *   name: 'Handle User Created',
 *   triggers: [{ event: 'user.created' }]
 * })
 * async handleUserCreated({ event }: TypedEventContext<MyEventRegistry, 'user.created'>) {
 *   // event.data is typed as { userId: string; email: string }
 *   console.log(`User ${event.data.userId} created with email ${event.data.email}`);
 * }
 * ```
 */
export function TypedInngestFunction<
  TRegistry extends EventRegistry = DefaultEventRegistry,
  TEventName extends EventNames<TRegistry> = EventNames<TRegistry>,
>(config: TypedInngestFunctionConfig<TRegistry, TEventName>): MethodDecorator {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    try {
      // Validate configuration
      validateTypedFunctionConfig(config);

      // Store metadata for the function registry (match InngestFunction structure)
      const metadata = {
        target,
        propertyKey: propertyKey as string,
        config: config,
        handler: descriptor.value,
      };

      // Get existing metadata array from class
      const existingMetadata =
        Reflect.getMetadata(METADATA_KEYS.INNGEST_FUNCTION, target) || [];

      // Add this function's metadata to the array
      existingMetadata.push(metadata);

      // Set metadata on class (for function discovery)
      Reflect.defineMetadata(
        METADATA_KEYS.INNGEST_FUNCTION,
        existingMetadata,
        target,
      );

      // Also set metadata on method (for individual access)
      Reflect.defineMetadata(
        METADATA_KEYS.INNGEST_FUNCTION,
        metadata,
        target,
        propertyKey,
      );

      return descriptor;
    } catch (error) {
      if (error instanceof InngestFunctionError) {
        throw error;
      }
      throw new InngestFunctionError(
        `Failed to register Inngest function: ${
          error instanceof Error ? error.message : String(error)
        }`,
        config.id,
        error as Error,
      );
    }
  };
}

/**
 * Type helper for creating event-specific decorators
 */
export function createEventDecorator<
  TRegistry extends EventRegistry,
  TEventName extends EventNames<TRegistry>,
>(eventName: TEventName) {
  return function EventSpecificDecorator(
    config: Omit<
      TypedInngestFunctionConfig<TRegistry, TEventName>,
      "triggers"
    > & {
      triggers?: FunctionTrigger<TRegistry>[];
    },
  ): MethodDecorator {
    const fullConfig: TypedInngestFunctionConfig<TRegistry, TEventName> = {
      ...config,
      triggers: config.triggers || [{ event: eventName }],
    };

    return TypedInngestFunction<TRegistry, TEventName>(fullConfig);
  };
}

/**
 * Type helper for creating cron-based decorators
 */
export function CronFunction(
  config: Omit<TypedInngestFunctionConfig, "triggers"> & {
    cron: string;
    timezone?: string;
  },
): MethodDecorator {
  const fullConfig: TypedInngestFunctionConfig = {
    ...config,
    triggers: [{ cron: config.cron, timezone: config.timezone }],
  };

  return TypedInngestFunction(fullConfig);
}

/**
 * Utility type for extracting event name from decorator
 */
export type ExtractEventName<T> =
  T extends TypedInngestFunctionConfig<any, infer U> ? U : never;

/**
 * Utility type for extracting registry from decorator
 */
export type ExtractRegistry<T> =
  T extends TypedInngestFunctionConfig<infer U, any> ? U : never;
