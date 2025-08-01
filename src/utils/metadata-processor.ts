import "reflect-metadata";

import { InngestFunctionConfig } from "../interfaces/inngest-function.interface";
import { InngestFunctionError } from "../errors";
import { ERROR_MESSAGES } from "../constants";

/**
 * Validation cache to avoid re-validating identical configurations
 */
const validationCache = new Map<string, boolean>();
const normalizationCache = new Map<string, InngestFunctionConfig>();

/**
 * Performance-optimized metadata processor
 *
 * Optimizations:
 * 1. Validation result caching
 * 2. Pre-compiled regex patterns
 * 3. Early returns for common cases
 * 4. Batch validation operations
 * 5. Memory-efficient string operations
 */
export class MetadataProcessor {
  // Pre-compiled regex patterns for better performance
  private static readonly FUNCTION_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  private static readonly EVENT_NAME_PATTERN = /^[a-z0-9]+(\.[a-z0-9]+)*$/;
  private static readonly CRON_PATTERN = /^(\S+\s+){4,5}\S+$/;

  // Configuration validation rules
  private static readonly VALIDATION_RULES = {
    functionId: {
      minLength: 1,
      maxLength: 100,
      pattern: MetadataProcessor.FUNCTION_ID_PATTERN,
    },
    eventName: {
      minLength: 1,
      maxLength: 200,
      pattern: MetadataProcessor.EVENT_NAME_PATTERN,
    },
    concurrency: {
      min: 1,
      max: 1000,
    },
    retries: {
      min: 0,
      max: 10,
    },
    timeout: {
      min: 1000,
      max: 300000,
    },
  };

  /**
   * Creates a cache key for validation/normalization caching
   */
  private static createCacheKey(config: InngestFunctionConfig): string {
    return JSON.stringify({
      id: config.id,
      triggers: config.triggers,
      concurrency: config.concurrency,
      rateLimit: config.rateLimit,
      retries: config.retries,
      timeout: config.timeout,
      name: config.name,
    });
  }

  /**
   * Validates function configuration with caching
   */
  static validateFunctionConfig(config: InngestFunctionConfig): void {
    const cacheKey = this.createCacheKey(config);

    // Check validation cache first
    if (validationCache.has(cacheKey)) {
      return; // Already validated
    }

    try {
      this.performValidation(config);
      validationCache.set(cacheKey, true);
    } catch (error) {
      // Don't cache validation failures
      throw error;
    }
  }

  /**
   * Performs the actual validation logic
   */
  private static performValidation(config: InngestFunctionConfig): void {
    // Validate function ID with optimized checks
    this.validateFunctionId(config.id);

    // Validate triggers efficiently
    this.validateTriggers(config.triggers, config.id);

    // Validate optional configurations
    if (config.name !== undefined) {
      this.validateFunctionName(config.name, config.id);
    }

    if (config.concurrency !== undefined) {
      this.validateConcurrency(config.concurrency, config.id);
    }

    if (config.rateLimit !== undefined) {
      this.validateRateLimit(config.rateLimit, config.id);
    }

    if (config.retries !== undefined) {
      this.validateRetries(config.retries, config.id);
    }

    if (config.timeout !== undefined) {
      this.validateTimeout(config.timeout, config.id);
    }
  }

  /**
   * Optimized function ID validation
   */
  private static validateFunctionId(id: any): void {
    if (!id || typeof id !== "string") {
      throw new InngestFunctionError(ERROR_MESSAGES.INVALID_FUNCTION_ID, id);
    }

    const trimmedId = id.trim();
    if (trimmedId === "") {
      throw new InngestFunctionError(ERROR_MESSAGES.INVALID_FUNCTION_ID, id);
    }

    const rules = this.VALIDATION_RULES.functionId;
    if (
      trimmedId.length < rules.minLength ||
      trimmedId.length > rules.maxLength
    ) {
      throw new InngestFunctionError(
        `Function ID must be between ${rules.minLength} and ${rules.maxLength} characters`,
        id,
      );
    }

    if (!rules.pattern.test(trimmedId)) {
      throw new InngestFunctionError(
        'Function ID must be in kebab-case format (e.g., "user-created", "order-completed")',
        id,
      );
    }
  }

