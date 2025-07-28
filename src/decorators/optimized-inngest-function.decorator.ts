import "reflect-metadata";

import { InngestFunctionConfig } from "../interfaces/inngest-function.interface";
import { InngestFunctionError } from "../errors";
import { METADATA_KEYS, ERROR_MESSAGES } from "../constants";
import { MetadataProcessor } from "../utils/metadata-processor";

/**
 * Decorator registry for tracking decorated methods across the application
 */
const decoratorRegistry = new Map<string, Set<string>>();
const classMetadataCache = new Map<any, any[]>();

/**
 * Performance-optimized Inngest function decorator
 *
 * Optimizations:
 * 1. Cached validation and normalization
 * 2. Fast duplicate detection
 * 3. Efficient metadata storage
 * 4. Lazy metadata processing
 * 5. Memory-efficient object creation
 */
export function OptimizedInngestFunction(
  config: InngestFunctionConfig,
): MethodDecorator {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const startTime = performance.now();

    try {
      // Validate property descriptor
      if (!descriptor || typeof descriptor !== "object") {
        console.warn(
          `Invalid property descriptor for function ${config.id}. Skipping registration.`,
        );
        return;
      }

      // Fast validation using cached processor
      MetadataProcessor.validateFunctionConfig(config);

      // Fast normalization with caching
      const normalizedConfig =
        MetadataProcessor.normalizeFunctionConfig(config);

      // Efficient duplicate detection
      validateNoDuplicatesOptimized(target, normalizedConfig);

      // Optimized metadata storage with fallback
      try {
        storeMetadataOptimized(
          target,
          propertyKey as string,
          normalizedConfig,
          descriptor,
        );
      } catch (metadataError) {
        // Graceful fallback when Reflect is not available
        if (!Reflect.defineMetadata) {
          console.warn(
            `Metadata storage not available for function ${normalizedConfig.id}. Function will still work but may not be discoverable.`,
          );
          return;
        }
        throw metadataError;
      }

      // Track registration performance
      const registrationTime = performance.now() - startTime;
      if (registrationTime > 1) {
        // Only log if registration takes > 1ms
        console.debug(
          `Function ${normalizedConfig.id} registration took ${registrationTime.toFixed(2)}ms`,
        );
      }
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
 * Optimized duplicate detection using registry tracking
 */
function validateNoDuplicatesOptimized(
  target: any,
  config: InngestFunctionConfig,
): void {
  const className = target.constructor.name;
  const functionId = config.id;

  // Check global registry for duplicates
  if (!decoratorRegistry.has(className)) {
    decoratorRegistry.set(className, new Set());
  }

  const classRegistry = decoratorRegistry.get(className)!;

  if (classRegistry.has(functionId)) {
    throw new InngestFunctionError(
      ERROR_MESSAGES.DUPLICATE_FUNCTION_ID,
      functionId,
    );
  }

  // Check existing metadata for duplicates
  const existingMetadata = getExistingMetadataOptimized(target);
  const duplicateFunction = existingMetadata.find(
    (meta: any) => meta.config.id === functionId,
  );

  if (duplicateFunction) {
    throw new InngestFunctionError(
      ERROR_MESSAGES.DUPLICATE_FUNCTION_ID,
      functionId,
    );
  }

  // Register the function ID
  classRegistry.add(functionId);
}

/**
 * Optimized metadata retrieval with caching
 */
function getExistingMetadataOptimized(target: any): any[] {
  // Check cache first
  if (classMetadataCache.has(target)) {
    return classMetadataCache.get(target)!;
  }

  // Retrieve metadata efficiently
  const metadata = MetadataProcessor.extractMetadata(
    target,
    METADATA_KEYS.INNGEST_FUNCTION,
  );

  // Cache the result
  classMetadataCache.set(target, metadata);

  return metadata;
}

/**
 * Optimized metadata storage with efficient object creation
 */
function storeMetadataOptimized(
  target: any,
  propertyKey: string,
  config: InngestFunctionConfig,
  descriptor: PropertyDescriptor,
): void {
  // Get existing metadata efficiently
  const existingMetadata = getExistingMetadataOptimized(target);

  // Create optimized metadata object
  const newMetadata = createOptimizedMetadata(
    target,
    propertyKey,
    config,
    descriptor,
  );

  // Use efficient array operations
  const updatedMetadata = [...existingMetadata, newMetadata];

  // Store metadata efficiently
  MetadataProcessor.storeMetadata(
    target,
    METADATA_KEYS.INNGEST_FUNCTION,
    updatedMetadata,
  );

  // Update cache
  classMetadataCache.set(target, updatedMetadata);

  // Set method-level metadata for quick access
  Reflect.defineMetadata(
    METADATA_KEYS.INNGEST_FUNCTION,
    newMetadata,
    target,
    propertyKey,
  );
}

/**
 * Creates optimized metadata objects with minimal memory footprint
 */
function createOptimizedMetadata(
  target: any,
  propertyKey: string,
  config: InngestFunctionConfig,
  descriptor: PropertyDescriptor,
): any {
  return {
    target,
    propertyKey,
    config,
    handler: descriptor.value,
    // Add performance tracking
    registrationTime: Date.now(),
    configHash: MetadataProcessor.hashConfig(config),
  };
}

/**
 * Optimized metadata retrieval helper with caching
 */
export function getOptimizedInngestFunctionMetadata(target: any): any[] {
  return getExistingMetadataOptimized(target);
}

/**
 * Fast function existence check
 */
export function isOptimizedInngestFunction(
  target: any,
  propertyKey: string,
): boolean {
  const className = target.constructor.name;
  const classRegistry = decoratorRegistry.get(className);

  if (!classRegistry) {
    return false;
  }

  // Fast check in registry first
  const metadata = getExistingMetadataOptimized(target);
  return metadata.some((meta) => meta.propertyKey === propertyKey);
}

/**
 * Optimized function configuration retrieval
 */
export function getOptimizedFunctionConfig(
  target: any,
  propertyKey: string,
): InngestFunctionConfig | undefined {
  const metadata = getExistingMetadataOptimized(target);
  const functionMeta = metadata.find(
    (meta) => meta.propertyKey === propertyKey,
  );
  return functionMeta?.config;
}

/**
 * Bulk metadata processing for better performance
 */
export function batchProcessMetadata(targets: any[]): Map<any, any[]> {
  const results = new Map<any, any[]>();

  for (const target of targets) {
    const metadata = getOptimizedInngestFunctionMetadata(target);
    if (metadata.length > 0) {
      results.set(target, metadata);
    }
  }

  return results;
}

/**
 * Optimized metadata validation for all functions on a class
 */
export function validateClassMetadata(target: any): void {
  const metadata = getOptimizedInngestFunctionMetadata(target);
  const configs = metadata.map((meta) => meta.config);

  // Use batch validation for better performance
  MetadataProcessor.batchValidateConfigs(configs);
}

/**
 * Memory management: clears caches and registries
 */
export function clearOptimizedCaches(): void {
  decoratorRegistry.clear();
  classMetadataCache.clear();
  MetadataProcessor.clearCaches();
}

/**
 * Gets performance statistics for the optimized decorator
 */
export function getDecoratorPerformanceStats(): {
  registeredClasses: number;
  totalFunctions: number;
  cacheHitRate: number;
  memoryUsage: number;
} {
  let totalFunctions = 0;
  for (const classRegistry of decoratorRegistry.values()) {
    totalFunctions += classRegistry.size;
  }

  const cacheHitRate =
    classMetadataCache.size > 0 ? totalFunctions / classMetadataCache.size : 0;

  const memoryUsage =
    decoratorRegistry.size * 100 + // Registry overhead
    classMetadataCache.size * 500 + // Cache overhead
    totalFunctions * 200; // Function metadata overhead

  const metadataProcessorStats = MetadataProcessor.getCacheStats();

  return {
    registeredClasses: decoratorRegistry.size,
    totalFunctions,
    cacheHitRate,
    memoryUsage: memoryUsage + metadataProcessorStats.estimatedMemoryUsage,
  };
}

/**
 * Optimized function metadata lookup by ID across all classes
 */
export function findFunctionMetadataById(functionId: string): {
  target: any;
  metadata: any;
} | null {
  // Search through cached metadata efficiently
  for (const [target, metadataArray] of classMetadataCache.entries()) {
    const metadata = metadataArray.find(
      (meta) => meta.config.id === functionId,
    );
    if (metadata) {
      return { target, metadata };
    }
  }

  return null;
}

/**
 * Optimized bulk function lookup by multiple IDs
 */
export function bulkFindFunctionMetadata(functionIds: string[]): Map<
  string,
  {
    target: any;
    metadata: any;
  }
> {
  const results = new Map<string, { target: any; metadata: any }>();
  const remainingIds = new Set(functionIds);

  // Search through cached metadata efficiently
  for (const [target, metadataArray] of classMetadataCache.entries()) {
    for (const metadata of metadataArray) {
      const id = metadata.config.id;
      if (remainingIds.has(id)) {
        results.set(id, { target, metadata });
        remainingIds.delete(id);

        // Early exit if all functions found
        if (remainingIds.size === 0) {
          return results;
        }
      }
    }
  }

  return results;
}

/**
 * Performance-optimized metadata serialization for caching
 */
export function serializeMetadataForCache(metadata: any[]): string {
  // Create a lightweight representation for caching
  const lightweightMetadata = metadata.map((meta) => ({
    propertyKey: meta.propertyKey,
    configId: meta.config.id,
    configHash: meta.configHash,
    registrationTime: meta.registrationTime,
  }));

  return JSON.stringify(lightweightMetadata);
}

/**
 * Deserializes cached metadata efficiently
 */
export function deserializeMetadataFromCache(
  serialized: string,
  target: any,
): any[] | null {
  try {
    const lightweightMetadata = JSON.parse(serialized);

    // Reconstruct full metadata from cached data
    const fullMetadata = [];
    for (const light of lightweightMetadata) {
      const method = target[light.propertyKey];
      if (typeof method === "function") {
        // Reconstruct metadata object
        fullMetadata.push({
          target,
          propertyKey: light.propertyKey,
          handler: method.bind(target),
          configHash: light.configHash,
          registrationTime: light.registrationTime,
        });
      }
    }

    return fullMetadata;
  } catch {
    return null;
  }
}

// Export the optimized decorator as the main decorator for backward compatibility
export { OptimizedInngestFunction as InngestFunction };
