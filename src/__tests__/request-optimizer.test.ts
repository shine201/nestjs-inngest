import { Test, TestingModule } from "@nestjs/testing";
import { RequestOptimizer } from "../utils/request-optimizer";
import { ConnectionPool } from "../utils/connection-pool";
import { Logger } from "@nestjs/common";

// Mock zlib functions
jest.mock("zlib", () => ({
  gzip: jest.fn(),
  gunzip: jest.fn(),
}));

jest.mock("util", () => ({
  promisify: jest.fn((fn) => fn),
}));

const mockZlib = require("zlib");

describe("RequestOptimizer", () => {
  let requestOptimizer: RequestOptimizer;
  let connectionPool: ConnectionPool;
  let module: TestingModule;

  beforeEach(async () => {
    const mockConnectionPool = {
      executeRequest: jest.fn().mockResolvedValue("mock-response"),
    };

    module = await Test.createTestingModule({
      providers: [
        {
          provide: RequestOptimizer,
          useFactory: (connectionPool: ConnectionPool) =>
            new RequestOptimizer(connectionPool),
          inject: [ConnectionPool],
        },
        {
          provide: ConnectionPool,
          useValue: mockConnectionPool,
        },
      ],
    }).compile();

    requestOptimizer = module.get<RequestOptimizer>(RequestOptimizer);
    connectionPool = module.get<ConnectionPool>(ConnectionPool);

    // Setup zlib mocks
    mockZlib.gzip.mockImplementation(async (data: string) => {
      const compressed = Buffer.from(
        data.slice(0, Math.floor(data.length * 0.7)),
      ); // 30% compression
      return compressed;
    });

    mockZlib.gunzip.mockImplementation(async (data: Buffer) => {
      return Buffer.from(data.toString() + "expanded");
    });
  });

  afterEach(async () => {
    await module.close();
    jest.clearAllMocks();
  });

  describe("initialization", () => {
    it("should be defined", () => {
      expect(requestOptimizer).toBeDefined();
    });

    it("should initialize with default configuration", () => {
      const config = requestOptimizer.getConfig();

      expect(config.enableCompression).toBe(true);
      expect(config.compressionThreshold).toBe(1024);
      expect(config.enableCaching).toBe(true);
      expect(config.cacheTimeout).toBe(300000);
      expect(config.enableRequestBatching).toBe(true);
    });

    it("should initialize with custom configuration", () => {
      const customConfig = {
        enableCompression: false,
        compressionThreshold: 2048,
        responseCacheSize: 500,
      };

      const customOptimizer = new RequestOptimizer(
        connectionPool,
        customConfig,
      );
      const config = customOptimizer.getConfig();

      expect(config.enableCompression).toBe(false);
      expect(config.compressionThreshold).toBe(2048);
      expect(config.responseCacheSize).toBe(500);
    });
  });

  describe("request optimization", () => {
    it("should execute basic optimized request", async () => {
      const mockExecuteRequest = jest
        .spyOn(connectionPool, "executeRequest")
        .mockResolvedValue("test-response");

      const result = await requestOptimizer.optimizeRequest(
        "https://api.test.com",
        { test: "data" },
      );

      expect(result).toBe("test-response");
      expect(mockExecuteRequest).toHaveBeenCalled();
    });

    it("should apply compression for large payloads", async () => {
      const largeData = { data: "x".repeat(2000) }; // Larger than threshold

      const result = await requestOptimizer.optimizeRequest(
        "https://api.test.com",
        largeData,
      );

      expect(mockZlib.gzip).toHaveBeenCalled();
      expect(connectionPool.executeRequest).toHaveBeenCalled();
    });

    it("should skip compression for small payloads", async () => {
      const smallData = { data: "small" }; // Smaller than threshold

      await requestOptimizer.optimizeRequest("https://api.test.com", smallData);

      expect(mockZlib.gzip).not.toHaveBeenCalled();
    });

    it("should skip compression when disabled", async () => {
      const largeData = { data: "x".repeat(2000) };

      await requestOptimizer.optimizeRequest(
        "https://api.test.com",
        largeData,
        { skipCompression: true },
      );

      expect(mockZlib.gzip).not.toHaveBeenCalled();
    });

    it("should handle compression that doesnt provide savings", async () => {
      // Mock compression that doesn't save space
      mockZlib.gzip.mockImplementationOnce(async (data: string) => {
        return Buffer.from(data + "additional_data"); // Larger than original
      });

      const data = { data: "x".repeat(2000) };

      await requestOptimizer.optimizeRequest("https://api.test.com", data);

      // Should not use compression if it doesn't save space
      const callArgs = (connectionPool.executeRequest as jest.Mock).mock
        .calls[0][0];
      const requestData = await callArgs();
      expect(requestData).toBeDefined();
    });
  });

  describe("response caching", () => {
    it("should cache successful responses", async () => {
      const cacheKey = "test-cache-key";
      const mockResponse = "cached-response";

      jest
        .spyOn(connectionPool, "executeRequest")
        .mockResolvedValue(mockResponse);

      // First request should execute and cache
      const result1 = await requestOptimizer.optimizeRequest(
        "https://api.test.com",
        { test: "data" },
        { cacheKey },
      );

      expect(result1).toBe(mockResponse);
      expect(connectionPool.executeRequest).toHaveBeenCalledTimes(1);

      // Second request should return from cache
      const result2 = await requestOptimizer.optimizeRequest(
        "https://api.test.com",
        { test: "data" },
        { cacheKey },
      );

      expect(result2).toBe(mockResponse);
      expect(connectionPool.executeRequest).toHaveBeenCalledTimes(1); // No additional call

      const metrics = requestOptimizer.getMetrics();
      expect(metrics.cacheHits).toBe(1);
      expect(metrics.cacheMisses).toBe(1);
    });

    it("should skip caching when disabled", async () => {
      const cacheKey = "test-cache-key";

      await requestOptimizer.optimizeRequest(
        "https://api.test.com",
        { test: "data" },
        { cacheKey, skipCaching: true },
      );

      await requestOptimizer.optimizeRequest(
        "https://api.test.com",
        { test: "data" },
        { cacheKey, skipCaching: true },
      );

      expect(connectionPool.executeRequest).toHaveBeenCalledTimes(2);
    });

    it("should expire cached responses", async () => {
      const cacheKey = "expiring-key";

      // Set very short cache timeout
      requestOptimizer.updateConfig({ cacheTimeout: 1 });

      await requestOptimizer.optimizeRequest(
        "https://api.test.com",
        { test: "data" },
        { cacheKey },
      );

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      await requestOptimizer.optimizeRequest(
        "https://api.test.com",
        { test: "data" },
        { cacheKey },
      );

      expect(connectionPool.executeRequest).toHaveBeenCalledTimes(2);
    });

    it("should implement LRU eviction", async () => {
      // Set small cache size
      requestOptimizer.updateConfig({ responseCacheSize: 2 });

      // Fill cache beyond capacity
      await requestOptimizer.optimizeRequest("url", {}, { cacheKey: "key1" });
      await requestOptimizer.optimizeRequest("url", {}, { cacheKey: "key2" });
      await requestOptimizer.optimizeRequest("url", {}, { cacheKey: "key3" }); // Should evict key1

      // Access key2 to make it recently used
      await requestOptimizer.optimizeRequest("url", {}, { cacheKey: "key2" });

      const stats = requestOptimizer.getDetailedStats();
      expect(stats.cacheStats.size).toBeLessThanOrEqual(2);
    });
  });

  describe("request batching", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should batch requests with same batch key", async () => {
      const batchKey = "test-batch";

      const promise1 = requestOptimizer.optimizeRequest(
        "https://api.test.com",
        { data: "request1" },
        { batchKey },
      );

      const promise2 = requestOptimizer.optimizeRequest(
        "https://api.test.com",
        { data: "request2" },
        { batchKey },
      );

      // Advance timers to trigger batch execution
      jest.advanceTimersByTime(100);

      await Promise.all([promise1, promise2]);

      const metrics = requestOptimizer.getMetrics();
      expect(metrics.batchedRequests).toBe(2);
      expect(connectionPool.executeRequest).toHaveBeenCalledTimes(1);
    });

    it("should execute batch immediately when max size reached", async () => {
      const batchKey = "full-batch";
      requestOptimizer.updateConfig({ maxBatchSize: 2 });

      const promise1 = requestOptimizer.optimizeRequest(
        "url",
        { data: "1" },
        { batchKey },
      );
      const promise2 = requestOptimizer.optimizeRequest(
        "url",
        { data: "2" },
        { batchKey },
      ); // Should trigger immediate execution

      await Promise.all([promise1, promise2]);

      expect(connectionPool.executeRequest).toHaveBeenCalledTimes(1);
    });

    it("should skip batching when disabled", async () => {
      const batchKey = "no-batch";

      await requestOptimizer.optimizeRequest(
        "url",
        { data: "1" },
        { batchKey, skipBatching: true },
      );

      await requestOptimizer.optimizeRequest(
        "url",
        { data: "2" },
        { batchKey, skipBatching: true },
      );

      expect(connectionPool.executeRequest).toHaveBeenCalledTimes(2);
    });

    it("should handle batch execution errors gracefully", async () => {
      jest
        .spyOn(connectionPool, "executeRequest")
        .mockRejectedValue(new Error("Batch failed"));

      const batchKey = "error-batch";

      const promise1 = requestOptimizer.optimizeRequest(
        "url",
        { data: "1" },
        { batchKey },
      );
      const promise2 = requestOptimizer.optimizeRequest(
        "url",
        { data: "2" },
        { batchKey },
      );

      jest.advanceTimersByTime(100);

      await expect(promise1).rejects.toThrow("Batch failed");
      await expect(promise2).rejects.toThrow("Batch failed");
    });
  });

  describe("performance metrics", () => {
    it("should track request metrics", async () => {
      await requestOptimizer.optimizeRequest("url", { data: "test" });

      const metrics = requestOptimizer.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.averageResponseTime).toBeGreaterThan(0);
    });

    it("should track compression metrics", async () => {
      const largeData = { data: "x".repeat(2000) };

      await requestOptimizer.optimizeRequest("url", largeData);

      const metrics = requestOptimizer.getMetrics();
      expect(metrics.compressionSavings).toBeGreaterThan(0);
      expect(metrics.averageCompressionRatio).toBeGreaterThan(1);
    });

    it("should provide detailed statistics", () => {
      const stats = requestOptimizer.getDetailedStats();

      expect(stats).toHaveProperty("metrics");
      expect(stats).toHaveProperty("cacheStats");
      expect(stats).toHaveProperty("batchingStats");
      expect(stats).toHaveProperty("compressionStats");

      expect(stats.cacheStats).toHaveProperty("size");
      expect(stats.cacheStats).toHaveProperty("hitRate");
      expect(stats.cacheStats).toHaveProperty("memoryUsage");
    });

    it("should reset metrics correctly", () => {
      // Generate some metrics
      (requestOptimizer as any).metrics.totalRequests = 10;
      (requestOptimizer as any).metrics.cacheHits = 5;

      requestOptimizer.resetMetrics();

      const metrics = requestOptimizer.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.averageResponseTime).toBe(0);
    });
  });

  describe("auto-optimization", () => {
    it("should increase cache size for high hit rate", () => {
      // Mock high cache hit rate
      (requestOptimizer as any).metrics.cacheHits = 80;
      (requestOptimizer as any).metrics.cacheMisses = 20;
      (requestOptimizer as any).metrics.totalRequests = 100;

      const originalCacheSize = requestOptimizer.getConfig().responseCacheSize;

      requestOptimizer.autoOptimizeConfig();

      const newCacheSize = requestOptimizer.getConfig().responseCacheSize;
      expect(newCacheSize).toBeGreaterThan(originalCacheSize);
    });

    it("should decrease cache size for low hit rate", () => {
      // Mock low cache hit rate
      (requestOptimizer as any).metrics.cacheHits = 10;
      (requestOptimizer as any).metrics.cacheMisses = 90;
      (requestOptimizer as any).metrics.totalRequests = 100;

      // Set smaller initial cache size that can be increased
      requestOptimizer.updateConfig({ responseCacheSize: 500 });

      const originalCacheSize = requestOptimizer.getConfig().responseCacheSize;

      requestOptimizer.autoOptimizeConfig();

      const newCacheSize = requestOptimizer.getConfig().responseCacheSize;
      expect(newCacheSize).toBeLessThan(originalCacheSize);
    });

    it("should adjust compression threshold based on compression ratio", () => {
      // Mock high compression ratio
      (requestOptimizer as any).metrics.averageCompressionRatio = 4;

      const originalThreshold =
        requestOptimizer.getConfig().compressionThreshold;

      requestOptimizer.autoOptimizeConfig();

      const newThreshold = requestOptimizer.getConfig().compressionThreshold;
      expect(newThreshold).toBeLessThanOrEqual(originalThreshold);
    });

    it("should adjust batch timeout based on usage", () => {
      // Mock low average batch size
      (requestOptimizer as any).metrics.batchedRequests = 10;
      // Add entries to simulate low average batch size
      for (let i = 0; i < 10; i++) {
        (requestOptimizer as any).pendingBatches.set(`batch-${i}`, []);
      }

      const originalTimeout = requestOptimizer.getConfig().batchTimeout;

      requestOptimizer.autoOptimizeConfig();

      const newTimeout = requestOptimizer.getConfig().batchTimeout;
      expect(newTimeout).toBeGreaterThanOrEqual(originalTimeout);
    });
  });

  describe("cache management", () => {
    it("should clear all caches", () => {
      // Add some cached data
      (requestOptimizer as any).responseCache.set("key1", {
        data: "value1",
        timestamp: Date.now(),
        headers: {},
      });
      (requestOptimizer as any).cacheAccessTimes.set("key1", Date.now());

      requestOptimizer.clearCaches();

      const stats = requestOptimizer.getDetailedStats();
      expect(stats.cacheStats.size).toBe(0);
    });

    it("should cleanup expired cache entries", async () => {
      // Set very short cache timeout
      requestOptimizer.updateConfig({ cacheTimeout: 1 });

      // Add expired cache entry
      (requestOptimizer as any).responseCache.set("expired-key", {
        data: "expired-data",
        timestamp: Date.now() - 1000, // 1 second ago
        headers: {},
      });

      // Trigger cleanup
      (requestOptimizer as any).cleanupExpiredCache();

      const stats = requestOptimizer.getDetailedStats();
      expect(stats.cacheStats.size).toBe(0);
    });
  });

  describe("configuration management", () => {
    it("should update configuration", () => {
      const newConfig = {
        enableCompression: false,
        compressionThreshold: 5000,
        maxBatchSize: 20,
      };

      requestOptimizer.updateConfig(newConfig);

      const config = requestOptimizer.getConfig();
      expect(config.enableCompression).toBe(false);
      expect(config.compressionThreshold).toBe(5000);
      expect(config.maxBatchSize).toBe(20);
    });

    it("should return current configuration without mutation", () => {
      const config1 = requestOptimizer.getConfig();
      const config2 = requestOptimizer.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });
  });

  describe("error handling", () => {
    it("should handle request execution errors", async () => {
      jest
        .spyOn(connectionPool, "executeRequest")
        .mockRejectedValue(new Error("Network error"));

      await expect(
        requestOptimizer.optimizeRequest("url", { data: "test" }),
      ).rejects.toThrow("Network error");

      const metrics = requestOptimizer.getMetrics();
      expect(metrics.totalRequests).toBe(1);
    });

    it("should handle compression errors gracefully", async () => {
      mockZlib.gzip.mockRejectedValue(new Error("Compression failed"));

      const largeData = { data: "x".repeat(2000) };

      // Should fall back to uncompressed request
      await expect(
        requestOptimizer.optimizeRequest("url", largeData),
      ).rejects.toThrow(); // The error should propagate from connection pool
    });
  });

  describe("request ID generation", () => {
    it("should generate unique request IDs", () => {
      const generateRequestId = (
        requestOptimizer as any
      ).generateRequestId.bind(requestOptimizer);

      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^req-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^req-\d+-[a-z0-9]+$/);
    });
  });
});
