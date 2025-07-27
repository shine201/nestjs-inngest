import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

/**
 * Memory usage statistics
 */
interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
}

/**
 * Object pool for reusing expensive objects
 */
class ObjectPool<T> {
  private available: T[] = [];
  private inUse = new Set<T>();
  private factory: () => T;
  private resetFn?: (obj: T) => void;
  private maxSize: number;

  constructor(
    factory: () => T,
    maxSize: number = 100,
    resetFn?: (obj: T) => void
  ) {
    this.factory = factory;
    this.maxSize = maxSize;
    this.resetFn = resetFn;
  }

  acquire(): T {
    let obj = this.available.pop();
    
    if (!obj) {
      obj = this.factory();
    }
    
    this.inUse.add(obj);
    return obj;
  }

  release(obj: T): void {
    if (!this.inUse.has(obj)) {
      return;
    }
    
    this.inUse.delete(obj);
    
    if (this.available.length < this.maxSize) {
      if (this.resetFn) {
        this.resetFn(obj);
      }
      this.available.push(obj);
    }
  }

  size(): { available: number; inUse: number } {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
    };
  }

  clear(): void {
    this.available = [];
    this.inUse.clear();
  }
}

/**
 * WeakRef cache for memory-efficient object caching
 */
class WeakRefCache<K, V extends object> {
  private cache = new Map<K, any>();
  private finalizationRegistry = (global as any).FinalizationRegistry ? new (global as any).FinalizationRegistry((key: K) => {
    this.cache.delete(key);
  }) : null;

  set(key: K, value: V): void {
    // Clean up existing entry if any
    const existing = this.cache.get(key);
    if (existing && this.finalizationRegistry) {
      this.finalizationRegistry.unregister(existing);
    }

    const weakRef = (global as any).WeakRef ? new (global as any).WeakRef(value) : { deref: () => value };
    this.cache.set(key, weakRef);
    if (this.finalizationRegistry) {
      this.finalizationRegistry.register(value, key, weakRef);
    }
  }

  get(key: K): V | undefined {
    const weakRef = this.cache.get(key);
    if (!weakRef) {
      return undefined;
    }

    const value = weakRef.deref();
    if (value === undefined) {
      // Object was garbage collected
      this.cache.delete(key);
      return undefined;
    }

    return value;
  }

  has(key: K): boolean {
    const weakRef = this.cache.get(key);
    if (!weakRef) {
      return false;
    }

    const value = weakRef.deref();
    if (value === undefined) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: K): boolean {
    const weakRef = this.cache.get(key);
    if (weakRef && this.finalizationRegistry) {
      this.finalizationRegistry.unregister(weakRef);
    }
    return this.cache.delete(key);
  }

  clear(): void {
    if (this.finalizationRegistry) {
      for (const weakRef of this.cache.values()) {
        this.finalizationRegistry.unregister(weakRef);
      }
    }
    this.cache.clear();
  }

  size(): number {
    // Clean up stale entries and return actual size
    const keysToDelete: K[] = [];
    
    for (const [key, weakRef] of this.cache.entries()) {
      if (weakRef.deref() === undefined) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
    
    return this.cache.size;
  }
}

/**
 * Memory-efficient string interning
 */
class StringInterning {
  private static readonly internedStrings = new Map<string, any>();
  private static readonly finalizationRegistry = (global as any).FinalizationRegistry ? new (global as any).FinalizationRegistry((str: string) => {
    StringInterning.internedStrings.delete(str);
  }) : null;

  static intern(str: string): string {
    const existing = this.internedStrings.get(str);
    if (existing) {
      const internedStr = existing.deref();
      if (internedStr !== undefined) {
        return internedStr;
      }
    }

    // Create new interned string
    const internedStr = str.slice(); // Create a copy
    const weakRef = (global as any).WeakRef ? new (global as any).WeakRef(internedStr) : { deref: () => internedStr };
    this.internedStrings.set(str, weakRef);
    if (this.finalizationRegistry) {
      this.finalizationRegistry.register(internedStr, str, weakRef);
    }
    
    return internedStr;
  }

  static size(): number {
    // Clean up stale entries
    const keysToDelete: string[] = [];
    
    for (const [key, weakRef] of this.internedStrings.entries()) {
      if (weakRef.deref() === undefined) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.internedStrings.delete(key);
    }
    
    return this.internedStrings.size;
  }

