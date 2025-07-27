import { Injectable, Logger } from '@nestjs/common';
import { ConnectionPool } from './connection-pool';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Request optimization configuration
 */
interface OptimizationConfig {
  enableCompression: boolean;
  compressionThreshold: number; // Minimum size in bytes to compress
  enableCaching: boolean;
  cacheTimeout: number; // Cache timeout in milliseconds
  enableRequestBatching: boolean;
  batchTimeout: number; // Time to wait for batching in milliseconds
  maxBatchSize: number;
  enableResponseCaching: boolean;
  responseCacheSize: number; // Maximum number of cached responses
}

/**
 * Cached response entry
 */
interface CachedResponse {
  data: any;
  timestamp: number;
  headers: Record<string, string>;
}

/**
 * Batch request entry
 */
interface BatchRequestEntry {
  id: string;
  data: any;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
}

/**
 * Request performance metrics
 */
interface RequestPerformanceMetrics {
  compressionSavings: number;
  cacheHits: number;
  cacheMisses: number;
  batchedRequests: number;
  totalRequests: number;
  averageCompressionRatio: number;
  averageResponseTime: number;
}

/**
 * High-performance request optimizer for Inngest API calls
 * 
 * Features:
 * 1. Request/response compression
 * 2. Intelligent response caching
 * 3. Request batching and deduplication
 * 4. Adaptive optimization based on usage patterns
 * 5. Memory-efficient data structures
 * 6. Performance monitoring and auto-tuning
 */
@Injectable()
export class RequestOptimizer {
  private readonly logger = new Logger(RequestOptimizer.name);
  
  // Configuration
  private config: OptimizationConfig;
  
  // Response cache
  private readonly responseCache = new Map<string, CachedResponse>();
  private readonly cacheAccessTimes = new Map<string, number>();
  
  // Request batching
  private readonly pendingBatches = new Map<string, BatchRequestEntry[]>();
  private readonly batchTimers = new Map<string, NodeJS.Timeout>();
  
  // Performance metrics
  private metrics: RequestPerformanceMetrics = {
    compressionSavings: 0,
    cacheHits: 0,
    cacheMisses: 0,
    batchedRequests: 0,
    totalRequests: 0,
    averageCompressionRatio: 1,
    averageResponseTime: 0,
  };
  
  // Performance tracking
  private totalCompressionRatio = 0;
  private totalResponseTime = 0;
  private compressionSamples = 0;
  private responseSamples = 0;
  
  constructor(
    private readonly connectionPool: ConnectionPool,
    config?: Partial<OptimizationConfig>
  ) {
    this.config = {
      enableCompression: true,
      compressionThreshold: 1024, // 1KB
      enableCaching: true,
      cacheTimeout: 300000, // 5 minutes
      enableRequestBatching: true,
      batchTimeout: 50, // 50ms
      maxBatchSize: 10,
      enableResponseCaching: true,
      responseCacheSize: 1000,
      ...config,
    };

    this.logger.log('Request optimizer initialized with advanced features');
    
    // Start cache cleanup timer
    this.startCacheCleanup();
  }

