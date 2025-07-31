import "reflect-metadata"
import { DynamicModule, Module, Provider } from "@nestjs/common";
import { DiscoveryModule, DiscoveryService, ModulesContainer, MetadataScanner, ModuleRef } from "@nestjs/core";

import {
  InngestModuleConfig,
  InngestModuleAsyncOptions,
  InngestConfigFactory,
} from "./interfaces/inngest-config.interface";
import { validateAndMergeConfig } from "./utils/config-validation";
import {
  DevelopmentMode,
  DevelopmentModeConfig,
} from "./utils/development-mode";
import { InngestService } from "./services/inngest.service";
import { FunctionRegistry } from "./services/function-registry.service";
import { ExecutionContextService } from "./services/execution-context.service";
import { ScopeManagerService } from "./services/scope-manager.service";
import { SignatureVerificationService } from "./services/signature-verification.service";
import { InngestController } from "./controllers/inngest.controller";
import { INNGEST_CONFIG } from "./constants";
import { PlatformDetector } from "./adapters/platform-detector";
import {
  HttpPlatformAdapter,
  HttpPlatformType,
} from "./adapters/http-platform.interface";

/**
 * Main module for Inngest integration with NestJS
 *
 * This module provides all the necessary services and controllers
 * to integrate Inngest with a NestJS application.
 */
@Module({})
export class InngestModule {
  /**
   * Creates a dynamic module with synchronous configuration
   *
   * @param config - The Inngest module configuration
   * @returns A configured dynamic module
   */
  static forRoot(config: InngestModuleConfig): DynamicModule {
    // Validate and merge configuration with defaults
    const { config: mergedConfig, validation } = validateAndMergeConfig(config);

    // Throw error if validation fails
    if (!validation.isValid) {
      throw validation.errors[0];
    }

    // Initialize development mode if configuration is provided
    if (config.development) {
      const devConfig: DevelopmentModeConfig = {
        ...config.development,
        enabled: config.development.enabled ?? false,
      };
      DevelopmentMode.initialize(devConfig);
    } else {
      // Auto-detect development environment
      const detectedDevConfig = DevelopmentMode.detectDevelopmentEnvironment();
      if (detectedDevConfig.enabled) {
        const fullDevConfig: DevelopmentModeConfig = {
          ...detectedDevConfig,
          enabled: detectedDevConfig.enabled ?? false,
        };
        DevelopmentMode.initialize(fullDevConfig);
      }
    }

    // Apply development mode settings to configuration
    const finalConfig = DevelopmentMode.applyToConfig(mergedConfig);

    // Create configuration provider
    const configProvider: Provider = {
      provide: INNGEST_CONFIG,
      useValue: finalConfig,
    };

    // Create HTTP platform adapter provider
    const httpAdapterProvider: Provider = this.createHttpAdapterProvider(
      config.httpPlatform,
    );

    // Determine if we should include the serve controller
    const shouldUseServe = this.shouldEnableServeMode(finalConfig);
    const shouldUseController = shouldUseServe && this.shouldUseControllerMode(finalConfig);
    const controllers = shouldUseController ? [InngestController] : [];
    
    console.log(`🔧 Module setup: connectionMethod=${finalConfig.connectionMethod}, serveMode=${finalConfig.serveMode}, shouldUseController=${shouldUseController}, controllers=${controllers.length}`);
    
    if (shouldUseController) {
      // Set the controller path dynamically using metadata
      Reflect.defineMetadata("path", finalConfig.endpoint, InngestController);
      console.log(`🛣️ Controller path set to: ${finalConfig.endpoint}`);
    }

    return {
      module: InngestModule,
      imports: [DiscoveryModule],
      controllers,
      providers: [
        configProvider,
        httpAdapterProvider,
        InngestService,
        FunctionRegistry,
        ExecutionContextService,
        ScopeManagerService,
        SignatureVerificationService,
      ],
      exports: [
        InngestService,
        FunctionRegistry,
        ExecutionContextService,
        ScopeManagerService,
        SignatureVerificationService,
        INNGEST_CONFIG,
      ],
      global: false,
    };
  }

  /**
   * Creates a global dynamic module with synchronous configuration
   *
   * @param config - The Inngest module configuration
   * @returns A configured global dynamic module
   */
  static forRootGlobal(config: InngestModuleConfig): DynamicModule {
    const module = this.forRoot(config);
    return {
      ...module,
      global: true,
    };
  }

