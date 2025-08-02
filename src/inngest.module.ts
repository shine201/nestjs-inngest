import "reflect-metadata";
import { DynamicModule, Global, Module, Provider } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";

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
import { INNGEST_CONFIG } from "./constants";
import { ExecutionContextService } from "./services";

/**
 * Main module for Inngest integration with NestJS
 *
 * This module provides all the necessary services and controllers
 * to integrate Inngest with a NestJS application.
 */
@Global()
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

    return {
      module: InngestModule,
      imports: [DiscoveryModule],
      providers: [
        configProvider,
        InngestService,
        FunctionRegistry,
        ExecutionContextService,
      ],
      exports: [
        InngestService,
        FunctionRegistry,
        ExecutionContextService,
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
    // Simplified - no controller needed

    return {
      module: InngestModule,
      imports: [DiscoveryModule, ...(options.imports || [])],
      providers: [
        ...this.createAsyncProviders(options),
        // Removed controller and HTTP platform adapter - using direct serve middleware
        InngestService,
        FunctionRegistry,
        ExecutionContextService,
      ],
      exports: [
        InngestService,
        FunctionRegistry,
        ExecutionContextService,
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
            const detectedDevConfig =
              DevelopmentMode.detectDevelopmentEnvironment();
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

        return finalConfig;
      },
      inject: [options.useClass || options.useExisting!],
    };
  }

  // Simplified - removed complex platform adapter and controller logic
}
