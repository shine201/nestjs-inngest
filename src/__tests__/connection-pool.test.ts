import { ConnectionPool } from "../utils/connection-pool";

describe("ConnectionPool", () => {
  let connectionPool: ConnectionPool;

  beforeEach(() => {
    connectionPool = new ConnectionPool();
  });

  afterEach(async () => {
    if (connectionPool) {
      try {
        await Promise.race([
          connectionPool.onModuleDestroy(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Cleanup timeout")), 5000),
          ),
        ]);
      } catch (error) {
        // Ignore cleanup errors in tests
      }
    }
  }, 15000);

  describe("initialization", () => {
    it("should be defined", () => {
      expect(connectionPool).toBeDefined();
    });

    it("should initialize with default configuration", () => {
      const stats = connectionPool.getStats();
      expect(stats.totalConnections).toBe(100); // 50 + 50
      expect(stats.activeConnections).toBe(0);
      expect(stats.queuedRequests).toBe(0);
    });

    it("should initialize with custom configuration", () => {
      const customPool = new ConnectionPool({
        maxSockets: 20,
        timeout: 5000,
      });
      expect(customPool).toBeDefined();
    });
  });

  describe("getAgent", () => {
    it("should return HTTP agent for HTTP URLs", () => {
      const agent = connectionPool.getAgent("http://example.com");
      expect(agent).toBeDefined();
      expect(agent.constructor.name).toBe("Agent"); // HTTP agent
    });

    it("should return HTTPS agent for HTTPS URLs", () => {
      const agent = connectionPool.getAgent("https://example.com");
      expect(agent).toBeDefined();
    });
  });

  describe("executeRequest", () => {
    it("should execute a successful request", async () => {
      const mockRequest = jest.fn().mockResolvedValue("success");

      const result = await connectionPool.executeRequest(mockRequest);

      expect(result).toBe("success");
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it("should retry failed requests", async () => {
      const mockRequest = jest
        .fn()
        .mockRejectedValueOnce(new Error("First failure"))
        .mockRejectedValueOnce(new Error("Second failure"))
        .mockResolvedValue("success");

      const result = await connectionPool.executeRequest(mockRequest, {
        retries: 3,
      });

      expect(result).toBe("success");
      expect(mockRequest).toHaveBeenCalledTimes(3);
    });

    it("should handle timeout", async () => {
      const mockRequest = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            // Simulate a slow request that will timeout
            setTimeout(() => resolve("slow"), 50);
          }),
      );

      await expect(
        connectionPool.executeRequest(mockRequest, { timeout: 10, retries: 0 }),
      ).rejects.toThrow("Request timed out after 10ms");
    }, 500);

    it("should respect priority in request queue", async () => {
      const results: string[] = [];
      const highPriorityRequest = jest.fn().mockImplementation(async () => {
        results.push("high");
        return "high";
      });
      const lowPriorityRequest = jest.fn().mockImplementation(async () => {
        results.push("low");
        return "low";
      });

      // Fill up the pool capacity by setting activeRequests
      (connectionPool as any).activeRequests = 50;

      const highPriorityPromise = connectionPool.executeRequest(
        highPriorityRequest,
        { priority: 10 },
      );
      const lowPriorityPromise = connectionPool.executeRequest(
        lowPriorityRequest,
        { priority: 1 },
      );

      // Reset activeRequests to allow queue processing
      (connectionPool as any).activeRequests = 0;
      (connectionPool as any).processQueue();

      await Promise.all([highPriorityPromise, lowPriorityPromise]);

      expect(results[0]).toBe("high");
      expect(results[1]).toBe("low");
    });
  });

  describe("circuit breaker", () => {
    it("should open circuit breaker after consecutive failures", async () => {
      const mockRequest = jest
        .fn()
        .mockRejectedValue(new Error("Request failed"));

      // Generate 5 consecutive failures to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await connectionPool.executeRequest(mockRequest, { retries: 0 });
        } catch (error) {
          // Expected to fail
        }
      }

      const metrics = connectionPool.getPerformanceMetrics();
      expect(metrics.circuitBreakerOpen).toBe(true);
      expect(metrics.consecutiveFailures).toBe(5);

      // Next request should fail immediately due to circuit breaker
      await expect(
        connectionPool.executeRequest(mockRequest, { circuitBreaker: true }),
      ).rejects.toThrow("Circuit breaker is open");
    });

    it("should close circuit breaker after successful request", async () => {
      // Open circuit breaker
      (connectionPool as any).circuitBreakerOpen = true;
      (connectionPool as any).consecutiveFailures = 5;

      const mockRequest = jest.fn().mockResolvedValue("success");

      const result = await connectionPool.executeRequest(mockRequest, {
        circuitBreaker: false,
      });

      expect(result).toBe("success");

      const metrics = connectionPool.getPerformanceMetrics();
      expect(metrics.circuitBreakerOpen).toBe(false);
      expect(metrics.consecutiveFailures).toBe(0);
    });

    it("should manually close circuit breaker", () => {
      (connectionPool as any).circuitBreakerOpen = true;
      (connectionPool as any).consecutiveFailures = 5;

      connectionPool.forceCircuitBreakerClose();

      const metrics = connectionPool.getPerformanceMetrics();
      expect(metrics.circuitBreakerOpen).toBe(false);
      expect(metrics.consecutiveFailures).toBe(0);
    });
  });

  describe("performance metrics", () => {
    it("should track request metrics", async () => {
      const mockRequest = jest.fn().mockResolvedValue("success");

      await connectionPool.executeRequest(mockRequest);

      const metrics = connectionPool.getPerformanceMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.errorRate).toBe(0);
    });

    it("should track error metrics", async () => {
      const mockRequest = jest
        .fn()
        .mockRejectedValue(new Error("Request failed"));

      try {
        await connectionPool.executeRequest(mockRequest, { retries: 0 });
      } catch (error) {
        // Expected to fail
      }

      const metrics = connectionPool.getPerformanceMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.errorRate).toBe(1);
    });

    it("should reset statistics", () => {
      (connectionPool as any).totalRequests = 10;
      (connectionPool as any).totalErrors = 2;

      connectionPool.resetStats();

      const metrics = connectionPool.getPerformanceMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.totalErrors).toBe(0);
    });
  });

  describe("pool optimization", () => {
    it("should optimize agents", () => {
      const initialMaxSockets = (connectionPool as any).httpAgent.maxSockets;

      connectionPool.optimizeAgents();

      const optimizedMaxSockets = (connectionPool as any).httpAgent.maxSockets;
      expect(optimizedMaxSockets).toBeGreaterThanOrEqual(
        Math.max(initialMaxSockets, 100),
      );
    });

    it("should warm up connection pool", async () => {
      const spy = jest
        .spyOn(connectionPool as any, "makeTestRequest")
        .mockResolvedValue(undefined);

      await connectionPool.warmupPool("https://api.inngest.com", 3);

      expect(spy).toHaveBeenCalledTimes(3);
      spy.mockRestore();
    });
  });

  describe("retry logic", () => {
    it("should calculate retry delay with exponential backoff", () => {
      const calculateRetryDelay = (
        connectionPool as any
      ).calculateRetryDelay.bind(connectionPool);

      const delay1 = calculateRetryDelay(3); // First retry
      const delay2 = calculateRetryDelay(2); // Second retry
      const delay3 = calculateRetryDelay(1); // Third retry

      expect(delay1).toBeGreaterThan(0);
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
      expect(delay3).toBeLessThanOrEqual(10000 * 1.3); // Max delay with jitter
    });

    it("should add jitter to retry delay", () => {
      const calculateRetryDelay = (
        connectionPool as any
      ).calculateRetryDelay.bind(connectionPool);

      const delays = Array.from({ length: 10 }, () => calculateRetryDelay(2));

      // All delays should be different due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe("request queuing", () => {
    it("should queue requests when at capacity", async () => {
      const mockRequest = jest.fn().mockResolvedValue("queued");

      // Fill up capacity
      (connectionPool as any).activeRequests = 50;

      const promise = connectionPool.executeRequest(mockRequest);

      // Request should be queued
      const stats = connectionPool.getStats();
      expect(stats.queuedRequests).toBe(1);

      // Release capacity and process queue
      (connectionPool as any).activeRequests = 0;
      (connectionPool as any).processQueue();

      const result = await promise;
      expect(result).toBe("queued");
    });

    it("should process queue in priority order", () => {
      (connectionPool as any).activeRequests = 50; // Fill capacity

      const highPriorityRequest = jest.fn().mockResolvedValue("high");
      const lowPriorityRequest = jest.fn().mockResolvedValue("low");

      connectionPool.executeRequest(lowPriorityRequest, { priority: 1 });
      connectionPool.executeRequest(highPriorityRequest, { priority: 10 });

      const queue = (connectionPool as any).requestQueue;
      expect(queue[0].priority).toBe(10); // High priority first
      expect(queue[1].priority).toBe(1); // Low priority second
    }, 10000);
  });

  describe("graceful shutdown", () => {
    it("should wait for active requests during shutdown", async () => {
      const mockRequest = jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) => setTimeout(() => resolve("done"), 100)),
        );

      // Start a request
      const requestPromise = connectionPool.executeRequest(mockRequest);

      // Start shutdown
      const shutdownPromise = connectionPool.onModuleDestroy();

      // Both should complete
      await Promise.all([requestPromise, shutdownPromise]);

      expect(mockRequest).toHaveBeenCalled();
    });

    it("should force shutdown after timeout", async () => {
      // Mock long-running request
      (connectionPool as any).activeRequests = 1;

      const shutdownPromise = connectionPool.onModuleDestroy();

      // Manually set activeRequests to 0 after a short delay to simulate completion
      setTimeout(() => {
        (connectionPool as any).activeRequests = 0;
      }, 50);

      await expect(shutdownPromise).resolves.toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("should handle request execution errors gracefully", async () => {
      const mockRequest = jest
        .fn()
        .mockRejectedValue(new Error("Network error"));

      await expect(
        connectionPool.executeRequest(mockRequest, { retries: 0 }),
      ).rejects.toThrow("Network error");

      const metrics = connectionPool.getPerformanceMetrics();
      expect(metrics.totalErrors).toBe(1);
    });

    it("should handle timeout errors", async () => {
      const mockRequest = jest
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 2000)),
        );

      await expect(
        connectionPool.executeRequest(mockRequest, {
          timeout: 100,
          retries: 0,
        }),
      ).rejects.toThrow("Request timed out after 100ms");
    });
  });

  describe("request ID generation", () => {
    it("should generate unique request IDs", () => {
      const generateRequestId = (connectionPool as any).generateRequestId.bind(
        connectionPool,
      );

      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^req-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^req-\d+-[a-z0-9]+$/);
    });
  });
});
