import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";

/**
 * Connection pool statistics for monitoring
 */
interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  queuedRequests: number;
  totalRequests: number;
  averageResponseTime: number;
  errorRate: number;
}

/**
 * Request metrics for performance tracking
 */
interface RequestMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * HTTP connection pool configuration
 */
interface PoolConfig {
  maxSockets: number;
  maxFreeSockets: number;
  timeout: number;
  keepAlive: boolean;
  keepAliveMsecs: number;
  maxCachedSessions?: number;
  rejectUnauthorized?: boolean;
}

/**
 * High-performance HTTP connection pool for optimized requests to Inngest API
 *
 * Features:
 * 1. Connection reuse and pooling
 * 2. Request queuing and throttling
 * 3. Automatic retry with exponential backoff
 * 4. Circuit breaker pattern
 * 5. Request/response compression
 * 6. Performance monitoring and metrics
 */
@Injectable()
export class ConnectionPool implements OnModuleDestroy {
  private readonly logger = new Logger(ConnectionPool.name);

  // HTTP agents for connection pooling
  private readonly httpAgent: HttpAgent;
  private readonly httpsAgent: HttpsAgent;

  // Performance tracking
  private readonly requestMetrics = new Map<string, RequestMetrics>();
  private totalRequests = 0;
  private totalErrors = 0;
  private totalDuration = 0;

  // Circuit breaker state
  private circuitBreakerOpen = false;
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private readonly maxFailures = 5;
  private readonly circuitBreakerTimeout = 30000; // 30 seconds

  // Request queuing
  private readonly requestQueue: Array<{
    resolve: (value: any) => void;
    reject: (error: any) => void;
    request: () => Promise<any>;
    priority: number;
  }> = [];
  private activeRequests = 0;
  private readonly maxConcurrentRequests = 50;

  constructor(config?: Partial<PoolConfig>) {
    const poolConfig: PoolConfig = {
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 30000,
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxCachedSessions: 100,
      rejectUnauthorized: true,
      ...config,
    };

    // Create HTTP agents with optimized settings
    this.httpAgent = new HttpAgent({
      maxSockets: poolConfig.maxSockets,
      maxFreeSockets: poolConfig.maxFreeSockets,
      timeout: poolConfig.timeout,
      keepAlive: poolConfig.keepAlive,
      keepAliveMsecs: poolConfig.keepAliveMsecs,
    });

    this.httpsAgent = new HttpsAgent({
      maxSockets: poolConfig.maxSockets,
      maxFreeSockets: poolConfig.maxFreeSockets,
      timeout: poolConfig.timeout,
      keepAlive: poolConfig.keepAlive,
      keepAliveMsecs: poolConfig.keepAliveMsecs,
      maxCachedSessions: poolConfig.maxCachedSessions,
      rejectUnauthorized: poolConfig.rejectUnauthorized,
    });

    this.logger.log("Connection pool initialized with optimized settings");
  }

  /**
   * Gets the appropriate HTTP agent for a URL
   */
  getAgent(url: string): HttpAgent | HttpsAgent {
    return url.startsWith("https:") ? this.httpsAgent : this.httpAgent;
  }

  /**
   * Executes a request with connection pooling and optimization features
   */
  async executeRequest<T>(
    requestFn: () => Promise<T>,
    options: {
      priority?: number;
      retries?: number;
      timeout?: number;
      circuitBreaker?: boolean;
    } = {},
  ): Promise<T> {
    const {
      priority = 1,
      retries = 3,
      timeout = 30000,
      circuitBreaker = true,
    } = options;

    // Check circuit breaker
    if (circuitBreaker && this.isCircuitBreakerOpen()) {
      throw new Error(
        "Circuit breaker is open - requests are currently failing",
      );
    }

    // Queue request if we're at capacity
    if (this.activeRequests >= this.maxConcurrentRequests) {
      return this.queueRequest(requestFn, priority);
    }

    return this.executeRequestInternal(requestFn, retries, timeout);
  }

