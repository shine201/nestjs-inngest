import "reflect-metadata";

import { InngestFunctionConfig } from "../interfaces/inngest-function.interface";
import { InngestFunctionError } from "../errors";
import { METADATA_KEYS, ERROR_MESSAGES } from "../constants";

/**
 * Validates the Inngest function configuration
 */
function validateFunctionConfig(config: InngestFunctionConfig): void {
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
    if (!trigger || typeof trigger !== "object") {
      throw new InngestFunctionError(
        `Trigger at index ${index} must be a valid object`,
        config.id,
      );
    }

    // Check if it's an event trigger
    if ("event" in trigger) {
      if (
        !trigger.event ||
        typeof trigger.event !== "string" ||
        trigger.event.trim() === ""
      ) {
        throw new InngestFunctionError(
          `Event trigger at index ${index} must have a valid event name`,
          config.id,
        );
      }

      // Validate event name format
      const eventNamePattern = /^[a-z0-9]+(\.[a-z0-9]+)*$/;
      if (!eventNamePattern.test(trigger.event)) {
        throw new InngestFunctionError(
          `Event name "${trigger.event}" must be in kebab-case format with dots (e.g., "user.created")`,
          config.id,
        );
      }

      // Validate optional condition
      if (
        trigger.if &&
        (typeof trigger.if !== "string" || trigger.if.trim() === "")
      ) {
        throw new InngestFunctionError(
          `Event trigger condition at index ${index} must be a non-empty string`,
          config.id,
        );
      }
    }
    // Check if it's a cron trigger
    else if ("cron" in trigger) {
      if (
        !trigger.cron ||
        typeof trigger.cron !== "string" ||
        trigger.cron.trim() === ""
      ) {
        throw new InngestFunctionError(
          `Cron trigger at index ${index} must have a valid cron expression`,
          config.id,
        );
      }

      // Basic cron validation (5 or 6 parts)
      const cronParts = trigger.cron.trim().split(/\s+/);
      if (cronParts.length < 5 || cronParts.length > 6) {
        throw new InngestFunctionError(
          `Invalid cron expression "${trigger.cron}". Must have 5 or 6 parts.`,
          config.id,
        );
      }
    } else {
      throw new InngestFunctionError(
        `Trigger at index ${index} must be either an event trigger or cron trigger`,
        config.id,
      );
    }
  });

  // Validate optional name
  if (
    config.name !== undefined &&
    (typeof config.name !== "string" || config.name.trim() === "")
  ) {
    throw new InngestFunctionError(
      "Function name must be a non-empty string if provided",
      config.id,
    );
  }

  // Validate optional concurrency
  if (config.concurrency !== undefined) {
    if (typeof config.concurrency === "number") {
      if (config.concurrency < 1 || config.concurrency > 1000) {
        throw new InngestFunctionError(
          "Concurrency limit must be between 1 and 1000",
          config.id,
        );
      }
    } else if (
      typeof config.concurrency === "object" &&
      config.concurrency !== null
    ) {
      if (typeof config.concurrency.limit !== "number") {
        throw new InngestFunctionError(
          "Concurrency configuration must have a valid limit",
          config.id,
        );
      }
      if (config.concurrency.limit < 1 || config.concurrency.limit > 1000) {
        throw new InngestFunctionError(
          "Concurrency limit must be between 1 and 1000",
          config.id,
        );
      }
    } else {
      throw new InngestFunctionError(
        "Concurrency must be a number or concurrency configuration object",
        config.id,
      );
    }
  }

  // Validate optional rate limit
  if (config.rateLimit !== undefined) {
    if (
      !config.rateLimit.limit ||
      typeof config.rateLimit.limit !== "number" ||
      config.rateLimit.limit < 1
    ) {
      throw new InngestFunctionError(
        "Rate limit must have a valid limit greater than 0",
        config.id,
      );
    }
    if (
      !config.rateLimit.period ||
      typeof config.rateLimit.period !== "string"
    ) {
      throw new InngestFunctionError(
        'Rate limit must have a valid period string (e.g., "1m", "1h")',
        config.id,
      );
    }
  }

  // Validate optional retries
  if (config.retries !== undefined) {
    if (
      typeof config.retries !== "number" ||
      config.retries < 0 ||
      config.retries > 10
    ) {
      throw new InngestFunctionError(
        "Retries must be a number between 0 and 10",
        config.id,
      );
    }
  }

  // Validate optional timeout
  if (config.timeout !== undefined) {
    if (
      typeof config.timeout !== "number" ||
      config.timeout < 1000 ||
      config.timeout > 300000
    ) {
      throw new InngestFunctionError(
        "Timeout must be a number between 1000ms (1s) and 300000ms (5m)",
        config.id,
      );
    }
  }
}

