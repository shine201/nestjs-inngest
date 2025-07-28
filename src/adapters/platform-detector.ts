import {
  HttpPlatformAdapter,
  HttpPlatformType,
  PlatformDetectionResult,
  HttpAdapterOptions,
} from "./http-platform.interface";
import { ExpressHttpAdapter } from "./express.adapter";
import { FastifyHttpAdapter } from "./fastify.adapter";

export class PlatformDetector {
  private static readonly PLATFORM_ADAPTERS = new Map<
    HttpPlatformType,
    new (options?: HttpAdapterOptions) => HttpPlatformAdapter
  >([
    ["express", ExpressHttpAdapter],
    ["fastify", FastifyHttpAdapter],
  ]);

  /**
   * @deprecated Use detectFromRequest() instead for accurate runtime detection
   * This method only checks package availability, not actual usage
   */
  static detectPlatform(): PlatformDetectionResult {
    console.warn(
      "PlatformDetector.detectPlatform() is deprecated. Use detectFromRequest() for accurate runtime detection.",
    );

    // Just return Express as safe default since we can't reliably detect at module init time
    return {
      platform: "express",
      adapter: ExpressHttpAdapter,
      available: this.isExpressAvailable(),
    };
  }

  /**
   * Get specific platform adapter
   */
  static getPlatformAdapter(
    platform: HttpPlatformType,
    options?: HttpAdapterOptions,
  ): HttpPlatformAdapter {
    const AdapterClass = this.PLATFORM_ADAPTERS.get(platform);
    if (!AdapterClass) {
      throw new Error(`Unsupported HTTP platform: ${platform}`);
    }

    return new AdapterClass(options);
  }

  /**
   * Detect platform from request object at runtime - most reliable method
   */
  static detectFromRequest(req: any): HttpPlatformType {
    if (!req) {
      return "express";
    }

    // Fastify request characteristics (more specific checks first)
    if (
      req.raw &&
      typeof req.raw === "object" &&
      typeof req.server === "object" &&
      req.res === undefined
    ) {
      // Fastify requests don't have 'res' property
      return "fastify";
    }

    // Express request characteristics
    if (req.res && typeof req.res === "object" && typeof req.app === "object") {
      return "express";
    }

    // Additional Fastify-specific properties
    if (req.routeOptions !== undefined || req.routeConfig !== undefined) {
      return "fastify";
    }

    // Additional Express-specific properties
    if (req.baseUrl !== undefined || req.originalUrl !== undefined) {
      return "express";
    }

    // Fallback: use adapter compatibility check
    const adapters = Array.from(this.PLATFORM_ADAPTERS.entries());
    for (const [platform, AdapterClass] of adapters) {
      const adapter = new AdapterClass();
      if (adapter.isCompatible(req)) {
        return platform;
      }
    }

    // Safe default
    return "express";
  }

  private static cachedAdapter: HttpPlatformAdapter | null = null;
  private static cachedPlatform: HttpPlatformType | null = null;

  /**
   * Get the cached platform type (for debugging/logging)
   */
  static getCachedPlatform(): HttpPlatformType | null {
    return this.cachedPlatform;
  }

  /**
   * Create adapter based on request object with caching for performance
   */
  static createAdapterFromRequest(
    req: any,
    options?: HttpAdapterOptions,
  ): HttpPlatformAdapter {
    const platform = this.detectFromRequest(req);

    // Use cached adapter if same platform and no custom options
    if (this.cachedAdapter && this.cachedPlatform === platform && !options) {
      return this.cachedAdapter;
    }

    const adapter = this.getPlatformAdapter(platform, options);

    // Cache for future use (only if no custom options)
    if (!options) {
      this.cachedAdapter = adapter;
      this.cachedPlatform = platform;
    }

    return adapter;
  }

  private static isFastifyAvailable(): boolean {
    try {
      // Check for @nestjs/platform-fastify
      require.resolve("@nestjs/platform-fastify");
      return true;
    } catch {
      // Check for fastify directly
      try {
        require.resolve("fastify");
        return true;
      } catch {
        return false;
      }
    }
  }

  private static isExpressAvailable(): boolean {
    try {
      // Check for @nestjs/platform-express
      require.resolve("@nestjs/platform-express");
      return true;
    } catch {
      // Check for express directly
      try {
        require.resolve("express");
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Get all available platforms
   */
  static getAvailablePlatforms(): PlatformDetectionResult[] {
    return Array.from(this.PLATFORM_ADAPTERS.keys()).map((platform) => ({
      platform,
      adapter: this.PLATFORM_ADAPTERS.get(platform)!,
      available: this.isPlatformAvailable(platform),
    }));
  }

  private static isPlatformAvailable(platform: HttpPlatformType): boolean {
    switch (platform) {
      case "express":
        return this.isExpressAvailable();
      case "fastify":
        return this.isFastifyAvailable();
      default:
        return false;
    }
  }
}

/**
 * Singleton instance for global platform detection
 */
export const platformDetector = new PlatformDetector();
