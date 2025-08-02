import { Injectable, Logger } from "@nestjs/common";
import {
  OptimizedInngestFunction,
  CronFunction,
  getDecoratorPerformanceStats,
  clearOptimizedCaches,
  findFunctionMetadataById,
  bulkFindFunctionMetadata,
  getOptimizedInngestFunctionMetadata,
  isOptimizedInngestFunction,
  getOptimizedFunctionConfig,
  validateClassMetadata,
  InngestFunctionContext,
} from "nestjs-inngest";

/**
 * Service to test all OptimizedInngestFunction features
 */
@Injectable()
export class PerformanceTestService {
  private readonly logger = new Logger(PerformanceTestService.name);

  /**
   * Test basic optimized function
   */
  @OptimizedInngestFunction({
    id: "optimized-user-created",
    name: "Optimized User Created Handler",
    triggers: [{ event: "test.user.created" }],
    retries: 3,
    timeout: 30000,
    concurrency: { limit: 10 },
  })
  async handleOptimizedUserCreated(
    event: any,
    { step, logger, runId }: InngestFunctionContext,
  ) {
    logger.info(`Processing optimized user creation: ${event.data.userId}`);

    // Test step.run with optimization
    const profile = await step.run("create-optimized-profile", async () => {
      return {
        id: `profile-${event.data.userId}`,
        email: event.data.email,
        createdAt: new Date().toISOString(),
        optimized: true,
      };
    });

    // Test step.sleep
    await step.sleep("optimized-delay", "100ms");

    // Test step.sendEvent
    await step.sendEvent("send-optimized-notification", {
      name: "test.notification.sent",
      data: {
        userId: event.data.userId,
        type: "optimized-welcome",
        profileId: profile.id,
      },
    });

    this.logger.log(
      `Optimized function completed for user ${event.data.userId}`,
    );

    return {
      success: true,
      userId: event.data.userId,
      profileId: profile.id,
      runId,
      optimized: true,
    };
  }

  /**
   * Test high-frequency function
   */
  @OptimizedInngestFunction({
    id: "optimized-batch-processor",
    name: "Optimized Batch Processor",
    triggers: [{ event: "test.batch.process" }],
    retries: 5,
    timeout: 60000,
    concurrency: { limit: 50 },
  })
  async handleOptimizedBatch(
    event: any,
    { step, logger }: InngestFunctionContext,
  ) {
    const { items } = event.data;
    logger.info(`Processing optimized batch of ${items.length} items`);

    const results = await step.run("process-batch-items", async () => {
      return Promise.all(
        items.map(async (item: any, index: number) => {
          // Simulate processing
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            id: item.id,
            processed: true,
            index,
            timestamp: new Date().toISOString(),
          };
        }),
      );
    });

    // Send batch completion event
    await step.sendEvent("batch-completed", {
      name: "test.batch.completed",
      data: {
        batchId: event.data.batchId,
        processedCount: results.length,
        results,
      },
    });