  static clear(): void {
    if (this.finalizationRegistry) {
      for (const weakRef of this.internedStrings.values()) {
        this.finalizationRegistry.unregister(weakRef);
      }
    }
    this.internedStrings.clear();
  }
}

/**
 * Memory optimizer for reducing memory usage and improving garbage collection
 * 
 * Features:
 * 1. Object pooling for expensive objects
 * 2. WeakRef-based caching to prevent memory leaks
 * 3. String interning for memory deduplication
 * 4. Memory monitoring and automatic cleanup
 * 5. Lazy loading and memory-efficient data structures
 * 6. Garbage collection optimization
 */
@Injectable()
export class MemoryOptimizer implements OnModuleDestroy {
  private readonly logger = new Logger(MemoryOptimizer.name);
  
  // Object pools for common objects
  private readonly eventObjectPool = new ObjectPool(
    () => ({}),
    100,
    (obj) => {
      // Reset object by clearing all properties
      for (const key in obj) {
        delete (obj as any)[key];
      }
    }
  );
  
  private readonly metadataObjectPool = new ObjectPool(
    () => ({ target: null, propertyKey: '', config: null, handler: null }),
    50,
    (obj) => {
      obj.target = null;
      obj.propertyKey = '';
      obj.config = null;
      obj.handler = null;
    }
  );
  
  // WeakRef caches for memory-efficient caching
  private readonly functionMetadataCache = new WeakRefCache<string, any>();
  private readonly configValidationCache = new Map<string, boolean>();
  
  // Memory monitoring
  private memoryCheckInterval: NodeJS.Timeout | null = null;
  private lastMemoryCheck = 0;
  private memoryHistory: MemoryStats[] = [];
  private readonly maxHistorySize = 100;
  
  // Memory thresholds for optimization
  private readonly memoryThresholds = {
    warning: 500 * 1024 * 1024, // 500MB
    critical: 1024 * 1024 * 1024, // 1GB
    gcTrigger: 750 * 1024 * 1024, // 750MB
  };

  constructor() {
    this.startMemoryMonitoring();
    this.logger.log('Memory optimizer initialized with advanced features');
  }

  /**
   * Acquires an event object from the pool
   */
  acquireEventObject(): any {
    return this.eventObjectPool.acquire();
  }

  /**
   * Releases an event object back to the pool
   */
  releaseEventObject(obj: any): void {
    this.eventObjectPool.release(obj);
  }

  /**
   * Acquires a metadata object from the pool
   */
  acquireMetadataObject(): any {
    return this.metadataObjectPool.acquire();
  }

  /**
   * Releases a metadata object back to the pool
   */
  releaseMetadataObject(obj: any): void {
    this.metadataObjectPool.release(obj);
  }

  /**
   * Interns a string for memory deduplication
   */
  internString(str: string): string {
    return StringInterning.intern(str);
  }

  /**
   * Caches function metadata with memory-efficient storage
   */
  cacheFunctionMetadata(key: string, metadata: any): void {
    this.functionMetadataCache.set(key, metadata);
  }

  /**
   * Retrieves cached function metadata
   */
  getCachedFunctionMetadata(key: string): any | undefined {
    return this.functionMetadataCache.get(key);
  }

  /**
   * Caches config validation results
   */
  cacheConfigValidation(key: string, isValid: boolean): void {
    this.configValidationCache.set(key, isValid);
  }

  /**
   * Retrieves cached config validation result
   */
  getCachedConfigValidation(key: string): boolean | undefined {
    return this.configValidationCache.get(key);
  }

  /**
   * Creates a memory-efficient object with minimal overhead
   */
  createLeanObject(properties: Record<string, any>): any {
    // Use Object.create(null) to avoid prototype overhead
    const obj = Object.create(null);
    
    // Intern string properties for memory efficiency
    for (const [key, value] of Object.entries(properties)) {
      const internedKey = this.internString(key);
      obj[internedKey] = typeof value === 'string' ? this.internString(value) : value;
    }
    
    return obj;
  }

  /**
   * Optimizes an existing object for memory efficiency
   */
  optimizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    // Create optimized version
    const optimized = Object.create(null);
    
    for (const [key, value] of Object.entries(obj)) {
      const internedKey = this.internString(key);
      
      if (typeof value === 'string') {
        optimized[internedKey] = this.internString(value);
      } else if (Array.isArray(value)) {
        optimized[internedKey] = this.optimizeArray(value);
      } else if (value && typeof value === 'object') {
        optimized[internedKey] = this.optimizeObject(value);
      } else {
        optimized[internedKey] = value;
      }
    }
    
