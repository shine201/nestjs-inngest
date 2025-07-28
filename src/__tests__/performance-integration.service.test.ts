import { Test, TestingModule } from "@nestjs/testing";
import { PerformanceIntegrationService } from "../services/performance-integration.service";
import { OptimizedFunctionRegistry } from "../services/optimized-function-registry.service";
import { MemoryOptimizer } from "../utils/memory-optimizer";
import { RequestOptimizer } from "../utils/request-optimizer";
import { ConnectionPool } from "../utils/connection-pool";
import { Logger } from "@nestjs/common";

describe("PerformanceIntegrationService", () => {
  let service: PerformanceIntegrationService;
  let functionRegistry: OptimizedFunctionRegistry;
  let memoryOptimizer: MemoryOptimizer;
  let requestOptimizer: RequestOptimizer;
  let connectionPool: ConnectionPool;
  let module: TestingModule;

  beforeEach(async () => {
    const mockFunctionRegistry = {
      getStats: jest.fn().mockReturnValue({
        functionCount: 10,
        registrationTimes: new Map([["test", 100]]),
        cacheHitRate: 0.8,
        totalMemoryUsage: 1000000,
      }),
      getPerformanceMetrics: jest.fn().mockReturnValue({
        functionCount: 10,
        registrationTimes: new Map([["test", 100]]),
        cacheHitRate: 0.8,
        totalMemoryUsage: 1000000,
      }),
      getFunctionCount: jest.fn().mockReturnValue(10),
      optimizePerformance: jest.fn(),
      validateFunctions: jest.fn(),
      clearCache: jest.fn(),
    };

    const mockMemoryOptimizer = {
      getDetailedMemoryInfo: jest.fn().mockReturnValue({
        current: {
          heapUsed: 100 * 1024 * 1024,
          heapTotal: 200 * 1024 * 1024,
          external: 0,
          rss: 200 * 1024 * 1024,
          arrayBuffers: 0,
        },
        poolStats: {
          eventObjects: { available: 10, inUse: 5 },
          metadataObjects: { available: 8, inUse: 2 },
        },
        cacheStats: {
          functionMetadata: 100,
          configValidation: 50,
          internedStrings: 200,
        },
        memoryTrend: {
          samples: 10,
          averageUsage: 90 * 1024 * 1024,
          peakUsage: 120 * 1024 * 1024,
          trend: "stable" as const,
        },
      }),
      analyzeMemoryUsage: jest.fn().mockReturnValue({
        recommendations: [],
        severity: "medium" as const,
        optimizationOpportunities: ["Test optimization"],
      }),
      optimize: jest.fn(),
      forceGarbageCollection: jest.fn(),
      setMemoryThresholds: jest.fn(),
      clearAllCaches: jest.fn(),
    };

    const mockRequestOptimizer = {
      getDetailedStats: jest.fn().mockReturnValue({
        metrics: {
          totalRequests: 1000,
          totalErrors: 10,
          averageResponseTime: 200,
          errorRate: 0.01,
          compressionSavings: 50000,
          cacheHits: 800,
          cacheMisses: 200,
        },
        cacheStats: {
          size: 100,
          hitRate: 0.8,
          memoryUsage: 10000,
        },
        batchingStats: {
          activeBatches: 2,
          averageBatchSize: 5,
        },
        compressionStats: {
          compressionEnabled: true,
          averageSavings: 500,
        },
      }),
      autoOptimizeConfig: jest.fn(),
      resetMetrics: jest.fn(),
      clearCaches: jest.fn(),
    };

    const mockConnectionPool = {
      getPerformanceMetrics: jest.fn().mockReturnValue({
        totalRequests: 1000,
        totalErrors: 5,
        averageResponseTime: 150,
        errorRate: 0.005,
        circuitBreakerOpen: false,
        consecutiveFailures: 0,
        activeRequestMetrics: [],
      }),
      getStats: jest.fn().mockReturnValue({
        totalConnections: 100,
        activeConnections: 5,
        idleConnections: 10,
        queuedRequests: 0,
        totalRequests: 1000,
        averageResponseTime: 150,
        errorRate: 0.005,
      }),
      optimizeAgents: jest.fn(),
      warmupPool: jest.fn(),
      forceCircuitBreakerClose: jest.fn(),
      resetStats: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        PerformanceIntegrationService,
        {
          provide: OptimizedFunctionRegistry,
          useValue: mockFunctionRegistry,
        },
        {
          provide: MemoryOptimizer,
          useValue: mockMemoryOptimizer,
        },
        {
          provide: RequestOptimizer,
          useValue: mockRequestOptimizer,
        },
        {
          provide: ConnectionPool,
          useValue: mockConnectionPool,
        },
      ],
    }).compile();

    service = module.get<PerformanceIntegrationService>(
      PerformanceIntegrationService,
    );
    functionRegistry = module.get<OptimizedFunctionRegistry>(
      OptimizedFunctionRegistry,
    );
    memoryOptimizer = module.get<MemoryOptimizer>(MemoryOptimizer);
    requestOptimizer = module.get<RequestOptimizer>(RequestOptimizer);
    connectionPool = module.get<ConnectionPool>(ConnectionPool);
  });

  afterEach(async () => {
    await module.close();
  });

  describe("initialization", () => {
    it("should be defined", () => {
      expect(service).toBeDefined();
    });

    it("should initialize health monitoring", async () => {
      const spy = jest.spyOn(service as any, "startHealthMonitoring");

      await service.onModuleInit();

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("should perform initial optimization", async () => {
      const spy = jest.spyOn(service as any, "performFullOptimization");

      await service.onModuleInit();

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe("performance monitoring", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should collect comprehensive performance statistics", () => {
      const stats = service.getComprehensiveStats();

      expect(stats).toHaveProperty("memory");
      expect(stats).toHaveProperty("network");
      expect(stats).toHaveProperty("registry");
      expect(stats).toHaveProperty("system");

      expect(stats.memory).toHaveProperty("current");
      expect(stats.memory).toHaveProperty("poolStats");
      expect(stats.memory).toHaveProperty("cacheStats");
      expect(stats.memory).toHaveProperty("memoryTrend");

      expect(stats.network).toHaveProperty("connectionPool");
      expect(stats.network).toHaveProperty("requestOptimizer");

      expect(stats.registry).toHaveProperty("functionCount");
      expect(stats.registry).toHaveProperty("cacheHitRate");
      expect(stats.registry).toHaveProperty("totalMemoryUsage");

      expect(stats.system).toHaveProperty("uptime");
      expect(stats.system).toHaveProperty("overallHealth");
      expect(["excellent", "good", "warning", "critical"]).toContain(
        stats.system.overallHealth,
      );
    });

    it("should perform health checks at regular intervals", () => {
      const performHealthCheckSpy = jest.spyOn(
        service as any,
        "performHealthCheck",
      );

      service.onModuleInit();

      // Advance timer by 1 minute
      jest.advanceTimersByTime(60000);

      expect(performHealthCheckSpy).toHaveBeenCalled();

      performHealthCheckSpy.mockRestore();
    });

    it("should track performance history", () => {
      // Simulate multiple health checks
      for (let i = 0; i < 5; i++) {
        (service as any).performHealthCheck();
      }

      const history = (service as any).performanceHistory;
      expect(history.length).toBe(5);

      // Each entry should have all required properties
      history.forEach((entry: any) => {
        expect(entry).toHaveProperty("memory");
        expect(entry).toHaveProperty("network");
        expect(entry).toHaveProperty("registry");
        expect(entry).toHaveProperty("system");
      });
    });

    it("should limit performance history size", () => {
      const maxHistorySize = (service as any).maxHistorySize;

      // Generate more entries than the limit
      for (let i = 0; i < maxHistorySize + 10; i++) {
        (service as any).performHealthCheck();
      }

      const history = (service as any).performanceHistory;
      expect(history.length).toBe(maxHistorySize);
    });
  });

  describe("health assessment", () => {
    it("should determine excellent health for optimal metrics", () => {
      // Mock optimal conditions
      jest.spyOn(memoryOptimizer, "getDetailedMemoryInfo").mockReturnValue({
        current: {
          heapUsed: 50 * 1024 * 1024,
          heapTotal: 200 * 1024 * 1024,
          external: 0,
          rss: 200 * 1024 * 1024,
          arrayBuffers: 0,
        },
        poolStats: {
          eventObjects: { available: 10, inUse: 2 },
          metadataObjects: { available: 8, inUse: 1 },
        },
        cacheStats: {
          functionMetadata: 10,
          configValidation: 5,
          internedStrings: 20,
        },
        memoryTrend: {
          samples: 10,
          averageUsage: 40 * 1024 * 1024,
          peakUsage: 60 * 1024 * 1024,
          trend: "stable" as const,
        },
        thresholds: {
          warning: 500 * 1024 * 1024,
          critical: 1024 * 1024 * 1024,
          gcTrigger: 750 * 1024 * 1024,
        },
      });

      jest.spyOn(requestOptimizer, "getDetailedStats").mockReturnValue({
        metrics: {
          compressionSavings: 1000,
          cacheHits: 100,
          cacheMisses: 5,
          batchedRequests: 50,
          totalRequests: 105,
          averageCompressionRatio: 1.5,
          averageResponseTime: 50,
        },
        cacheStats: {
          size: 100,
          hitRate: 0.95,
          memoryUsage: 1000,
        },
        batchingStats: { activeBatches: 1, averageBatchSize: 8 },
        compressionStats: { compressionEnabled: true, averageSavings: 1000 },
      });

      const stats = service.getComprehensiveStats();
      expect(stats.system.overallHealth).toBe("excellent");
    });

    it("should determine critical health for poor metrics", () => {
      // Mock critical conditions
      jest.spyOn(memoryOptimizer, "getDetailedMemoryInfo").mockReturnValue({
        current: {
          heapUsed: 800 * 1024 * 1024,
          heapTotal: 1000 * 1024 * 1024,
          external: 0,
          rss: 1000 * 1024 * 1024,
          arrayBuffers: 0,
        },
        poolStats: {
          eventObjects: { available: 1, inUse: 50 },
          metadataObjects: { available: 0, inUse: 20 },
        },
        cacheStats: {
          functionMetadata: 1000,
          configValidation: 500,
          internedStrings: 2000,
        },
        memoryTrend: {
          samples: 10,
          averageUsage: 700 * 1024 * 1024,
          peakUsage: 900 * 1024 * 1024,
          trend: "increasing" as const,
        },
        thresholds: {
          warning: 500 * 1024 * 1024,
          critical: 1024 * 1024 * 1024,
          gcTrigger: 750 * 1024 * 1024,
        },
      });

      jest.spyOn(requestOptimizer, "getDetailedStats").mockReturnValue({
        metrics: {
          compressionSavings: 0,
          cacheHits: 10,
          cacheMisses: 90,
          batchedRequests: 5,
          totalRequests: 100,
          averageCompressionRatio: 1,
          averageResponseTime: 2000,
        },
        cacheStats: {
          size: 10,
          hitRate: 0.1,
          memoryUsage: 100,
        },
        batchingStats: { activeBatches: 20, averageBatchSize: 1 },
        compressionStats: { compressionEnabled: false, averageSavings: 0 },
      });

      jest.spyOn(connectionPool, "getPerformanceMetrics").mockReturnValue({
        totalRequests: 1000,
        totalErrors: 100,
        averageResponseTime: 2500,
        errorRate: 0.1,
        circuitBreakerOpen: true,
        consecutiveFailures: 10,
        activeRequestMetrics: [],
      });

      const stats = service.getComprehensiveStats();
      expect(stats.system.overallHealth).toBe("critical");
    });

    it("should provide performance recommendations", () => {
      // Mock conditions that need recommendations
      jest.spyOn(memoryOptimizer, "analyzeMemoryUsage").mockReturnValue({
        recommendations: ["Reduce cache sizes", "Check for memory leaks"],
        severity: "medium" as const,
        optimizationOpportunities: ["Implement object pooling"],
      });

      const stats = service.getComprehensiveStats();
      expect(stats.system.performanceRecommendations.length).toBeGreaterThan(0);
    });
  });

  describe("automatic optimization", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should trigger optimization when thresholds are exceeded", () => {
      const performOptimizationSpy = jest.spyOn(
        service as any,
        "performAutomaticOptimization",
      );

      // Mock high memory usage
      jest.spyOn(memoryOptimizer, "getDetailedMemoryInfo").mockReturnValue({
        current: {
          heapUsed: 600 * 1024 * 1024,
          heapTotal: 800 * 1024 * 1024,
          external: 0,
          rss: 800 * 1024 * 1024,
          arrayBuffers: 0,
        },
        poolStats: {
          eventObjects: { available: 10, inUse: 5 },
          metadataObjects: { available: 8, inUse: 2 },
        },
        cacheStats: {
          functionMetadata: 100,
          configValidation: 50,
          internedStrings: 200,
        },
        memoryTrend: {
          samples: 10,
          averageUsage: 500 * 1024 * 1024,
          peakUsage: 700 * 1024 * 1024,
          trend: "increasing" as const,
        },
        thresholds: {
          warning: 500 * 1024 * 1024,
          critical: 1024 * 1024 * 1024,
          gcTrigger: 750 * 1024 * 1024,
        },
      });

      service.onModuleInit();

      // Advance timer for periodic optimization
      jest.advanceTimersByTime(300000); // 5 minutes

      expect(performOptimizationSpy).toHaveBeenCalled();

      performOptimizationSpy.mockRestore();
    });

    it("should perform full optimization", async () => {
      await service.performFullOptimization();

      expect(memoryOptimizer.optimize).toHaveBeenCalled();
      expect(requestOptimizer.autoOptimizeConfig).toHaveBeenCalled();
      expect(connectionPool.optimizeAgents).toHaveBeenCalled();
      expect(functionRegistry.validateFunctions).toHaveBeenCalled();
    });

    it("should perform automatic optimization based on conditions", async () => {
      // Mock conditions requiring different optimizations
      jest.spyOn(memoryOptimizer, "getDetailedMemoryInfo").mockReturnValue({
        current: {
          heapUsed: 600 * 1024 * 1024,
          heapTotal: 800 * 1024 * 1024,
          external: 0,
          rss: 800 * 1024 * 1024,
          arrayBuffers: 0,
        },
        poolStats: {
          eventObjects: { available: 10, inUse: 5 },
          metadataObjects: { available: 8, inUse: 2 },
        },
        cacheStats: {
          functionMetadata: 100,
          configValidation: 50,
          internedStrings: 200,
        },
        memoryTrend: {
          samples: 10,
          averageUsage: 500 * 1024 * 1024,
          peakUsage: 700 * 1024 * 1024,
          trend: "increasing" as const,
        },
        thresholds: {
          warning: 500 * 1024 * 1024,
          critical: 1024 * 1024 * 1024,
          gcTrigger: 750 * 1024 * 1024,
        },
      });

      jest.spyOn(requestOptimizer, "getDetailedStats").mockReturnValue({
        metrics: {
          totalRequests: 1000,
          averageResponseTime: 1200,
          compressionSavings: 500,
          cacheHits: 60,
          cacheMisses: 40,
          batchedRequests: 100,
          averageCompressionRatio: 1.5,
        },
        cacheStats: {
          size: 100,
          hitRate: 0.6,
          memoryUsage: 10000,
        },
        batchingStats: { activeBatches: 2, averageBatchSize: 5 },
        compressionStats: { compressionEnabled: true, averageSavings: 500 },
      });

      await (service as any).performAutomaticOptimization();

      expect(memoryOptimizer.optimize).toHaveBeenCalled();
      expect(requestOptimizer.autoOptimizeConfig).toHaveBeenCalled();
      expect(connectionPool.optimizeAgents).toHaveBeenCalled();
    });
  });

  describe("performance analytics", () => {
    it("should calculate performance trends", () => {
      // Add some performance history
      const mockHistory = [
        {
          memory: { current: { heapUsed: 100 * 1024 * 1024 } },
          network: {},
          registry: {},
          system: {},
        },
        {
          memory: { current: { heapUsed: 110 * 1024 * 1024 } },
          network: {},
          registry: {},
          system: {},
        },
        {
          memory: { current: { heapUsed: 120 * 1024 * 1024 } },
          network: {},
          registry: {},
          system: {},
        },
      ];

      (service as any).performanceHistory = mockHistory;

      const trends = service.getPerformanceTrends();

      expect(trends).toHaveProperty("memoryTrend");
      expect(trends).toHaveProperty("performanceTrend");
      expect(trends).toHaveProperty("recommendations");
    });

    it("should detect performance degradation", () => {
      // Mock degrading performance with sufficient data points
      const mockHistory = [];
      for (let i = 0; i < 10; i++) {
        mockHistory.push({
          memory: { current: { heapUsed: (100 + i * 50) * 1024 * 1024 } },
          network: {
            requestOptimizer: {
              metrics: { averageResponseTime: 100 + i * 50 },
            },
          },
          registry: {},
          system: { overallHealth: i < 5 ? "excellent" : "warning" },
        });
      }

      (service as any).performanceHistory = mockHistory;

      const trends = service.getPerformanceTrends();

      expect(trends.memoryTrend).toBe("increasing");
      expect(trends.recommendations.length).toBeGreaterThan(0);
    });

    it("should provide optimization suggestions", () => {
      const suggestions = service.getOptimizationSuggestions();

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);

      // Should include suggestions based on current metrics
      suggestions.forEach((suggestion: any) => {
        expect(suggestion).toHaveProperty("category");
        expect(suggestion).toHaveProperty("suggestion");
        expect(suggestion).toHaveProperty("impact");
        expect(suggestion).toHaveProperty("priority");
      });
    });
  });

  describe("memory leak detection", () => {
    it("should detect potential memory leaks", () => {
      // Mock increasing memory trend
      jest.spyOn(memoryOptimizer, "getDetailedMemoryInfo").mockReturnValue({
        current: {
          heapUsed: 500 * 1024 * 1024,
          heapTotal: 800 * 1024 * 1024,
          external: 0,
          rss: 800 * 1024 * 1024,
          arrayBuffers: 0,
        },
        poolStats: {
          eventObjects: { available: 10, inUse: 5 },
          metadataObjects: { available: 8, inUse: 2 },
        },
        cacheStats: {
          functionMetadata: 100,
          configValidation: 50,
          internedStrings: 200,
        },
        memoryTrend: {
          samples: 10,
          averageUsage: 400 * 1024 * 1024,
          peakUsage: 600 * 1024 * 1024,
          trend: "increasing" as const,
        },
        thresholds: {
          warning: 500 * 1024 * 1024,
          critical: 1024 * 1024 * 1024,
          gcTrigger: 750 * 1024 * 1024,
        },
      });

      const leakDetection = service.detectMemoryLeaks();

      expect(leakDetection).toHaveProperty("potentialLeaks");
      expect(leakDetection).toHaveProperty("severity");
      expect(leakDetection).toHaveProperty("recommendations");

      if (leakDetection.potentialLeaks) {
        expect(leakDetection.severity).not.toBe("none");
      }
    });

    it("should not detect leaks with stable memory", () => {
      // Mock stable memory trend
      jest.spyOn(memoryOptimizer, "getDetailedMemoryInfo").mockReturnValue({
        current: {
          heapUsed: 100 * 1024 * 1024,
          heapTotal: 200 * 1024 * 1024,
          external: 0,
          rss: 200 * 1024 * 1024,
          arrayBuffers: 0,
        },
        poolStats: {
          eventObjects: { available: 10, inUse: 5 },
          metadataObjects: { available: 8, inUse: 2 },
        },
        cacheStats: {
          functionMetadata: 50,
          configValidation: 25,
          internedStrings: 100,
        },
        memoryTrend: {
          samples: 10,
          averageUsage: 95 * 1024 * 1024,
          peakUsage: 110 * 1024 * 1024,
          trend: "stable" as const,
        },
        thresholds: {
          warning: 500 * 1024 * 1024,
          critical: 1024 * 1024 * 1024,
          gcTrigger: 750 * 1024 * 1024,
        },
      });

      const leakDetection = service.detectMemoryLeaks();

      expect(leakDetection.potentialLeaks).toBe(false);
      expect(leakDetection.severity).toBe("none");
    });
  });

  describe("module lifecycle", () => {
    it("should clean up intervals on module destroy", async () => {
      const clearIntervalSpy = jest.spyOn(global, "clearInterval");

      // Initialize the service to create intervals
      await service.onModuleInit();

      // Destroy the module
      await service.onModuleDestroy();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });

    it("should log shutdown process", async () => {
      const logSpy = jest.spyOn(service["logger"], "log");

      await service.onModuleDestroy();

      expect(logSpy).toHaveBeenCalledWith(
        "Performance integration service shutting down...",
      );
      expect(logSpy).toHaveBeenCalledWith(
        "Performance integration service shutdown completed",
      );
    });
  });

  describe("configuration and tuning", () => {
    it("should allow threshold configuration", () => {
      const customThresholds = {
        memoryUsage: 1000 * 1024 * 1024, // 1GB
        cacheHitRateThreshold: 0.8,
        errorRateThreshold: 0.02,
        responseTimeThreshold: 2000,
      };

      service.updateOptimizationThresholds(customThresholds);

      const thresholds = (service as any).optimizationThresholds;
      expect(thresholds.memoryUsage).toBe(customThresholds.memoryUsage);
      expect(thresholds.cacheHitRateThreshold).toBe(
        customThresholds.cacheHitRateThreshold,
      );
    });

    it("should provide current configuration", () => {
      const config = service.getConfiguration();

      expect(config).toHaveProperty("optimizationThresholds");
      expect(config).toHaveProperty("monitoringIntervals");
      expect(config).toHaveProperty("historySize");
    });
  });

  describe("error handling", () => {
    it("should handle optimization errors gracefully", async () => {
      jest.spyOn(memoryOptimizer, "optimize").mockImplementation(() => {
        throw new Error("Optimization failed");
      });

      await expect(service.performFullOptimization()).resolves.not.toThrow();
    });

    it("should handle missing dependencies gracefully", () => {
      // Test with null dependencies (should not happen in real usage)
      const stats = service.getPerformanceStats();
      expect(stats).toBeDefined();
    });
  });
});
