import { InngestModuleConfig, InngestConnectionMethod, InngestServeMode } from "../interfaces/inngest-config.interface";

/**
 * Configuration defaults and smart defaults system
 */
export class InngestConfigDefaults {
  /**
   * Applies smart defaults to user configuration
   */
  static applyDefaults(userConfig: Partial<InngestModuleConfig>): InngestModuleConfig {
    // Determine environment
    const isDev = userConfig.isDev ?? process.env.NODE_ENV === 'development';
    
    // Smart defaults based on environment and user preferences
    const connectionMethod = this.getDefaultConnectionMethod(userConfig, isDev);
    const serveMode = this.getDefaultServeMode(userConfig, connectionMethod);
    
    const defaults: InngestModuleConfig = {
      // Required fields (must be provided by user)
      appId: userConfig.appId!,
      
      // Optional core fields
      signingKey: userConfig.signingKey,
      eventKey: userConfig.eventKey,
      
      // Smart defaults
      connectionMethod,
      serveMode,
      isDev,
      
      // Standard defaults
      endpoint: userConfig.endpoint ?? '/api/inngest',
      logger: userConfig.logger ?? true,
      timeout: userConfig.timeout ?? 30000,
      maxBatchSize: userConfig.maxBatchSize ?? 100,
      strict: userConfig.strict ?? false,
      
      // Environment defaults
      env: userConfig.env ?? (isDev ? 'development' : 'production'),
      
      // Retry defaults
      retry: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoff: 'exponential' as const,
        backoffMultiplier: 2,
        ...userConfig.retry,
      },
      
      // Apply all user overrides last (this ensures user config takes precedence)
      ...userConfig,
    };
    
    return defaults;
  }
  
  /**
   * Determines the default connection method based on environment and user preferences
   */
  private static getDefaultConnectionMethod(
    userConfig: Partial<InngestModuleConfig>, 
    isDev: boolean
  ): InngestConnectionMethod {
    // If user specified, use their preference
    if (userConfig.connectionMethod) {
      return userConfig.connectionMethod;
    }
    
    // Smart defaults based on environment
    if (isDev) {
      // Development: prefer both for maximum compatibility with dev server
      return 'both';
    } else {
      // Production: prefer connect for better performance and reliability
      return 'connect';
    }
  }
  
  /**
   * Determines the default serve mode based on connection method
   */
  private static getDefaultServeMode(
    userConfig: Partial<InngestModuleConfig>,
    connectionMethod: InngestConnectionMethod
  ): InngestServeMode {
    // If user specified, use their preference
    if (userConfig.serveMode) {
      return userConfig.serveMode;
    }
    
    // Only matters if serve is enabled
    if (connectionMethod === 'serve' || connectionMethod === 'both' || connectionMethod === 'auto') {
      // Default to controller mode for better NestJS integration
      return 'controller';
    }
    
    // Fallback (though this shouldn't be used if serve is disabled)
    return 'controller';
  }
  
  /**
   * Validates that required configuration is provided
   */
  static validateRequiredConfig(config: Partial<InngestModuleConfig>): void {
    if (!config.appId) {
      throw new Error('InngestModuleConfig.appId is required');
    }
    
    // Warn about missing keys in development
    if (config.isDev !== false && process.env.NODE_ENV === 'development') {
      if (!config.signingKey) {
        console.warn('⚠️ InngestModuleConfig.signingKey is not set. Webhook signature verification will be disabled.');
      }
      
      if (!config.eventKey) {
        console.warn('⚠️ InngestModuleConfig.eventKey is not set. Event sending will be disabled.');
      }
    }
  }
  
  /**
   * Gets a summary of the applied configuration for logging
   */
  static getConfigSummary(config: InngestModuleConfig): string {
    const features = [];
    
    // Connection features
    if (config.connectionMethod === 'both') {
      features.push(`connect + serve(${config.serveMode})`);
    } else if (config.connectionMethod === 'serve') {
      features.push(`serve(${config.serveMode})`);
    } else {
      features.push(config.connectionMethod || 'auto');
    }
    
    // Additional features
    if (config.isDev) features.push('dev-mode');
    if (config.strict) features.push('strict');
    if (!config.logger) features.push('silent');
    
    return `Inngest[${config.appId}]: ${features.join(', ')}`;
  }
}