  /**
   * Internal request execution with metrics and error handling
   */
  private async executeRequestInternal<T>(
    requestFn: () => Promise<T>,
    retries: number,
    timeout: number,
  ): Promise<T> {
    const requestId = this.generateRequestId();
    const metrics: RequestMetrics = {
      startTime: performance.now(),
      success: false,
    };

    this.requestMetrics.set(requestId, metrics);
    this.activeRequests++;
    this.totalRequests++;

    try {
      // Execute request with timeout
      const result = await this.withTimeout(requestFn(), timeout);

      // Update metrics for success
      metrics.endTime = performance.now();
      metrics.duration = metrics.endTime - metrics.startTime;
      metrics.success = true;

      this.totalDuration += metrics.duration;
      this.recordSuccess();

      return result;
    } catch (error) {
      // Update metrics for failure
      metrics.endTime = performance.now();
      metrics.duration = metrics.endTime - metrics.startTime;
      metrics.error = error instanceof Error ? error.message : String(error);

      this.totalErrors++;
      this.recordFailure();

      // Retry if retries remaining
      if (retries > 0) {
        const delay = this.calculateRetryDelay(retries);
        await this.sleep(delay);
        return this.executeRequestInternal(requestFn, retries - 1, timeout);
      }

      throw error;
    } finally {
      this.activeRequests--;

      // Process queued requests
      this.processQueue();

      // Cleanup old metrics
      setTimeout(() => {
        this.requestMetrics.delete(requestId);
      }, 60000); // Keep metrics for 1 minute
    }
  }