/**
 * Normalizes the function configuration with defaults
 */
function normalizeFunctionConfig(
  config: InngestFunctionConfig,
): InngestFunctionConfig {
  return {
    ...config,
    name: config.name || config.id,
    retries: config.retries ?? 3,
    timeout: config.timeout ?? 30000,
  };
}

/**
 * Decorator for marking methods as Inngest functions
 *
 * @param config - Configuration for the Inngest function
 * @returns Method decorator
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class UserService {
 *   @InngestFunction({
 *     id: 'user-created',
 *     name: 'Handle User Created',
 *     triggers: [{ event: 'user.created' }],
 *   })
 *   async handleUserCreated(
 *     { event, step }: InngestFunctionContext<UserCreatedEvent>
 *   ) {
 *     // Function implementation
 *   }
 * }
 * ```
 */
export function InngestFunction(
  config: InngestFunctionConfig,
): MethodDecorator {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    try {
      // Validate the configuration
      validateFunctionConfig(config);

      // Normalize the configuration
      const normalizedConfig = normalizeFunctionConfig(config);

      // Store the metadata
      const existingMetadata =
        Reflect.getMetadata(METADATA_KEYS.INNGEST_FUNCTION, target) || [];
      const newMetadata = {
        target,
        propertyKey: propertyKey as string,
        config: normalizedConfig,
        handler: descriptor.value,
      };

      // Check for duplicate function IDs on the same class
      const duplicateFunction = existingMetadata.find(
        (meta: any) => meta.config.id === normalizedConfig.id,
      );
      if (duplicateFunction) {
        throw new InngestFunctionError(
          ERROR_MESSAGES.DUPLICATE_FUNCTION_ID,
          normalizedConfig.id,
        );
      }

      // Add to metadata
      existingMetadata.push(newMetadata);
      Reflect.defineMetadata(
        METADATA_KEYS.INNGEST_FUNCTION,
        existingMetadata,
        target,
      );

      // Also set metadata on the method itself for easier access
      Reflect.defineMetadata(
        METADATA_KEYS.INNGEST_FUNCTION,
        normalizedConfig,
        target,
        propertyKey,
      );
    } catch (error) {
      if (error instanceof InngestFunctionError) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new InngestFunctionError(
        `Failed to register Inngest function: ${errorMessage}`,
        config.id,
        error as Error,
      );
    }
  };
}

/**
 * Helper function to get Inngest function metadata from a class
 */
export function getInngestFunctionMetadata(target: any): any[] {
  return Reflect.getMetadata(METADATA_KEYS.INNGEST_FUNCTION, target) || [];
}

/**
 * Helper function to check if a method is an Inngest function
 */
export function isInngestFunction(target: any, propertyKey: string): boolean {
  const metadata = getInngestFunctionMetadata(target);
  return metadata.some((meta) => meta.propertyKey === propertyKey);
}

/**
 * Helper function to get function configuration from a method
 */
export function getFunctionConfig(
  target: any,
  propertyKey: string,
): InngestFunctionConfig | undefined {
  const metadata = getInngestFunctionMetadata(target);
  const functionMeta = metadata.find(
    (meta) => meta.propertyKey === propertyKey,
  );
  return functionMeta?.config;
}
