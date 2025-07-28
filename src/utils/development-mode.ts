import { Logger } from "@nestjs/common";
import { MergedInngestConfig } from "./config-validation";
import { InngestEvent } from "../interfaces/inngest-event.interface";

/**
 * Development mode configuration
 */
export interface DevelopmentModeConfig {
  /**
   * Enable development mode features
   */
  enabled: boolean;

  /**
   * Enable detailed logging for development
   */
  verboseLogging?: boolean;

  /**
   * Mock external service calls
   */
  mockExternalCalls?: boolean;

  /**
   * Local webhook URL for development
   */
  localWebhookUrl?: string;

  /**
   * Disable signature verification in development
   */
  disableSignatureVerification?: boolean;

  /**
   * Enable function introspection and debugging
   */
  enableIntrospection?: boolean;

  /**
   * Auto-register functions without requiring deployment
   */
  autoRegisterFunctions?: boolean;

  /**
   * Development-specific timeout (longer for debugging)
   */
  developmentTimeout?: number;

  /**
   * Enable step-by-step debugging
   */
  enableStepDebugging?: boolean;
}

/**
 * Development mode utilities and helpers
 */
export class DevelopmentMode {
  private static logger = new Logger(DevelopmentMode.name);
  private static config: DevelopmentModeConfig | undefined;
  private static isInitialized = false;

  /**
   * Reset development mode state (useful for testing)
   */
  static reset(): void {
    this.config = undefined;
    this.isInitialized = false;
  }

  /**
   * Initialize development mode with configuration
   */
  static initialize(config: DevelopmentModeConfig): void {
    this.config = config;
    this.isInitialized = true;

    if (config.enabled) {
      this.logger.log("🚀 Development mode enabled");

      if (config.verboseLogging) {
        this.logger.log("📝 Verbose logging enabled");
      }

      if (config.mockExternalCalls) {
        this.logger.log("🎭 External calls will be mocked");
      }

      if (config.disableSignatureVerification) {
        this.logger.warn("⚠️  Signature verification disabled for development");
      }

      if (config.localWebhookUrl) {
        this.logger.log(`🌐 Local webhook URL: ${config.localWebhookUrl}`);
      }

      if (config.enableIntrospection) {
        this.logger.log("🔍 Function introspection enabled");
      }

      if (config.enableStepDebugging) {
        this.logger.log("🐛 Step debugging enabled");
      }
    }
  }

  /**
   * Check if development mode is enabled
   */
  static isEnabled(): boolean {
    return this.isInitialized && this.config?.enabled === true;
  }

  /**
   * Get development mode configuration
   */
  static getConfig(): DevelopmentModeConfig {
    return this.config || { enabled: false };
  }

  /**
   * Check if verbose logging is enabled
   */
  static isVerboseLoggingEnabled(): boolean {
    return this.isEnabled() && this.config?.verboseLogging === true;
  }

  /**
   * Check if external calls should be mocked
   */
  static shouldMockExternalCalls(): boolean {
    return this.isEnabled() && this.config?.mockExternalCalls === true;
  }

  /**
   * Check if signature verification should be disabled
   */
  static shouldDisableSignatureVerification(): boolean {
    return (
      this.isEnabled() && this.config?.disableSignatureVerification === true
    );
  }

  /**
   * Check if introspection is enabled
   */
  static isIntrospectionEnabled(): boolean {
    return this.isEnabled() && this.config?.enableIntrospection === true;
  }

  /**
   * Check if step debugging is enabled
   */
  static isStepDebuggingEnabled(): boolean {
    return this.isEnabled() && this.config?.enableStepDebugging === true;
  }

  /**
   * Get development timeout or fall back to provided timeout
   */
  static getTimeout(defaultTimeout: number): number {
    if (this.isEnabled() && this.config?.developmentTimeout) {
      return this.config.developmentTimeout;
    }
    return defaultTimeout;
  }

  /**
   * Log development-specific information
   */
  static log(message: string, context?: any): void {
    if (this.isVerboseLoggingEnabled()) {
      if (context) {
        this.logger.debug(`[DEV] ${message}`, context);
      } else {
        this.logger.debug(`[DEV] ${message}`);
      }
    }
  }

  /**
   * Log function execution details in development
   */
  static logFunctionExecution(
    functionId: string,
    runId: string,
    event: InngestEvent,
    phase: "start" | "step" | "complete" | "error",
    details?: any,
  ): void {
    if (!this.isVerboseLoggingEnabled()) return;

    const baseInfo = {
      functionId,
      runId,
      eventName: event.name,
      eventId: event.id,
      phase,
    };

    switch (phase) {
      case "start":
        this.logger.debug(`[DEV] 🚀 Function execution started`, {
          ...baseInfo,
          eventData: event.data,
        });
        break;

      case "step":
        this.logger.debug(`[DEV] 🔄 Step execution`, {
          ...baseInfo,
          stepId: details?.stepId,
          stepType: details?.stepType,
          stepData: details?.data,
        });
        break;

      case "complete":
        this.logger.debug(`[DEV] ✅ Function execution completed`, {
          ...baseInfo,
          result: details?.result,
          duration: details?.duration,
        });
        break;

      case "error":
        this.logger.error(`[DEV] ❌ Function execution failed`, {
          ...baseInfo,
          error: details?.error?.message,
          stack: details?.error?.stack,
        });
        break;
    }
  }