  /**
   * Optimized triggers validation with batch processing
   */
  private static validateTriggers(triggers: any, functionId: string): void {
    if (!triggers || !Array.isArray(triggers) || triggers.length === 0) {
      throw new InngestFunctionError(
        ERROR_MESSAGES.INVALID_TRIGGERS,
        functionId,
      );
    }

    // Validate triggers in batch for better performance
    const validationErrors: string[] = [];

    for (let i = 0; i < triggers.length; i++) {
      const trigger = triggers[i];

      if (!trigger || typeof trigger !== "object") {
        validationErrors.push(`Trigger at index ${i} must be a valid object`);
        continue;
      }

      try {
        if ("event" in trigger) {
          this.validateEventTrigger(trigger, i);
        } else if ("cron" in trigger) {
          this.validateCronTrigger(trigger, i);
        } else {
          validationErrors.push(
            `Trigger at index ${i} must be either an event trigger or cron trigger`,
          );
        }
      } catch (error) {
        validationErrors.push(
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    if (validationErrors.length > 0) {
      throw new InngestFunctionError(
        `Trigger validation failed:\n${validationErrors.join("\n")}`,
        functionId,
      );
    }
  }

  /**
   * Optimized event trigger validation
   */
  private static validateEventTrigger(trigger: any, index: number): void {
    if (!trigger.event || typeof trigger.event !== "string") {
      throw new Error(
        `Event trigger at index ${index} must have a valid event name`,
      );
    }

    const eventName = trigger.event.trim();
    const rules = this.VALIDATION_RULES.eventName;

    if (
      eventName.length < rules.minLength ||
      eventName.length > rules.maxLength
    ) {
      throw new Error(
        `Event name at index ${index} must be between ${rules.minLength} and ${rules.maxLength} characters`,
      );
    }

    if (!rules.pattern.test(eventName)) {
      throw new Error(
        `Event name "${eventName}" must be in kebab-case format with dots (e.g., "user.created")`,
      );
    }

    // Validate optional condition
    if (
      trigger.if &&
      (typeof trigger.if !== "string" || trigger.if.trim() === "")
    ) {
      throw new Error(
        `Event trigger condition at index ${index} must be a non-empty string`,
      );
    }
  }

  /**
   * Optimized cron trigger validation
   */
  private static validateCronTrigger(trigger: any, index: number): void {
    if (!trigger.cron || typeof trigger.cron !== "string") {
      throw new Error(
        `Cron trigger at index ${index} must have a valid cron expression`,
      );
    }

    const cronExpression = trigger.cron.trim();

    // Use pre-compiled regex for better performance
    if (!this.CRON_PATTERN.test(cronExpression)) {
      throw new Error(
        `Invalid cron expression "${cronExpression}". Must have 5 or 6 parts.`,
      );
    }
  }

  /**
   * Optimized function name validation
   */
  private static validateFunctionName(name: any, functionId: string): void {
    if (typeof name !== "string" || name.trim() === "") {
      throw new InngestFunctionError(
        "Function name must be a non-empty string if provided",
        functionId,
      );
    }
  }

  /**
   * Optimized concurrency validation
   */
  private static validateConcurrency(
    concurrency: any,
    functionId: string,
  ): void {
    const rules = this.VALIDATION_RULES.concurrency;

    if (typeof concurrency === "number") {
      if (concurrency < rules.min || concurrency > rules.max) {
        throw new InngestFunctionError(
          `Concurrency limit must be between ${rules.min} and ${rules.max}`,
          functionId,
        );
      }
    } else if (typeof concurrency === "object" && concurrency !== null) {
      if (typeof concurrency.limit !== "number") {
        throw new InngestFunctionError(
          "Concurrency configuration must have a valid limit",
          functionId,
        );
      }
      if (concurrency.limit < rules.min || concurrency.limit > rules.max) {
        throw new InngestFunctionError(
          `Concurrency limit must be between ${rules.min} and ${rules.max}`,
          functionId,
        );
      }
    } else {
      throw new InngestFunctionError(
        "Concurrency must be a number or concurrency configuration object",
        functionId,
      );
    }
  }

  /**
   * Optimized rate limit validation
   */
  private static validateRateLimit(rateLimit: any, functionId: string): void {
    if (
      !rateLimit.limit ||
      typeof rateLimit.limit !== "number" ||
      rateLimit.limit < 1
    ) {
      throw new InngestFunctionError(
        "Rate limit must have a valid limit greater than 0",
        functionId,
      );
    }

    if (!rateLimit.period || typeof rateLimit.period !== "string") {
      throw new InngestFunctionError(
        'Rate limit must have a valid period string (e.g., "1m", "1h")',
        functionId,
      );
    }
  }

  /**
   * Optimized retries validation
   */
  private static validateRetries(retries: any, functionId: string): void {
    const rules = this.VALIDATION_RULES.retries;

    if (
      typeof retries !== "number" ||
      retries < rules.min ||
      retries > rules.max
    ) {
      throw new InngestFunctionError(
        `Retries must be a number between ${rules.min} and ${rules.max}`,
        functionId,
      );
    }
  }

  /**
   * Optimized timeout validation
   */
  private static validateTimeout(timeout: any, functionId: string): void {
    const rules = this.VALIDATION_RULES.timeout;

    if (
      typeof timeout !== "number" ||
      timeout < rules.min ||
      timeout > rules.max
    ) {
      throw new InngestFunctionError(
        `Timeout must be a number between ${rules.min}ms (1s) and ${rules.max}ms (5m)`,
        functionId,
      );
    }
  }

  /**
   * Normalizes function configuration with caching
   */
  static normalizeFunctionConfig(
    config: InngestFunctionConfig,
  ): InngestFunctionConfig {
    const cacheKey = this.createCacheKey(config);

    // Check normalization cache first
    if (normalizationCache.has(cacheKey)) {
      return normalizationCache.get(cacheKey)!;
    }

    const normalizedConfig: InngestFunctionConfig = {
      ...config,
      name: config.name || config.id,
      retries: config.retries ?? 3,
      timeout: config.timeout ?? 30000,
    };

    // Cache the normalized configuration
    normalizationCache.set(cacheKey, normalizedConfig);

    return normalizedConfig;
  }

  /**
   * Batch validates multiple configurations for better performance
   */
  static batchValidateConfigs(configs: InngestFunctionConfig[]): void {
    const errors: string[] = [];

    // Process in parallel for better performance
    const validationPromises = configs.map(async (config) => {
      try {
        this.validateFunctionConfig(config);
      } catch (error) {
        errors.push(
          `Function ${config.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });

    Promise.all(validationPromises).then(() => {
      if (errors.length > 0) {
        throw new InngestFunctionError(
          `Batch validation failed:\n${errors.join("\n")}`,
          "batch-validation",
        );
      }
    });
  }

  /**
   * Optimized configuration comparison for duplicate detection
   */
  static areConfigsEquivalent(
    config1: InngestFunctionConfig,
    config2: InngestFunctionConfig,
  ): boolean {
    // Fast path: compare IDs first
    if (config1.id !== config2.id) {
      return false;
    }

    // Deep comparison of critical fields
    return (
      JSON.stringify(config1.triggers) === JSON.stringify(config2.triggers) &&
      config1.concurrency === config2.concurrency &&
      JSON.stringify(config1.rateLimit) === JSON.stringify(config2.rateLimit) &&
      config1.retries === config2.retries &&
      config1.timeout === config2.timeout
    );
  }

  /**
   * Clears validation and normalization caches (for testing or memory management)
   */
  static clearCaches(): void {
    validationCache.clear();
    normalizationCache.clear();
  }

  /**
   * Gets cache statistics for monitoring
   */
  static getCacheStats(): {
    validationCacheSize: number;
    normalizationCacheSize: number;
    estimatedMemoryUsage: number;
  } {
    const validationCacheSize = validationCache.size;
    const normalizationCacheSize = normalizationCache.size;

    // Rough estimate of memory usage
    const estimatedMemoryUsage =
      validationCacheSize * 100 + // Approximate validation cache entry size
      normalizationCacheSize * 500; // Approximate normalization cache entry size

    return {
      validationCacheSize,
      normalizationCacheSize,
      estimatedMemoryUsage,
    };
  }

  /**
   * Optimized metadata extraction from class prototypes
   */
  static extractMetadata(prototype: any, metadataKey: string): any[] {
    // Use efficient metadata access
    const metadata = Reflect.getMetadata(metadataKey, prototype);

    if (!metadata || !Array.isArray(metadata)) {
      return [];
    }

    // Return a copy to prevent external modifications
    return [...metadata];
  }

  /**
   * Optimized metadata storage
   */
  static storeMetadata(target: any, metadataKey: string, metadata: any): void {
    // Use efficient metadata storage
    Reflect.defineMetadata(metadataKey, metadata, target);
  }

  /**
   * Performance-optimized configuration hashing for caching
   */
  static hashConfig(config: InngestFunctionConfig): string {
    // Create a fast hash of the configuration for caching
    const configString = JSON.stringify({
      id: config.id,
      triggers: config.triggers,
      concurrency: config.concurrency,
      rateLimit: config.rateLimit,
      retries: config.retries,
      timeout: config.timeout,
    });

    // Simple hash function for caching (not cryptographic)
    let hash = 0;
    for (let i = 0; i < configString.length; i++) {
      const char = configString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString(36);
  }
}
