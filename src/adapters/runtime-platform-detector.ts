import {
  HttpPlatformAdapter,
  HttpPlatformType,
  PlatformDetectionResult,
  HttpAdapterOptions,
} from "./http-platform.interface";
import { ExpressHttpAdapter } from "./express.adapter";
import { FastifyHttpAdapter } from "./fastify.adapter";

export class RuntimePlatformDetector {
  private static readonly PLATFORM_ADAPTERS = new Map<
    HttpPlatformType,
    new (options?: HttpAdapterOptions) => HttpPlatformAdapter
  >([
    ["express", ExpressHttpAdapter],
    ["fastify", FastifyHttpAdapter],
  ]);

  private static detectedPlatform: HttpPlatformType | null = null;
  private static cachedAdapter: HttpPlatformAdapter | null = null;

  /**
   * Detect platform from actual NestJS HTTP adapter instance
   * This is more reliable than checking package.json dependencies
   */
  static detectFromNestApp(app: any): HttpPlatformType {
    try {
      // Check if it's a NestJS application
      if (!app?.getHttpAdapter) {
        return "express"; // fallback
      }

      const httpAdapter = app.getHttpAdapter();

      // Check the constructor name or instance type
      const adapterName = httpAdapter.constructor.name;
      const adapterType = httpAdapter.getType?.();

      // NestJS Fastify adapter
      if (adapterName === "FastifyAdapter" || adapterType === "fastify") {
        return "fastify";
      }

      // NestJS Express adapter (default)
      if (adapterName === "ExpressAdapter" || adapterType === "express") {
        return "express";
      }

      // Check the underlying instance
      const instance = httpAdapter.getInstance();
      if (instance) {
        // Fastify instance has specific properties
        if (
          instance.server &&
          instance.addContentTypeParser &&
          instance.register
        ) {
          return "fastify";
        }

        // Express instance has different properties
        if (
          instance.use &&
          instance.get &&
          instance.post &&
          !instance.register
        ) {
          return "express";
        }
      }

      // Fallback to express
      return "express";
    } catch (error) {
      console.warn("Failed to detect HTTP platform from NestJS app:", error);
      return "express";
    }
  }

  /**
   * Detect platform from request object at runtime
   * This is used when we don't have access to the NestJS app instance
   */
  static detectFromRequest(req: any): HttpPlatformType {
    if (!req) {
      return "express";
    }

    // Fastify request characteristics
    if (
      req.raw &&
      typeof req.raw === "object" &&
      req.server &&
      typeof req.server === "object" &&
      !req.res
    ) {
      return "fastify";
    }

    // Express request characteristics
    if (
      req.res &&
      typeof req.res === "object" &&
      req.app &&
      typeof req.app === "object"
    ) {
      return "express";
    }

    // Additional checks for edge cases
    if (req.routerPath !== undefined || req.routeOptions) {
      return "fastify";
    }

    if (req.baseUrl !== undefined || req.originalUrl !== undefined) {
      return "express";
    }

    // Default fallback
    return "express";
  }

  /**
   * Get platform adapter with caching for better performance
   */
  static getPlatformAdapter(
    platform?: HttpPlatformType,
    options?: HttpAdapterOptions,
  ): HttpPlatformAdapter {
    // Use provided platform or detect from runtime
    const targetPlatform = platform || this.detectedPlatform || "express";

    // Return cached adapter if same platform and no options
    if (
      this.cachedAdapter &&
      this.detectedPlatform === targetPlatform &&
      !options
    ) {
      return this.cachedAdapter;
    }

    const AdapterClass = this.PLATFORM_ADAPTERS.get(targetPlatform);
    if (!AdapterClass) {
      throw new Error(`Unsupported HTTP platform: ${targetPlatform}`);
    }

    const adapter = new AdapterClass(options);

    // Cache the adapter for future use
    if (!options) {
      this.cachedAdapter = adapter;
      this.detectedPlatform = targetPlatform;
    }

    return adapter;
  }

  /**
   * Create adapter from request object - most reliable method
   */
  static createAdapterFromRequest(
    req: any,
    options?: HttpAdapterOptions,
  ): HttpPlatformAdapter {
    const platform = this.detectFromRequest(req);
    return this.getPlatformAdapter(platform, options);
  }

  /**
   * Set detected platform manually (useful for testing or explicit configuration)
   */
  static setPlatform(platform: HttpPlatformType): void {
    this.detectedPlatform = platform;
    this.cachedAdapter = null; // Clear cache
  }

  /**
   * Clear detection cache (useful for testing)
   */
  static clearCache(): void {
    this.detectedPlatform = null;
    this.cachedAdapter = null;
  }

  /**
   * Get all available platforms (checks actual package availability)
   */
  static getAvailablePlatforms(): PlatformDetectionResult[] {
    return Array.from(this.PLATFORM_ADAPTERS.keys()).map((platform) => ({
      platform,
      adapter: this.PLATFORM_ADAPTERS.get(platform)!,
      available: this.isPlatformAvailable(platform),
    }));
  }

  private static isPlatformAvailable(platform: HttpPlatformType): boolean {
    try {
      switch (platform) {
        case "express":
          require.resolve("@nestjs/platform-express");
          return true;
        case "fastify":
          require.resolve("@nestjs/platform-fastify");
          return true;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }
}

/**
 * Singleton instance for global platform detection
 */
export const runtimePlatformDetector = new RuntimePlatformDetector();