    return {
      success: true,
      batchId: event.data.batchId,
      processedCount: results.length,
      optimized: true,
    };
  }

  /**
   * Test cron-based optimized function (every 1 minute)
   */
  @OptimizedInngestFunction({
    id: "optimized-cron-cleanup",
    name: "Optimized Cron Cleanup Task",
    triggers: [{ cron: "*/1 * * * *" }], // Every minute
    retries: 2,
    timeout: 15000,
  })
  async handleOptimizedCronCleanup(
    event: any,
    { step, logger }: InngestFunctionContext,
  ) {
    logger.info("Running optimized CRON cleanup task");

    const cleanupResult = await step.run("perform-cron-cleanup", async () => {
      // Simulate cleanup work
      const itemsToClean = Math.floor(Math.random() * 10) + 1;
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        type: "cron-triggered",
        itemsCleaned: itemsToClean,
        timestamp: new Date().toISOString(),
        optimized: true,
      };
    });

    return {
      success: true,
      triggerType: "cron",
      ...cleanupResult,
    };
  }

  /**
   * Test event-based optimized function (manual trigger for 10s testing)
   */
  @OptimizedInngestFunction({
    id: "optimized-event-cleanup",
    name: "Optimized Event Cleanup Task", 
    triggers: [{ event: "test.cleanup.trigger" }],
    retries: 2,
    timeout: 15000,
  })
  async handleOptimizedEventCleanup(
    event: any,
    { step, logger }: InngestFunctionContext,
  ) {
    logger.info("Running optimized EVENT cleanup task");

    const cleanupResult = await step.run("perform-event-cleanup", async () => {
      // Simulate cleanup work
      const itemsToClean = Math.floor(Math.random() * 10) + 1;
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        type: "event-triggered",
        itemsCleaned: itemsToClean,
        timestamp: new Date().toISOString(),
        optimized: true,
        eventData: event.data,
      };
    });

    return {
      success: true,
      triggerType: "event",
      ...cleanupResult,
    };
  }

  /**
   * Test CronFunction decorator (typed cron with type safety)
   */
  @CronFunction({
    id: "typed-cleanup-task",
    name: "Typed Cleanup Task",
    cron: "*/2 * * * *", // Every 2 minutes for testing
    timezone: "UTC",
    retries: 2,
    timeout: 20000,
    priority: 3,
  })
  async handleTypedCleanup() {
    this.logger.log("🧹 Running typed cleanup task with CronFunction decorator");
    
    // Simulate cleanup work
    const cleanupItems = Math.floor(Math.random() * 5) + 1;
    await new Promise((resolve) => setTimeout(resolve, 200));

    this.logger.log(`✅ Typed cleanup completed: ${cleanupItems} items processed`);
    
    return {
      success: true,
      itemsProcessed: cleanupItems,
      timestamp: new Date().toISOString(),
      decoratorType: "CronFunction",
      timezone: "UTC",
    };
  }

  /**
   * Test performance monitoring features
   */
  async testPerformanceMonitoring() {
    this.logger.log("=== Testing Performance Monitoring ===");

    // Get performance statistics
    const stats = getDecoratorPerformanceStats();
    this.logger.log("Performance Stats:", {
      registeredClasses: stats.registeredClasses,
      totalFunctions: stats.totalFunctions,
      cacheHitRate: stats.cacheHitRate.toFixed(2),
      memoryUsage: `${Math.round(stats.memoryUsage / 1024)}KB`,
    });

    return stats;
  }

  /**
   * Test metadata functions
   */
  async testMetadataFunctions() {
    this.logger.log("=== Testing Metadata Functions ===");

    // Test single function lookup
    const singleFunction = findFunctionMetadataById("optimized-user-created");
    this.logger.log("Single function lookup:", {
      found: !!singleFunction,
      functionId: singleFunction?.metadata.config.id,
    });

    // Test bulk function lookup
    const bulkFunctions = bulkFindFunctionMetadata([
      "optimized-user-created",
      "optimized-batch-processor",
      "optimized-cleanup",
      "non-existent-function",
    ]);
    this.logger.log("Bulk function lookup:", {
      foundCount: bulkFunctions.size,
      functionIds: Array.from(bulkFunctions.keys()),
    });

    // Test class metadata
    const classMetadata = getOptimizedInngestFunctionMetadata(this);
    this.logger.log("Class metadata:", {
      functionCount: classMetadata.length,
      functionIds: classMetadata.map((meta) => meta.config.id),
    });

    // Test function existence check
    const functionExists = isOptimizedInngestFunction(
      this,
      "handleOptimizedUserCreated",
    );
    this.logger.log("Function existence check:", { exists: functionExists });

    // Test function config retrieval
    const functionConfig = getOptimizedFunctionConfig(
      this,
      "handleOptimizedUserCreated",
    );
    this.logger.log("Function config:", {
      id: functionConfig?.id,
      retries: functionConfig?.retries,
      timeout: functionConfig?.timeout,
    });

    return {
      singleFunction: !!singleFunction,
      bulkFunctions: bulkFunctions.size,
      classMetadata: classMetadata.length,
      functionExists,
      functionConfig: !!functionConfig,
    };
  }

  /**
   * Test cache management
   */
  async testCacheManagement() {
    this.logger.log("=== Testing Cache Management ===");

    // Get stats before clearing
    const statsBefore = getDecoratorPerformanceStats();
    this.logger.log("Stats before cache clear:", {
      registeredClasses: statsBefore.registeredClasses,
      totalFunctions: statsBefore.totalFunctions,
      memoryUsage: `${Math.round(statsBefore.memoryUsage / 1024)}KB`,
    });

    // Clear caches
    clearOptimizedCaches();
    this.logger.log("Caches cleared successfully");

    // Get stats after clearing
    const statsAfter = getDecoratorPerformanceStats();
    this.logger.log("Stats after cache clear:", {
      registeredClasses: statsAfter.registeredClasses,
      totalFunctions: statsAfter.totalFunctions,
      memoryUsage: `${Math.round(statsAfter.memoryUsage / 1024)}KB`,
    });

    return {
      beforeClear: statsBefore,
      afterClear: statsAfter,
      memoryReduced: statsBefore.memoryUsage - statsAfter.memoryUsage,
    };
  }

  /**
   * Test validation features
   */
  async testValidation() {
    this.logger.log("=== Testing Validation ===");

    try {
      // Test class metadata validation
      validateClassMetadata(this);
      this.logger.log("Class metadata validation: PASSED");
      return { validation: "passed" };
    } catch (error) {
      this.logger.error("Class metadata validation: FAILED", error);
      return { validation: "failed", error: error.message };
    }
  }

  /**
   * Run all performance tests
   */
  async runAllTests() {
    this.logger.log("🚀 Starting OptimizedInngestFunction Feature Tests");

    const results = {
      performance: await this.testPerformanceMonitoring(),
      metadata: await this.testMetadataFunctions(),
      cacheManagement: await this.testCacheManagement(),
      validation: await this.testValidation(),
    };

    this.logger.log("✅ All OptimizedInngestFunction tests completed");
    return results;
  }
}