  /**
   * Creates a dynamic module with asynchronous configuration
   *
   * @param options - The async configuration options
   * @returns A configured dynamic module
   */
  static forRootAsync(options: InngestModuleAsyncOptions): DynamicModule {
    // Create a dynamic controller class that will be configured at runtime
    const DynamicInngestController = class extends InngestController {};

    return {
      module: InngestModule,
      imports: [DiscoveryModule, ...(options.imports || [])],
      controllers: [DynamicInngestController],
      providers: [
        ...this.createAsyncProviders(options),
        {
          provide: InngestController,
          useClass: DynamicInngestController,
        },
        {
          provide: "HTTP_PLATFORM_ADAPTER",
          useValue: {
            // Runtime adapter that detects platform per request
            extractRequest: (req: any) => {
              const adapter = PlatformDetector.createAdapterFromRequest(req);
              return adapter.extractRequest(req);
            },
            wrapResponse: (res: any) => {
              // Use Express as default for response wrapping when no request context
              const adapter = PlatformDetector.getPlatformAdapter("express");
              return adapter.wrapResponse(res);
            },
            getRawBody: (req: any) => {
              const adapter = PlatformDetector.createAdapterFromRequest(req);
              return adapter.getRawBody(req);
            },
            getPlatformName: () => {
              // Return the cached platform name or 'auto' if not detected yet
              return PlatformDetector.getCachedPlatform() || "auto";
            },
            isCompatible: (req: any) => {
              const adapter = PlatformDetector.createAdapterFromRequest(req);
              return adapter.isCompatible(req);
            },
          },
        },
        InngestService,
        FunctionRegistry,
        ExecutionContextService,
        ScopeManagerService,
        SignatureVerificationService,
      ],
      exports: [
        InngestService,
        FunctionRegistry,
        ExecutionContextService,
        ScopeManagerService,
        SignatureVerificationService,
        INNGEST_CONFIG,
      ],
      global: false,
    };
  }

  /**
   * Creates a global dynamic module with asynchronous configuration
   *
   * @param options - The async configuration options
   * @returns A configured global dynamic module
   */
  static forRootAsyncGlobal(options: InngestModuleAsyncOptions): DynamicModule {
    const module = this.forRootAsync(options);
    return {
      ...module,
      global: true,
    };
  }

  /**
   * Creates providers for asynchronous configuration
   */
  private static createAsyncProviders(
    options: InngestModuleAsyncOptions,
  ): Provider[] {
    if (options.useFactory) {
      return [this.createAsyncConfigProvider(options)];
    }

    const providers: Provider[] = [this.createAsyncConfigProvider(options)];

    if (options.useClass) {
      providers.push({
        provide: options.useClass,
        useClass: options.useClass,
      });
    }

    return providers;
  }

  /**
   * Creates the async configuration provider
   */
  private static createAsyncConfigProvider(
    options: InngestModuleAsyncOptions,
  ): Provider {
    if (options.useFactory) {
      return {
        provide: INNGEST_CONFIG,
        useFactory: async (...args: any[]) => {
          const config = await options.useFactory!(...args);
          const { config: mergedConfig, validation } =
            validateAndMergeConfig(config);

          if (!validation.isValid) {
            throw validation.errors[0];
          }

          // Initialize development mode if configuration is provided
          if (config.development) {
            const devConfig: DevelopmentModeConfig = {
              ...config.development,
              enabled: config.development.enabled ?? false,
            };
            DevelopmentMode.initialize(devConfig);
          } else {
            // Auto-detect development environment
            const detectedDevConfig = DevelopmentMode.detectDevelopmentEnvironment();
            if (detectedDevConfig.enabled) {
              const fullDevConfig: DevelopmentModeConfig = {
                ...detectedDevConfig,
                enabled: detectedDevConfig.enabled ?? false,
              };
              DevelopmentMode.initialize(fullDevConfig);
            }
          }

          // Apply development mode settings to configuration
          const finalConfig = DevelopmentMode.applyToConfig(mergedConfig);

          // Set the controller path dynamically using metadata
          Reflect.defineMetadata(
            "path",
            finalConfig.endpoint,
            InngestController,
          );

          return finalConfig;
        },
        inject: options.inject || [],
      };
    }

    return {
      provide: INNGEST_CONFIG,
      useFactory: async (configFactory: InngestConfigFactory) => {
        const config = await configFactory.createInngestConfig();
        const { config: mergedConfig, validation } =
          validateAndMergeConfig(config);

        if (!validation.isValid) {
          throw validation.errors[0];
        }

        // Apply development mode settings to configuration
        const finalConfig = DevelopmentMode.applyToConfig(mergedConfig);

        // Set the controller path dynamically using metadata
        Reflect.defineMetadata("path", finalConfig.endpoint, InngestController);

        return finalConfig;
      },
      inject: [options.useClass || options.useExisting!],
    };
  }

  /**
   * Creates HTTP platform adapter provider
   */
  private static createHttpAdapterProvider(
    platformType?: HttpPlatformType,
  ): Provider {
    return {
      provide: "HTTP_PLATFORM_ADAPTER",
      useFactory: (): HttpPlatformAdapter => {
        if (platformType && platformType !== "auto") {
          return PlatformDetector.getPlatformAdapter(platformType);
        }

        // Auto-detect platform
        const detection = PlatformDetector.detectPlatform();
        return new detection.adapter();
      },
    };
  }

  /**
   * Determines if serve mode should be enabled based on connection method
   */
  private static shouldEnableServeMode(config: any): boolean {
    const method = config.connectionMethod || "auto";
    
    switch (method) {
      case "connect": return false;
      case "serve": return true;
      case "both": return true;
      case "auto": return !config.isDev;
      default: return !config.isDev;
    }
  }

  /**
   * Determines if controller-based serve mode should be used
   */
  private static shouldUseControllerMode(config: any): boolean {
    const serveMode = config.serveMode || "controller";
    return serveMode === "controller";
  }
}