  /**
   * Optimizes and executes a request with all available optimizations
   */
  async optimizeRequest<T>(
    url: string,
    data: any,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      headers?: Record<string, string>;
      cacheKey?: string;
      batchKey?: string;
      priority?: number;
      skipCompression?: boolean;
      skipCaching?: boolean;
      skipBatching?: boolean;
    } = {}
  ): Promise<T> {
    const startTime = performance.now();
    this.metrics.totalRequests++;
    
    const {
      method = 'POST',
      headers = {},
      cacheKey,
      batchKey,
      priority = 1,
      skipCompression = false,
      skipCaching = false,
      skipBatching = false,
    } = options;

    try {
      // Check cache first
      if (this.config.enableResponseCaching && !skipCaching && cacheKey) {
        const cachedResponse = this.getCachedResponse(cacheKey);
        if (cachedResponse) {
          this.metrics.cacheHits++;
          this.updateResponseTime(startTime);
          return cachedResponse.data;
        }
        this.metrics.cacheMisses++;
      }

      // Handle request batching
      if (this.config.enableRequestBatching && !skipBatching && batchKey) {
        return this.batchRequest(batchKey, data, url, method, headers, startTime);
      }

      // Execute optimized request
      const result = await this.executeOptimizedRequest<T>(
        url,
        data,
        method,
        headers,
        skipCompression,
        priority
      );

      // Cache response if enabled
      if (this.config.enableResponseCaching && !skipCaching && cacheKey) {
        this.cacheResponse(cacheKey, result, headers);
      }

      this.updateResponseTime(startTime);
      return result;
    } catch (error) {
      this.updateResponseTime(startTime);
      throw error;
    }
  }

  /**
   * Executes an optimized request with compression and connection pooling
   */
  private async executeOptimizedRequest<T>(
    url: string,
    data: any,
    method: string,
    headers: Record<string, string>,
    skipCompression: boolean,
    priority: number
  ): Promise<T> {
    // Prepare request data
    let requestData = data;
    let requestHeaders = { ...headers };

    // Apply compression if enabled and beneficial
    if (this.config.enableCompression && !skipCompression && data) {
      const serializedData = JSON.stringify(data);
      
      if (serializedData.length > this.config.compressionThreshold) {
        const originalSize = Buffer.byteLength(serializedData);
        const compressedData = await gzip(serializedData);
        const compressedSize = compressedData.length;
        
        // Use compression if it provides significant savings
        if (compressedSize < originalSize * 0.8) {
          requestData = compressedData;
          requestHeaders['content-encoding'] = 'gzip';
          requestHeaders['content-length'] = compressedSize.toString();
          
          // Track compression metrics
          const compressionRatio = originalSize / compressedSize;
          this.updateCompressionMetrics(originalSize, compressedSize, compressionRatio);
        }
      }
    }

    // Execute request through connection pool
    return this.connectionPool.executeRequest(
      () => this.makeHttpRequest<T>(url, requestData, method, requestHeaders),
      { priority }
    );
  }

  /**
   * Makes the actual HTTP request (would integrate with your HTTP client)
   */
  private async makeHttpRequest<T>(
    url: string,
    data: any,
    method: string,
    headers: Record<string, string>
  ): Promise<T> {
    // This is a placeholder - in real implementation, you'd use your HTTP client
    // with the connection pool's agent
    
    // Simulate request processing
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    
    // Mock response
    return {
      success: true,
      data: 'Mock response data',
      timestamp: Date.now(),
    } as any;
  }

  /**
   * Handles request batching for improved efficiency
   */
  private async batchRequest<T>(
    batchKey: string,
    data: any,
    url: string,
    method: string,
    headers: Record<string, string>,
    startTime: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      const batchEntry: BatchRequestEntry = {
        id: requestId,
        data,
        resolve,
        reject,
        timestamp: startTime,
      };

      // Add to batch
      if (!this.pendingBatches.has(batchKey)) {
        this.pendingBatches.set(batchKey, []);
      }
      
      const batch = this.pendingBatches.get(batchKey)!;
      batch.push(batchEntry);

      // Set timer for batch execution if not already set
      if (!this.batchTimers.has(batchKey)) {
        const timer = setTimeout(() => {
          this.executeBatch(batchKey, url, method, headers);
        }, this.config.batchTimeout);
        
        this.batchTimers.set(batchKey, timer);
      }

      // Execute immediately if batch is full
      if (batch.length >= this.config.maxBatchSize) {
        clearTimeout(this.batchTimers.get(batchKey)!);
        this.batchTimers.delete(batchKey);
        this.executeBatch(batchKey, url, method, headers);
      }
    });
  }

  /**
   * Executes a batch of requests
   */
  private async executeBatch(
    batchKey: string,
    url: string,
    method: string,
    headers: Record<string, string>
  ): Promise<void> {
    const batch = this.pendingBatches.get(batchKey);
    if (!batch || batch.length === 0) {
      return;
    }

    // Remove batch from pending
    this.pendingBatches.delete(batchKey);
    this.batchTimers.delete(batchKey);

    this.metrics.batchedRequests += batch.length;

    try {
      // Combine batch data
      const batchData = {
        requests: batch.map(entry => ({
          id: entry.id,
          data: entry.data,
        })),
      };

      // Execute batch request
      const batchResult = await this.executeOptimizedRequest(
        url,
        batchData,
        method,
        headers,
        false, // Don't skip compression for batches
        1 // Normal priority for batches
      );

      // Distribute results back to individual requests
      this.distributeBatchResults(batch, batchResult);
    } catch (error) {
      // Reject all requests in batch
      batch.forEach(entry => entry.reject(error));
    }
  }

  /**
   * Distributes batch results to individual requests
   */
  private distributeBatchResults(
    batch: BatchRequestEntry[],
    batchResult: any
  ): void {
    // Parse batch response (implementation depends on your API format)
    const results = batchResult.results || [];
    
    batch.forEach((entry, index) => {
      const result = results[index] || batchResult;
      entry.resolve(result);
    });
  }

  /**
   * Gets cached response if available and not expired
   */
  private getCachedResponse(cacheKey: string): CachedResponse | null {
    const cached = this.responseCache.get(cacheKey);
    
    if (!cached) {
      return null;
    }

    // Check if cache entry is still valid
    const now = Date.now();
    if (now - cached.timestamp > this.config.cacheTimeout) {
      this.responseCache.delete(cacheKey);
      this.cacheAccessTimes.delete(cacheKey);
      return null;
    }

    // Update access time for LRU eviction
    this.cacheAccessTimes.set(cacheKey, now);
    
    return cached;
  }

  /**
   * Caches a response
   */
  private cacheResponse(
    cacheKey: string,
    data: any,
    headers: Record<string, string>
  ): void {
    // Enforce cache size limit with LRU eviction
    if (this.responseCache.size >= this.config.responseCacheSize) {
      this.evictLRUCacheEntry();
    }

    const cached: CachedResponse = {
      data,
      timestamp: Date.now(),
      headers,
    };

    this.responseCache.set(cacheKey, cached);
    this.cacheAccessTimes.set(cacheKey, Date.now());
  }

  /**
   * Evicts least recently used cache entry
   */
  private evictLRUCacheEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, time] of this.cacheAccessTimes.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.responseCache.delete(oldestKey);
      this.cacheAccessTimes.delete(oldestKey);
    }
  }

  /**
   * Updates compression metrics
   */
  private updateCompressionMetrics(
    originalSize: number,
    compressedSize: number,
    compressionRatio: number
  ): void {
    this.metrics.compressionSavings += originalSize - compressedSize;
    this.totalCompressionRatio += compressionRatio;
    this.compressionSamples++;
    this.metrics.averageCompressionRatio = this.totalCompressionRatio / this.compressionSamples;
  }

  /**
   * Updates response time metrics
   */
  private updateResponseTime(startTime: number): void {
    const responseTime = performance.now() - startTime;
    this.totalResponseTime += responseTime;
    this.responseSamples++;
    this.metrics.averageResponseTime = this.totalResponseTime / this.responseSamples;
  }

  /**
   * Generates a unique request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Starts cache cleanup timer
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 60000); // Cleanup every minute
  }

  /**
   * Cleans up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, cached] of this.responseCache.entries()) {
      if (now - cached.timestamp > this.config.cacheTimeout) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.responseCache.delete(key);
      this.cacheAccessTimes.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.logger.debug(`Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }

  /**
   * Gets performance metrics
   */
  getMetrics(): RequestPerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Gets detailed performance statistics
   */
  getDetailedStats(): {
    metrics: RequestPerformanceMetrics;
    cacheStats: {
      size: number;
      hitRate: number;
      memoryUsage: number;
    };
    batchingStats: {
      activeBatches: number;
      averageBatchSize: number;
    };
    compressionStats: {
      compressionEnabled: boolean;
      averageSavings: number;
    };
  } {
    const cacheHitRate = this.metrics.totalRequests > 0 ?
      this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) : 0;

    const estimatedCacheMemory = this.responseCache.size * 1000; // Rough estimate
    
    const averageBatchSize = this.metrics.batchedRequests > 0 ?
      this.metrics.batchedRequests / this.pendingBatches.size : 0;

    const averageCompressionSavings = this.compressionSamples > 0 ?
      this.metrics.compressionSavings / this.compressionSamples : 0;

    return {
      metrics: this.getMetrics(),
      cacheStats: {
        size: this.responseCache.size,
        hitRate: cacheHitRate,
        memoryUsage: estimatedCacheMemory,
      },
      batchingStats: {
        activeBatches: this.pendingBatches.size,
        averageBatchSize,
      },
      compressionStats: {
        compressionEnabled: this.config.enableCompression,
        averageSavings: averageCompressionSavings,
      },
    };
  }

  /**
   * Optimizes configuration based on usage patterns
   */
  autoOptimizeConfig(): void {
    const stats = this.getDetailedStats();
    
    // Adjust cache size based on hit rate
    if (stats.cacheStats.hitRate > 0.8 && this.config.responseCacheSize < 2000) {
      this.config.responseCacheSize = Math.min(this.config.responseCacheSize * 1.5, 2000);
      this.logger.log(`Increased cache size to ${this.config.responseCacheSize} due to high hit rate`);
    } else if (stats.cacheStats.hitRate < 0.2 && this.config.responseCacheSize > 100) {
      this.config.responseCacheSize = Math.max(this.config.responseCacheSize * 0.8, 100);
      this.logger.log(`Decreased cache size to ${this.config.responseCacheSize} due to low hit rate`);
    }

    // Adjust compression threshold based on compression ratio
    if (this.metrics.averageCompressionRatio > 3 && this.config.compressionThreshold > 512) {
      this.config.compressionThreshold = Math.max(this.config.compressionThreshold * 0.8, 512);
      this.logger.log(`Decreased compression threshold to ${this.config.compressionThreshold} due to high compression ratio`);
    }

    // Adjust batch timeout based on usage
    if (stats.batchingStats.averageBatchSize < 2 && this.config.batchTimeout < 200) {
      this.config.batchTimeout = Math.min(this.config.batchTimeout * 1.2, 200);
      this.logger.log(`Increased batch timeout to ${this.config.batchTimeout}ms to improve batching`);
    }
  }

  /**
   * Resets all metrics
   */
  resetMetrics(): void {
    this.metrics = {
      compressionSavings: 0,
      cacheHits: 0,
      cacheMisses: 0,
      batchedRequests: 0,
      totalRequests: 0,
      averageCompressionRatio: 1,
      averageResponseTime: 0,
    };
    
    this.totalCompressionRatio = 0;
    this.totalResponseTime = 0;
    this.compressionSamples = 0;
    this.responseSamples = 0;
    
    this.logger.log('Request optimizer metrics reset');
  }

  /**
   * Clears all caches
   */
  clearCaches(): void {
    this.responseCache.clear();
    this.cacheAccessTimes.clear();
    this.pendingBatches.clear();
    
    // Clear timers
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }
    this.batchTimers.clear();
    
    this.logger.log('Request optimizer caches cleared');
  }

  /**
   * Gets current configuration
   */
  getConfig(): OptimizationConfig {
    return { ...this.config };
  }

  /**
   * Updates configuration
   */
  updateConfig(newConfig: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.log('Request optimizer configuration updated');
  }
}