    return optimized;
  }

  /**
   * Optimizes an array for memory efficiency
   */
  private optimizeArray(arr: any[]): any[] {
    return arr.map(item => {
      if (typeof item === 'string') {
        return this.internString(item);
      } else if (item && typeof item === 'object') {
        return this.optimizeObject(item);
      }
      return item;
    });
  }

  /**
   * Performs aggressive garbage collection if memory usage is high
   */
  forceGarbageCollection(): void {
    if (global.gc) {
      const beforeGC = process.memoryUsage();
      global.gc();
      const afterGC = process.memoryUsage();
      
      const memoryFreed = beforeGC.heapUsed - afterGC.heapUsed;
      this.logger.log(`Forced GC: Freed ${this.formatBytes(memoryFreed)} of memory`);
    } else {
      this.logger.warn('Garbage collection not available (run with --expose-gc)');
    }
  }

  /**
   * Starts memory monitoring
   */
  private startMemoryMonitoring(): void {
    this.memoryCheckInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Checks current memory usage and triggers optimizations if needed
   */
  private checkMemoryUsage(): void {
    const memStats = this.getMemoryStats();
    this.memoryHistory.push(memStats);
    
    // Keep history size manageable
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory.shift();
    }
    
    // Check for memory pressure
    if (memStats.heapUsed > this.memoryThresholds.critical) {
      this.logger.warn(`Critical memory usage: ${this.formatBytes(memStats.heapUsed)}`);
      this.performEmergencyCleanup();
    } else if (memStats.heapUsed > this.memoryThresholds.gcTrigger) {
      this.logger.log(`High memory usage detected: ${this.formatBytes(memStats.heapUsed)}`);
      this.performOptimization();
    } else if (memStats.heapUsed > this.memoryThresholds.warning) {
      this.logger.debug(`Memory usage warning: ${this.formatBytes(memStats.heapUsed)}`);
    }
    
    this.lastMemoryCheck = Date.now();
  }

  /**
   * Performs routine memory optimization
   */
  private performOptimization(): void {
    // Clean up WeakRef caches
    this.functionMetadataCache.size(); // Triggers cleanup
    // Regular Map doesn't need cleanup trigger
    
    // Clean up string interning
    StringInterning.size(); // Triggers cleanup
    
    // Suggest garbage collection
    if (global.gc && Math.random() < 0.3) { // 30% chance to avoid too frequent GC
      this.forceGarbageCollection();
    }
  }

  /**
   * Performs emergency cleanup when memory is critically high
   */
  private performEmergencyCleanup(): void {
    this.logger.warn('Performing emergency memory cleanup');
    
    // Clear all caches
    this.clearAllCaches();
    
    // Force garbage collection
    this.forceGarbageCollection();
    
    // Trim memory history
    this.memoryHistory = this.memoryHistory.slice(-10);
  }

  /**
   * Gets current memory statistics
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers || 0,
    };
  }

  /**
   * Gets detailed memory information including optimizer stats
   */
  getDetailedMemoryInfo(): {
    current: MemoryStats;
    thresholds: {
      warning: number;
      critical: number;
      gcTrigger: number;
    };
    poolStats: {
      eventObjects: { available: number; inUse: number };
      metadataObjects: { available: number; inUse: number };
    };
    cacheStats: {
      functionMetadata: number;
      configValidation: number;
      internedStrings: number;
    };
    memoryTrend: {
      samples: number;
      averageUsage: number;
      peakUsage: number;
      trend: 'increasing' | 'decreasing' | 'stable';
    };
  } {
    const current = this.getMemoryStats();
    const thresholds = this.memoryThresholds;
    
    // Calculate memory trend
    const recentSamples = this.memoryHistory.slice(-10);
    const averageUsage = recentSamples.length > 0 ?
      recentSamples.reduce((sum, stat) => sum + stat.heapUsed, 0) / recentSamples.length : 0;
    
    const peakUsage = Math.max(...this.memoryHistory.map(stat => stat.heapUsed));
    
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (recentSamples.length >= 5) {
      const firstHalf = recentSamples.slice(0, Math.floor(recentSamples.length / 2));
      const secondHalf = recentSamples.slice(Math.floor(recentSamples.length / 2));
      
      const firstAvg = firstHalf.reduce((sum, stat) => sum + stat.heapUsed, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, stat) => sum + stat.heapUsed, 0) / secondHalf.length;
      
      const difference = secondAvg - firstAvg;
      const threshold = averageUsage * 0.05; // 5% threshold
      
      if (difference > threshold) {
        trend = 'increasing';
      } else if (difference < -threshold) {
        trend = 'decreasing';
      }
    }

