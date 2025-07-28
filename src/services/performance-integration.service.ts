import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { OptimizedFunctionRegistry } from "./optimized-function-registry.service";
import { MemoryOptimizer } from "../utils/memory-optimizer";
import { RequestOptimizer } from "../utils/request-optimizer";
import { ConnectionPool } from "../utils/connection-pool";

/**
 * Comprehensive performance statistics
 */
interface PerformanceStats {
  memory: {
    current: any;
    poolStats: any;
    cacheStats: any;
    memoryTrend: any;
  };
  network: {
    connectionPool: any;
    requestOptimizer: any;
  };
  registry: {
    functionCount: number;
    registrationTimes: Map<string, number>;
    cacheHitRate: number;
    totalMemoryUsage: number;
  };
  system: {
    uptime: number;
    performanceRecommendations: string[];
    overallHealth: "excellent" | "good" | "warning" | "critical";
  };
}

/**
 * Performance integration service that orchestrates all optimization components
 *
 * Features:
 * 1. Centralized performance monitoring
 * 2. Automatic optimization triggers
 * 3. Health monitoring and alerting
 * 4. Performance analytics and reporting
 * 5. Memory leak detection and prevention
 * 6. Adaptive optimization based on usage patterns
 */
@Injectable()
export class PerformanceIntegrationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PerformanceIntegrationService.name);

  // Monitoring intervals
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private optimizationInterval: NodeJS.Timeout | null = null;

  // Performance tracking
  private startTime = Date.now();
  private lastOptimizationRun = 0;
  private performanceHistory: PerformanceStats[] = [];
  private readonly maxHistorySize = 100;

  // Thresholds for automatic optimization
  private readonly optimizationThresholds = {
    memoryUsage: 500 * 1024 * 1024, // 500MB
    cacheHitRateThreshold: 0.7, // 70%
    errorRateThreshold: 0.05, // 5%
    responseTimeThreshold: 1000, // 1 second
  };

  constructor(
    private readonly functionRegistry: OptimizedFunctionRegistry,
    private readonly memoryOptimizer: MemoryOptimizer,
    private readonly requestOptimizer: RequestOptimizer,
    private readonly connectionPool: ConnectionPool,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log("Performance integration service initializing...");

    // Start monitoring
    this.startHealthMonitoring();
    this.startPeriodicOptimization();

    // Perform initial optimization
    await this.performFullOptimization();

    this.logger.log("Performance integration service initialized");
  }

  /**
   * Starts health monitoring with configurable intervals
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 60000); // Check every minute
  }

  /**
   * Starts periodic optimization
   */
  private startPeriodicOptimization(): void {
    this.optimizationInterval = setInterval(() => {
      this.performAutomaticOptimization();
    }, 300000); // Optimize every 5 minutes
  }

  /**
   * Performs comprehensive health check
   */
  private performHealthCheck(): void {
    try {
      const stats = this.getComprehensiveStats();
      this.performanceHistory.push(stats);

      // Keep history manageable
      if (this.performanceHistory.length > this.maxHistorySize) {
        this.performanceHistory.shift();
      }

      // Analyze health status
      this.analyzeSystemHealth(stats);
    } catch (error) {
      this.logger.error("Health check failed:", error);
    }
  }

  /**
   * Analyzes system health and triggers optimizations if needed
   */
  private analyzeSystemHealth(stats: PerformanceStats): void {
    const warnings: string[] = [];

    // Check memory usage
    if (
      stats.memory.current.heapUsed > this.optimizationThresholds.memoryUsage
    ) {
      warnings.push("High memory usage detected");
      this.triggerMemoryOptimization();
    }

    // Check cache hit rate
    if (
      stats.registry.cacheHitRate <
      this.optimizationThresholds.cacheHitRateThreshold
    ) {
      warnings.push("Low cache hit rate");
      this.optimizeCacheConfiguration();
    }

    // Check network performance
    const networkStats = stats.network.connectionPool;
    if (
      networkStats.errorRate > this.optimizationThresholds.errorRateThreshold
    ) {
      warnings.push("High network error rate");
      this.optimizeNetworkConfiguration();
    }

    if (warnings.length > 0) {
      this.logger.warn(`System health warnings: ${warnings.join(", ")}`);
    }
  }

  /**
   * Performs automatic optimization based on usage patterns
   */
  private async performAutomaticOptimization(): Promise<void> {
    try {
      this.logger.debug("Starting automatic optimization cycle");

      // Memory optimization
      await this.optimizeMemoryUsage();

      // Network optimization
      await this.optimizeNetworkPerformance();

      // Cache optimization
      await this.optimizeCaches();

      this.lastOptimizationRun = Date.now();
      this.logger.debug("Automatic optimization cycle completed");
    } catch (error) {
      this.logger.error("Automatic optimization failed:", error);
    }
  }

  /**
   * Performs full system optimization
   */
  async performFullOptimization(): Promise<void> {
    this.logger.log("Starting full system optimization");

    try {
      // Memory optimization
      await this.optimizeMemoryUsage();

      // Network optimization
      await this.optimizeNetworkPerformance();

      // Cache optimization
      await this.optimizeCaches();

      // Registry optimization
      await this.optimizeRegistry();

      this.logger.log("Full system optimization completed");
    } catch (error) {
      this.logger.error("Full optimization failed:", error);
      throw error;
    }
  }

  /**
   * Optimizes memory usage across all components
   */
  private async optimizeMemoryUsage(): Promise<void> {
    try {
      // Analyze memory usage patterns
      const memoryAnalysis = this.memoryOptimizer.analyzeMemoryUsage();

      if (memoryAnalysis.severity === "high") {
        this.logger.warn(
          "Critical memory usage - performing aggressive optimization",
        );
        this.memoryOptimizer.clearAllCaches();
        this.memoryOptimizer.forceGarbageCollection();
      } else if (memoryAnalysis.severity === "medium") {
        this.memoryOptimizer.optimize();
      }

      // Apply optimization recommendations
      for (const recommendation of memoryAnalysis.optimizationOpportunities) {
        this.logger.debug(`Memory optimization: ${recommendation}`);
      }
    } catch (error) {
      this.logger.error("Full optimization failed:", error);
      // Don't rethrow - handle gracefully
    }
  }

  /**
   * Optimizes network performance
   */
  private async optimizeNetworkPerformance(): Promise<void> {
    // Auto-optimize request configuration
    this.requestOptimizer.autoOptimizeConfig();

    // Optimize connection pool
    this.connectionPool.optimizeAgents();

    // Warm up connections if needed
    const poolStats = this.connectionPool.getStats();
    if (poolStats.idleConnections < 5) {
      // Warmup connections for better performance
      await this.connectionPool.warmupPool("https://api.inngest.com", 3);
    }
  }

  /**
   * Optimizes caching across the system
   */
  private async optimizeCaches(): Promise<void> {
    const registryMetrics = this.functionRegistry.getPerformanceMetrics();

    // Clear stale caches if hit rate is low
    if (registryMetrics.cacheHitRate < 0.5) {
      this.logger.debug("Low cache hit rate detected - clearing stale caches");
      // The registry will automatically clean up stale entries
    }
  }

  /**
   * Optimizes function registry performance
   */
  private async optimizeRegistry(): Promise<void> {
    // Validate functions if needed
    try {
      this.functionRegistry.validateFunctions();
    } catch (error) {
      this.logger.error(
        "Function validation failed during optimization:",
        error,
      );
    }
  }

  /**
   * Triggers memory optimization when thresholds are exceeded
   */
  private triggerMemoryOptimization(): void {
    this.logger.log("Triggering emergency memory optimization");
    this.memoryOptimizer.optimize();
  }

  /**
   * Optimizes cache configuration based on usage patterns
   */
  private optimizeCacheConfiguration(): void {
    const memoryInfo = this.memoryOptimizer.getDetailedMemoryInfo();

    // Adjust cache thresholds based on memory availability
    if (memoryInfo.current.heapUsed > 400 * 1024 * 1024) {
      // 400MB
      this.memoryOptimizer.setMemoryThresholds({
        warning: 400 * 1024 * 1024,
        critical: 600 * 1024 * 1024,
        gcTrigger: 500 * 1024 * 1024,
      });
    }
  }

  /**
   * Optimizes network configuration based on performance metrics
   */
  private optimizeNetworkConfiguration(): void {
    const connectionStats = this.connectionPool.getPerformanceMetrics();

    if (connectionStats.errorRate > 0.1) {
      // 10% error rate
      this.logger.warn(
        "High network error rate - forcing circuit breaker close",
      );
      this.connectionPool.forceCircuitBreakerClose();
    }
  }

  /**
   * Gets comprehensive performance statistics
   */
  getComprehensiveStats(): PerformanceStats {
    const memoryInfo = this.memoryOptimizer.getDetailedMemoryInfo();
    const memoryAnalysis = this.memoryOptimizer.analyzeMemoryUsage();
    const networkStats = {
      connectionPool: this.connectionPool.getPerformanceMetrics(),
      requestOptimizer: this.requestOptimizer.getDetailedStats(),
    };
    const registryMetrics = this.functionRegistry.getPerformanceMetrics();

    // Calculate overall health
    let healthScore = 100;
    const recommendations: string[] = [...memoryAnalysis.recommendations];

    // Memory health (30% weight)
    if (memoryInfo.current.heapUsed > this.optimizationThresholds.memoryUsage) {
      healthScore -= 30;
      recommendations.push("Reduce memory usage");
    }

    // Cache performance (25% weight)
    if (
      registryMetrics.cacheHitRate <
      this.optimizationThresholds.cacheHitRateThreshold
    ) {
      healthScore -= 25;
      recommendations.push("Improve cache efficiency");
    }

    // Network performance (25% weight)
    if (
      networkStats.connectionPool.errorRate >
      this.optimizationThresholds.errorRateThreshold
    ) {
      healthScore -= 25;
      recommendations.push("Improve network reliability");
    }

    // Response time (20% weight)
    if (
      networkStats.connectionPool.averageResponseTime >
      this.optimizationThresholds.responseTimeThreshold
    ) {
      healthScore -= 20;
      recommendations.push("Optimize response times");
    }

    let overallHealth: "excellent" | "good" | "warning" | "critical";
    if (healthScore >= 90) overallHealth = "excellent";
    else if (healthScore >= 70) overallHealth = "good";
    else if (healthScore >= 50) overallHealth = "warning";
    else overallHealth = "critical";

    return {
      memory: {
        current: memoryInfo.current,
        poolStats: memoryInfo.poolStats,
        cacheStats: memoryInfo.cacheStats,
        memoryTrend: memoryInfo.memoryTrend,
      },
      network: networkStats,
      registry: {
        functionCount: this.functionRegistry.getFunctionCount(),
        registrationTimes: registryMetrics.registrationTimes,
        cacheHitRate: registryMetrics.cacheHitRate,
        totalMemoryUsage: registryMetrics.totalMemoryUsage,
      },
      system: {
        uptime: Date.now() - this.startTime,
        performanceRecommendations: recommendations,
        overallHealth,
      },
    };
  }

  /**
   * Gets performance trends over time
   */
  getPerformanceTrends(): {
    memoryTrend: "increasing" | "decreasing" | "stable";
    performanceTrend: "improving" | "degrading" | "stable";
    recommendations: string[];
  } {
    if (this.performanceHistory.length < 5) {
      return {
        memoryTrend: "stable",
        performanceTrend: "stable",
        recommendations: ["Insufficient data for trend analysis"],
      };
    }

    const recent = this.performanceHistory.slice(-5);
    const older = this.performanceHistory.slice(-10, -5);

    // Memory trend analysis
    const recentMemoryAvg =
      recent.reduce((sum, stat) => sum + stat.memory.current.heapUsed, 0) /
      recent.length;
    const olderMemoryAvg =
      older.length > 0
        ? older.reduce((sum, stat) => sum + stat.memory.current.heapUsed, 0) /
          older.length
        : recentMemoryAvg;

    let memoryTrend: "increasing" | "decreasing" | "stable" = "stable";
    const memoryThreshold = recentMemoryAvg * 0.1; // 10% threshold

    if (recentMemoryAvg > olderMemoryAvg + memoryThreshold) {
      memoryTrend = "increasing";
    } else if (recentMemoryAvg < olderMemoryAvg - memoryThreshold) {
      memoryTrend = "decreasing";
    }

    // Performance trend analysis (based on overall health scores)
    const recentHealthAvg =
      recent.reduce((sum, stat) => {
        return (
          sum +
          (stat.system.overallHealth === "excellent"
            ? 100
            : stat.system.overallHealth === "good"
              ? 75
              : stat.system.overallHealth === "warning"
                ? 50
                : 25)
        );
      }, 0) / recent.length;

    const olderHealthAvg =
      older.length > 0
        ? older.reduce((sum, stat) => {
            return (
              sum +
              (stat.system.overallHealth === "excellent"
                ? 100
                : stat.system.overallHealth === "good"
                  ? 75
                  : stat.system.overallHealth === "warning"
                    ? 50
                    : 25)
            );
          }, 0) / older.length
        : recentHealthAvg;

    let performanceTrend: "improving" | "degrading" | "stable" = "stable";
    const healthThreshold = 10; // 10 point threshold

    if (recentHealthAvg > olderHealthAvg + healthThreshold) {
      performanceTrend = "improving";
    } else if (recentHealthAvg < olderHealthAvg - healthThreshold) {
      performanceTrend = "degrading";
    }

    // Generate recommendations based on trends
    const recommendations: string[] = [];

    if (memoryTrend === "increasing") {
      recommendations.push(
        "Memory usage is increasing - consider memory optimization",
      );
    }

    if (performanceTrend === "degrading") {
      recommendations.push(
        "Performance is degrading - investigate recent changes",
      );
    }

    if (memoryTrend === "stable" && performanceTrend === "stable") {
      recommendations.push("System performance is stable");
    }

    return {
      memoryTrend,
      performanceTrend,
      recommendations,
    };
  }

  /**
   * Forces immediate optimization of all components
   */
  async forceOptimization(): Promise<void> {
    this.logger.log("Forcing immediate system optimization");
    await this.performFullOptimization();
  }

  /**
   * Resets all performance metrics and caches
   */
  resetPerformanceMetrics(): void {
    this.performanceHistory = [];
    this.requestOptimizer.resetMetrics();
    this.connectionPool.resetStats();
    this.memoryOptimizer.clearAllCaches();
    this.startTime = Date.now();

    this.logger.log("Performance metrics reset");
  }

  /**
   * Detects potential memory leaks based on usage patterns
   */
  detectMemoryLeaks(): {
    potentialLeaks: boolean;
    severity: "none" | "low" | "medium" | "high";
    recommendations: string[];
  } {
    const memoryInfo = this.memoryOptimizer.getDetailedMemoryInfo();
    const recommendations: string[] = [];

    // Check if memory trend is increasing
    const isIncreasing = memoryInfo.memoryTrend.trend === "increasing";
    const highMemoryUsage =
      memoryInfo.current.heapUsed > this.optimizationThresholds.memoryUsage;

    let severity: "none" | "low" | "medium" | "high" = "none";
    let potentialLeaks = false;

    if (isIncreasing && highMemoryUsage) {
      potentialLeaks = true;
      severity = "high";
      recommendations.push(
        "Memory usage is increasing and high - potential memory leak detected",
      );
      recommendations.push("Review recent code changes for memory leaks");
      recommendations.push("Consider profiling memory usage");
    } else if (isIncreasing) {
      potentialLeaks = true;
      severity = "medium";
      recommendations.push(
        "Memory usage is increasing - monitor for potential leaks",
      );
    }

    return {
      potentialLeaks,
      severity,
      recommendations,
    };
  }

  /**
   * Updates optimization thresholds
   */
  updateOptimizationThresholds(
    thresholds: Partial<typeof this.optimizationThresholds>,
  ): void {
    Object.assign(this.optimizationThresholds, thresholds);
    this.logger.log("Optimization thresholds updated");
  }

  /**
   * Gets current configuration
   */
  getConfiguration() {
    const self = this;
    return {
      optimizationThresholds: self.optimizationThresholds,
      monitoringIntervals: {
        healthCheck: 60000,
        optimization: 300000,
      },
      historySize: self.maxHistorySize,
    };
  }

  /**
   * Gets performance statistics (alias for getComprehensiveStats)
   */
  getPerformanceStats() {
    return this.getComprehensiveStats();
  }

  /**
   * Gets optimization suggestions based on current performance metrics
   */
  getOptimizationSuggestions(): Array<{
    category: string;
    suggestion: string;
    impact: "low" | "medium" | "high";
    priority: "low" | "medium" | "high";
  }> {
    const suggestions: Array<{
      category: string;
      suggestion: string;
      impact: "low" | "medium" | "high";
      priority: "low" | "medium" | "high";
    }> = [];

    const stats = this.getComprehensiveStats();

    // Memory optimizations
    if (
      stats.memory.current.heapUsed > this.optimizationThresholds.memoryUsage
    ) {
      suggestions.push({
        category: "memory",
        suggestion:
          "Consider implementing object pooling to reduce memory allocations",
        impact: "high",
        priority: "high",
      });
    }

    // Cache optimizations
    if (
      stats.registry.cacheHitRate <
      this.optimizationThresholds.cacheHitRateThreshold
    ) {
      suggestions.push({
        category: "cache",
        suggestion: "Improve cache hit rate by optimizing cache key strategies",
        impact: "medium",
        priority: "medium",
      });
    }

    // Network optimizations
    if (
      stats.network.connectionPool.errorRate >
      this.optimizationThresholds.errorRateThreshold
    ) {
      suggestions.push({
        category: "network",
        suggestion:
          "Reduce network error rate by implementing better retry mechanisms",
        impact: "high",
        priority: "high",
      });
    }

    // Response time optimizations
    if (
      stats.network.connectionPool.averageResponseTime >
      this.optimizationThresholds.responseTimeThreshold
    ) {
      suggestions.push({
        category: "performance",
        suggestion: "Optimize response times by implementing request batching",
        impact: "medium",
        priority: "medium",
      });
    }

    // Default suggestion if everything is optimal
    if (suggestions.length === 0) {
      suggestions.push({
        category: "general",
        suggestion: "System is performing optimally - continue monitoring",
        impact: "low",
        priority: "low",
      });
    }

    return suggestions;
  }

  /**
   * Module cleanup
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log("Performance integration service shutting down...");

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
    }

    this.logger.log("Performance integration service shutdown completed");
  }
}