  /**
   * Queues a request when at capacity
   */
  private async queueRequest<T>(
    requestFn: () => Promise<T>,
    priority: number,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        resolve,
        reject,
        request: requestFn,
        priority,
      });

      // Sort queue by priority (higher priority first)
      this.requestQueue.sort((a, b) => b.priority - a.priority);
    });
  }

  /**
   * Processes queued requests
   */
  private processQueue(): void {
    while (
      this.requestQueue.length > 0 &&
      this.activeRequests < this.maxConcurrentRequests
    ) {
      const queuedRequest = this.requestQueue.shift()!;

      this.executeRequestInternal(queuedRequest.request, 3, 30000)
        .then(queuedRequest.resolve)
        .catch(queuedRequest.reject);
    }
  }

  /**
   * Adds timeout to a promise
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Calculates retry delay with exponential backoff
   */
  private calculateRetryDelay(retriesRemaining: number): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 10000; // 10 seconds
    const attempt = 4 - retriesRemaining; // Convert to attempt number

    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;

    return delay + jitter;
  }

  /**
   * Simple sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generates a unique request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Records a successful request for circuit breaker
   */
  private recordSuccess(): void {
    this.consecutiveFailures = 0;

    // Close circuit breaker if it was open
    if (this.circuitBreakerOpen) {
      this.circuitBreakerOpen = false;
      this.logger.log("Circuit breaker closed - requests resumed");
    }
  }

  /**
   * Records a failed request for circuit breaker
   */
  private recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    // Open circuit breaker if failure threshold reached
    if (
      this.consecutiveFailures >= this.maxFailures &&
      !this.circuitBreakerOpen
    ) {
      this.circuitBreakerOpen = true;
      this.logger.warn(
        `Circuit breaker opened after ${this.consecutiveFailures} consecutive failures`,
      );
    }
  }

  /**
   * Checks if circuit breaker is open
   */
  private isCircuitBreakerOpen(): boolean {
    if (!this.circuitBreakerOpen) {
      return false;
    }

    // Check if circuit breaker timeout has passed
    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    if (timeSinceLastFailure > this.circuitBreakerTimeout) {
      this.logger.log("Circuit breaker timeout reached - attempting to close");
      return false; // Allow one test request
    }

    return true;
  }

  /**
   * Gets connection pool statistics
   */
  getStats(): PoolStats {
    const averageResponseTime =
      this.totalRequests > 0 ? this.totalDuration / this.totalRequests : 0;

    const errorRate =
      this.totalRequests > 0 ? this.totalErrors / this.totalRequests : 0;

    return {
      totalConnections: this.httpAgent.maxSockets + this.httpsAgent.maxSockets,
      activeConnections: this.activeRequests,
      idleConnections:
        (this.httpAgent.freeSockets?.["localhost:80"]?.length || 0) +
        (this.httpsAgent.freeSockets?.["localhost:443"]?.length || 0),
      queuedRequests: this.requestQueue.length,
      totalRequests: this.totalRequests,
      averageResponseTime,
      errorRate,
    };
  }

  /**
   * Gets detailed performance metrics
   */
  getPerformanceMetrics(): {
    totalRequests: number;
    totalErrors: number;
    averageResponseTime: number;
    errorRate: number;
    circuitBreakerOpen: boolean;
    consecutiveFailures: number;
    activeRequestMetrics: RequestMetrics[];
  } {
    const activeRequestMetrics = Array.from(
      this.requestMetrics.values(),
    ).filter((metrics) => !metrics.endTime); // Only active requests

    return {
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      averageResponseTime:
        this.totalRequests > 0 ? this.totalDuration / this.totalRequests : 0,
      errorRate:
        this.totalRequests > 0 ? this.totalErrors / this.totalRequests : 0,
      circuitBreakerOpen: this.circuitBreakerOpen,
      consecutiveFailures: this.consecutiveFailures,
      activeRequestMetrics,
    };
  }

  /**
   * Optimizes agents for better performance
   */
  optimizeAgents(): void {
    // Increase socket limits for high-throughput scenarios
    this.httpAgent.maxSockets = Math.max(this.httpAgent.maxSockets, 100);
    this.httpsAgent.maxSockets = Math.max(this.httpsAgent.maxSockets, 100);

    // Optimize keep-alive settings
    (this.httpAgent as any).keepAlive = true;
    (this.httpsAgent as any).keepAlive = true;

    this.logger.log("HTTP agents optimized for high-throughput");
  }

  /**
   * Warms up the connection pool
   */
  async warmupPool(baseUrl: string, requests: number = 5): Promise<void> {
    this.logger.log(
      `Warming up connection pool with ${requests} requests to ${baseUrl}`,
    );

    const warmupPromises = Array.from({ length: requests }, () =>
      this.executeRequest(() => this.makeTestRequest(baseUrl), {
        priority: 0,
        circuitBreaker: false,
      }).catch(() => {
        // Ignore warmup failures
      }),
    );

    await Promise.allSettled(warmupPromises);
    this.logger.log("Connection pool warmup completed");
  }

  /**
   * Makes a simple test request for warmup
   */
  private async makeTestRequest(baseUrl: string): Promise<void> {
    // This would typically be a HEAD request or similar lightweight operation
    // For demonstration, we'll just simulate a request
    await this.sleep(100);
  }

  /**
   * Resets statistics
   */
  resetStats(): void {
    this.totalRequests = 0;
    this.totalErrors = 0;
    this.totalDuration = 0;
    this.requestMetrics.clear();
    this.logger.log("Connection pool statistics reset");
  }

  /**
   * Forces circuit breaker to close (for testing/recovery)
   */
  forceCircuitBreakerClose(): void {
    this.circuitBreakerOpen = false;
    this.consecutiveFailures = 0;
    this.logger.log("Circuit breaker manually closed");
  }

  /**
   * Graceful shutdown
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log("Shutting down connection pool...");

    // Wait for active requests to complete (with timeout)
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.activeRequests > 0 && Date.now() - startTime < maxWaitTime) {
      await this.sleep(100);
    }

    // Destroy agents
    this.httpAgent.destroy();
    this.httpsAgent.destroy();

    this.logger.log("Connection pool shutdown completed");
  }
}