  /**
   * Log step debugging information
   */
  static logStepDebug(
    functionId: string,
    runId: string,
    stepId: string,
    stepType: string,
    data: any,
    result?: any,
    error?: Error,
  ): void {
    if (!this.isStepDebuggingEnabled()) return;

    const logData = {
      functionId,
      runId,
      stepId,
      stepType,
      input: data,
      ...(result && { output: result }),
      ...(error && { error: error.message }),
    };

    if (error) {
      this.logger.error(`[DEV-STEP] ❌ Step failed: ${stepId}`, logData);
    } else {
      this.logger.debug(`[DEV-STEP] 🔧 Step executed: ${stepId}`, logData);
    }
  }

  /**
   * Create development-friendly error messages
   */
  static enhanceErrorForDevelopment(
    error: Error,
    context: {
      functionId?: string;
      runId?: string;
      stepId?: string;
    },
  ): Error {
    if (!this.isEnabled()) return error;

    const devContext = [
      context.functionId && `Function: ${context.functionId}`,
      context.runId && `Run: ${context.runId}`,
      context.stepId && `Step: ${context.stepId}`,
    ]
      .filter(Boolean)
      .join(", ");

    const enhancedMessage = devContext
      ? `${error.message} (${devContext})`
      : error.message;

    const enhancedError = new Error(enhancedMessage);
    enhancedError.stack = error.stack;
    enhancedError.name = error.name;

    return enhancedError;
  }

  /**
   * Create a development webhook URL
   */
  static createDevelopmentWebhookUrl(
    basePath: string = "/api/inngest",
  ): string {
    if (this.config?.localWebhookUrl) {
      return `${this.config.localWebhookUrl}${basePath}`;
    }

    // Default development URL
    return `http://localhost:3000${basePath}`;
  }

  /**
   * Format development configuration for display
   */
  static getConfigSummary(): Record<string, any> {
    if (!this.isEnabled()) {
      return { enabled: false };
    }

    return {
      enabled: true,
      verboseLogging: this.config?.verboseLogging || false,
      mockExternalCalls: this.config?.mockExternalCalls || false,
      disableSignatureVerification:
        this.config?.disableSignatureVerification || false,
      enableIntrospection: this.config?.enableIntrospection || false,
      enableStepDebugging: this.config?.enableStepDebugging || false,
      localWebhookUrl: this.config?.localWebhookUrl || null,
      developmentTimeout: this.config?.developmentTimeout || null,
    };
  }

  /**
   * Detect if running in common development environments
   */
  static detectDevelopmentEnvironment(): Partial<DevelopmentModeConfig> {
    const isDev =
      process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV === "dev" ||
      !process.env.NODE_ENV;

    if (!isDev) {
      return { enabled: false };
    }

    return {
      enabled: true,
      verboseLogging: process.env.INNGEST_DEV_VERBOSE === "true",
      mockExternalCalls: process.env.INNGEST_DEV_MOCK === "true",
      disableSignatureVerification: process.env.INNGEST_DEV_NO_SIG === "true",
      enableIntrospection: process.env.INNGEST_DEV_INTROSPECT === "true",
      enableStepDebugging: process.env.INNGEST_DEV_DEBUG_STEPS === "true",
      localWebhookUrl: process.env.INNGEST_DEV_WEBHOOK_URL,
      developmentTimeout: process.env.INNGEST_DEV_TIMEOUT
        ? parseInt(process.env.INNGEST_DEV_TIMEOUT, 10)
        : undefined,
    };
  }

  /**
   * Apply development mode settings to Inngest configuration
   */
  static applyToConfig(config: MergedInngestConfig): MergedInngestConfig {
    if (!this.isEnabled()) {
      return config;
    }

    const devConfig = { ...config };

    // Apply development timeout
    if (this.config?.developmentTimeout) {
      devConfig.timeout = this.config.developmentTimeout;
    }

    // Apply development-specific settings
    if (this.config?.disableSignatureVerification) {
      // When signature verification is disabled, we need to enable dev mode
      devConfig.isDev = true;
    } else if (config.isDev !== false) {
      // Only override isDev if it wasn't explicitly set to false and we're not forcing it
      devConfig.isDev = true;
    }

    this.log("Applied development configuration", {
      originalTimeout: config.timeout,
      developmentTimeout: devConfig.timeout,
      originalIsDev: config.isDev,
      finalIsDev: devConfig.isDev,
    });

    return devConfig;
  }

  /**
   * Mock external service call in development
   */
  static mockExternalCall<T>(
    serviceName: string,
    methodName: string,
    mockResult: T,
    actualCall: () => Promise<T>,
  ): Promise<T> {
    if (this.shouldMockExternalCalls()) {
      this.log(`Mocking external call: ${serviceName}.${methodName}`, {
        mockResult,
      });
      return Promise.resolve(mockResult);
    }

    return actualCall();
  }
}

/**
 * Default development mode instance
 */
export const developmentMode = DevelopmentMode;
