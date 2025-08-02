import { ModuleMetadata, Type } from "@nestjs/common";
import { DevelopmentModeConfig } from "../utils/development-mode";

/**
 * Environment configuration for Inngest
 */
export type InngestEnvironment = "production" | "development" | "test";

// Simplified - removed complex connection method types

/**
 * Retry configuration for event sending
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   */
  maxAttempts: number;

  /**
   * Initial delay between retries in milliseconds
   */
  initialDelay: number;

  /**
   * Maximum delay between retries in milliseconds
   */
  maxDelay?: number;

  /**
   * Backoff strategy
   */
  backoff?: "exponential" | "linear" | "fixed";

  /**
   * Backoff multiplier for exponential backoff
   */
  backoffMultiplier?: number;
}

/**
 * Factory function for creating Inngest configuration
 */
export interface InngestConfigFactory {
  createInngestConfig(): Promise<InngestModuleConfig> | InngestModuleConfig;
}

/**
 * Options for asynchronous configuration
 */
export interface InngestModuleAsyncOptions
  extends Pick<ModuleMetadata, "imports"> {
  /**
   * Injection token for the configuration
   */
  inject?: any[];

  /**
   * Factory function to create the configuration
   */
  useFactory?: (
    ...args: any[]
  ) => Promise<InngestModuleConfig> | InngestModuleConfig;

  /**
   * Class to use for configuration
   */
  useClass?: Type<InngestConfigFactory>;

  /**
   * Existing provider to use for configuration
   */
  useExisting?: Type<InngestConfigFactory>;
}

/**
 * Configuration interface for the Inngest module
 */
export interface InngestModuleConfig {
  /**
   * The unique identifier for your Inngest app
   */
  appId: string;

  /**
   * Event key for sending events to Inngest (optional for webhook-only usage)
   */
  eventKey?: string;

  /**
   * Signing key for webhook signature verification
   */
  signingKey?: string;

  /**
   * Base URL for Inngest API (defaults to Inngest cloud)
   */
  baseUrl?: string;

  /**
   * HTTP endpoint path for receiving webhooks (defaults to '/api/inngest')
   */
  endpoint?: string;

  /**
   * Enable development mode (defaults to false)
   */
  isDev?: boolean;

  /**
   * Enable Connect mode (defaults to false)
   */
  enableConnect?: boolean;

  /**
   * Enable logging (defaults to true)
   */
  logger?: boolean;

  /**
   * Environment setting
   */
  env?: InngestEnvironment;

  /**
   * Request timeout in milliseconds (defaults to 30000)
   */
  timeout?: number;

  /**
   * Retry configuration for event sending
   */
  retry?: Partial<RetryConfig>;

  /**
   * Maximum batch size for bulk event sending (defaults to 100)
   */
  maxBatchSize?: number;

  /**
   * Enable strict mode for enhanced validation (defaults to false)
   */
  strict?: boolean;

  /**
   * Development mode configuration
   */
  development?: DevelopmentModeConfig;

  // Simplified - removed complex connection method configuration
}

/**
 * Factory interface for creating Inngest module configuration
 */
export interface InngestModuleConfigFactory {
  createInngestConfig(): Promise<InngestModuleConfig> | InngestModuleConfig;
}

/**
 * Async configuration options for the Inngest module
 */
export interface InngestModuleAsyncConfig
  extends Pick<ModuleMetadata, "imports"> {
  /**
   * Factory function to create the configuration
   */
  useFactory?: (
    ...args: any[]
  ) => Promise<InngestModuleConfig> | InngestModuleConfig;

  /**
   * Class to use as a factory for creating the configuration
   */
  useClass?: Type<InngestModuleConfigFactory>;

  /**
   * Existing provider to use as a factory
   */
  useExisting?: Type<InngestModuleConfigFactory>;

  /**
   * Dependencies to inject into the factory function
   */
  inject?: any[];
}