    return {
      current,
      thresholds,
      poolStats: {
        eventObjects: this.eventObjectPool.size(),
        metadataObjects: this.metadataObjectPool.size(),
      },
      cacheStats: {
        functionMetadata: this.functionMetadataCache.size(),
        configValidation: this.configValidationCache.size,
        internedStrings: StringInterning.size(),
      },
      memoryTrend: {
        samples: this.memoryHistory.length,
        averageUsage,
        peakUsage,
        trend,
      },
    };
  }

  /**
   * Optimizes memory usage by clearing unnecessary caches and triggering GC
   */
  optimize(): void {
    this.logger.log('Starting memory optimization');
    
    // Clean up caches
    this.performOptimization();
    
    // Log results
    const memoryAfter = this.getMemoryStats();
    this.logger.log(`Memory optimization completed. Current usage: ${this.formatBytes(memoryAfter.heapUsed)}`);
  }

  /**
   * Clears all caches and pools
   */
  clearAllCaches(): void {
    this.functionMetadataCache.clear();
    this.configValidationCache.clear();
    this.eventObjectPool.clear();
    this.metadataObjectPool.clear();
    StringInterning.clear();
    
    this.logger.log('All memory caches cleared');
  }

  /**
   * Sets custom memory thresholds
   */
  setMemoryThresholds(thresholds: Partial<typeof this.memoryThresholds>): void {
    Object.assign(this.memoryThresholds, thresholds);
    this.logger.log('Memory thresholds updated');
  }

  /**
   * Formats bytes to human-readable format
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Creates a memory-efficient deep clone
   */
  efficientClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as T;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.efficientClone(item)) as unknown as T;
    }
    
    // Create object with null prototype for efficiency
    const cloned = Object.create(null);
    
    for (const [key, value] of Object.entries(obj)) {
      const internedKey = this.internString(key);
      cloned[internedKey] = this.efficientClone(value);
    }
    
    return cloned as T;
  }

  /**
   * Analyzes memory usage patterns and provides recommendations
   */
  analyzeMemoryUsage(): {
    recommendations: string[];
    severity: 'low' | 'medium' | 'high';
    optimizationOpportunities: string[];
  } {
    const info = this.getDetailedMemoryInfo();
    const recommendations: string[] = [];
    const optimizationOpportunities: string[] = [];
    let severity: 'low' | 'medium' | 'high' = 'low';
    
    // Analyze current usage
    if (info.current.heapUsed > this.memoryThresholds.critical) {
      severity = 'high';
      recommendations.push('Critical memory usage detected. Consider reducing cache sizes or restarting the application.');
    } else if (info.current.heapUsed > this.memoryThresholds.warning) {
      severity = 'medium';
      recommendations.push('High memory usage. Consider optimizing data structures or clearing caches.');
    }
    
    // Analyze trend
    if (info.memoryTrend.trend === 'increasing') {
      severity = severity === 'low' ? 'medium' : 'high';
      recommendations.push('Memory usage is increasing over time. Check for memory leaks.');
    }
    
    // Analyze cache efficiency
    if (info.cacheStats.functionMetadata > 1000) {
      optimizationOpportunities.push('Large function metadata cache. Consider implementing LRU eviction.');
    }
    
    if (info.cacheStats.internedStrings > 10000) {
      optimizationOpportunities.push('Large string interning cache. Consider periodic cleanup.');
    }
    
    // Pool utilization
    const eventPoolUtilization = info.poolStats.eventObjects.inUse / 
      (info.poolStats.eventObjects.available + info.poolStats.eventObjects.inUse);
    
    if (eventPoolUtilization > 0.8) {
      optimizationOpportunities.push('High event object pool utilization. Consider increasing pool size.');
    } else if (eventPoolUtilization < 0.1) {
      optimizationOpportunities.push('Low event object pool utilization. Consider decreasing pool size.');
    }
    
    return {
      recommendations,
      severity,
      optimizationOpportunities,
    };
  }

  /**
   * Module cleanup
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down memory optimizer...');
    
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
    }
    
    this.clearAllCaches();
    
    this.logger.log('Memory optimizer shutdown completed');
  }
}