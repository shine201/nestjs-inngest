import { InngestModuleConfig } from "../interfaces/inngest-config.interface";

/**
 * Configuration defaults and smart defaults system
 */
export class InngestConfigDefaults {
  /**
   * Applies smart defaults to user configuration
   */
  static applyDefaults(
    userConfig: Partial<InngestModuleConfig>,
  ): InngestModuleConfig {
    // Determine environment
    const isDev = userConfig.isDev ?? process.env.NODE_ENV === "development";

    const defaults: InngestModuleConfig = {
      // Required fields (must be provided by user)
      appId: userConfig.appId!,

      // Optional core fields
      signingKey: userConfig.signingKey,
      eventKey: userConfig.eventKey,

      // Simple defaults
      isDev,

      // Standard defaults
      endpoint: userConfig.endpoint ?? "/api/inngest",
      logger: userConfig.logger ?? true,
      timeout: userConfig.timeout ?? 30000,
      maxBatchSize: userConfig.maxBatchSize ?? 100,
      strict: userConfig.strict ?? false,
      enableConnect: userConfig.enableConnect ?? false,

      // Environment defaults
      env: userConfig.env ?? (isDev ? "development" : "production"),

      // Retry defaults
      retry: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoff: "exponential" as const,
        backoffMultiplier: 2,
        ...userConfig.retry,
      },

      // Apply all user overrides last (this ensures user config takes precedence)
      ...userConfig,
    };

    return defaults;
  }

  // Simplified - removed complex connection method logic

  /**
   * Validates that required configuration is provided
   */
  static validateRequiredConfig(config: Partial<InngestModuleConfig>): void {
    if (!config.appId) {
      throw new Error("InngestModuleConfig.appId is required");
    }

    // Warn about missing keys in development
    if (config.isDev !== false && process.env.NODE_ENV === "development") {
      if (!config.signingKey) {
        console.warn("⚠️ InngestModuleConfig.signingKey is not set.");
      }

      if (!config.eventKey) {
        console.warn(
          "⚠️ InngestModuleConfig.eventKey is not set. Event sending will be disabled.",
        );
      }
    }
  }

  /**
   * Gets a summary of the applied configuration for logging
   */
  static getConfigSummary(config: InngestModuleConfig): string {
    const features = [];

    // Additional features
    if (config.isDev) features.push("dev-mode");
    if (config.strict) features.push("strict");
    if (!config.logger) features.push("silent");

    return `Inngest[${config.appId}]: ${features.join(", ")}`;
  }
}
