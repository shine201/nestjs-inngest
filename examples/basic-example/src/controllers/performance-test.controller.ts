import { Controller, Post, Get, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { PerformanceTestService } from "../services/performance-test.service";
import { InngestService } from "nestjs-inngest";

/**
 * Controller for testing OptimizedInngestFunction features
 */
@Controller("performance-test")
export class PerformanceTestController {
  constructor(
    private readonly performanceTestService: PerformanceTestService,
    private readonly inngestService: InngestService,
  ) {}

  /**
   * Trigger optimized user created function
   */
  @Post("user-created")
  @HttpCode(HttpStatus.OK)
  async triggerOptimizedUserCreated(@Body() userData: { userId: string; email: string; name: string }) {
    await this.inngestService.send({
      name: "test.user.created",
      data: userData,
    });

    return {
      success: true,
      message: "Optimized user created event sent",
      eventData: userData,
    };
  }

  /**
   * Trigger optimized batch processing function
   */
  @Post("batch-process")
  @HttpCode(HttpStatus.OK)
  async triggerOptimizedBatch(@Body() batchData: { batchId: string; items: any[] }) {
    await this.inngestService.send({
      name: "test.batch.process",
      data: batchData,
    });

    return {
      success: true,
      message: "Optimized batch processing event sent",
      eventData: batchData,
    };
  }

  /**
   * Test performance monitoring features
   */
  @Get("performance-stats")
  async getPerformanceStats() {
    const stats = await this.performanceTestService.testPerformanceMonitoring();
    return {
      success: true,
      stats,
    };
  }

  /**
   * Test metadata functions
   */
  @Get("metadata")
  async testMetadata() {
    const results = await this.performanceTestService.testMetadataFunctions();
    return {
      success: true,
      metadata: results,
    };
  }

  /**
   * Test cache management
   */
  @Post("cache-management")
  @HttpCode(HttpStatus.OK)
  async testCacheManagement() {
    const results = await this.performanceTestService.testCacheManagement();
    return {
      success: true,
      cache: results,
    };
  }

  /**
   * Test validation features
   */
  @Get("validation")
  async testValidation() {
    const results = await this.performanceTestService.testValidation();
    return {
      success: true,
      validation: results,
    };
  }

  /**
   * Run all OptimizedInngestFunction tests
   */
  @Get("run-all")
  async runAllTests() {
    const results = await this.performanceTestService.runAllTests();
    return {
      success: true,
      allTestResults: results,
    };
  }

  /**
   * Trigger event-based cleanup function (for 10s testing)
   */
  @Post("trigger-cleanup")
  @HttpCode(HttpStatus.OK)
  async triggerEventCleanup(@Body() cleanupData?: { reason?: string; priority?: number }) {
    await this.inngestService.send({
      name: "test.cleanup.trigger",
      data: {
        reason: cleanupData?.reason || "manual-test",
        priority: cleanupData?.priority || 1,
        triggeredAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      message: "Event-based cleanup function triggered",
      note: "Use this endpoint every 10 seconds to test frequent execution",
    };
  }

  /**
   * Generate test batch data for testing
   */
  @Get("generate-test-data")
  generateTestData() {
    const testItems = Array.from({ length: 20 }, (_, index) => ({
      id: `item-${index + 1}`,
      name: `Test Item ${index + 1}`,
      value: Math.floor(Math.random() * 1000),
      category: ["electronics", "books", "clothing", "food"][index % 4],
    }));

    return {
      success: true,
      testData: {
        userData: {
          userId: `user-${Date.now()}`,
          email: "test@example.com",
          name: "Test User",
        },
        batchData: {
          batchId: `batch-${Date.now()}`,
          items: testItems,
        },
      },
    };
  }

  /**
   * Trigger multiple events for load testing
   */
  @Post("load-test")
  @HttpCode(HttpStatus.OK)
  async triggerLoadTest(@Body() config: { userCount: number; batchCount: number }) {
    const { userCount = 5, batchCount = 3 } = config;
    const results = [];

    // Generate user events
    for (let i = 0; i < userCount; i++) {
      const userData = {
        userId: `load-test-user-${i + 1}`,
        email: `user${i + 1}@loadtest.com`,
        name: `Load Test User ${i + 1}`,
      };

      await this.inngestService.send({
        name: "test.user.created",
        data: userData,
      });

      results.push({ type: "user", data: userData });
    }

    // Generate batch events
    for (let i = 0; i < batchCount; i++) {
      const batchData = {
        batchId: `load-test-batch-${i + 1}`,
        items: Array.from({ length: 10 }, (_, index) => ({
          id: `batch-${i + 1}-item-${index + 1}`,
          value: Math.random() * 100,
        })),
      };

      await this.inngestService.send({
        name: "test.batch.process",
        data: batchData,
      });

      results.push({ type: "batch", data: batchData });
    }

    return {
      success: true,
      message: `Load test triggered: ${userCount} user events, ${batchCount} batch events`,
      events: results,
    };
  }
}