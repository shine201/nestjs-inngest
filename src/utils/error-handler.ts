import { Logger } from "@nestjs/common";
import {
  InngestError,
  InngestRuntimeError,
  InngestTimeoutError,
  InngestRetryError,
  InngestScopeError,
  InngestStepError,
  InngestValidationError,
  InngestServiceError,
  InngestEventError,
  InngestWebhookError,
  InngestFunctionError,
  InngestConfigError,
} from "../errors";

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

/**
 * Error handling strategy options
 */
export interface ErrorHandlingOptions {
  /**
   * Whether to retry the operation
   */
  retry?: boolean;

  /**
   * Maximum number of retries
   */
  maxRetries?: number;

  /**
   * Delay between retries in milliseconds
   */
  retryDelay?: number;

  /**
   * Whether to log the error
   */
  log?: boolean;

  /**
   * Log level for the error
   */
  logLevel?: "error" | "warn" | "debug";

  /**
   * Whether to notify external systems
   */
  notify?: boolean;

  /**
   * Additional context to include in logs/notifications
   */
  context?: Record<string, any>;

  /**
   * Whether to rethrow the error after handling
   */
  rethrow?: boolean;
}

/**
 * Error classification result
 */
export interface ErrorClassification {
  /**
   * Error severity level
   */
  severity: ErrorSeverity;

  /**
   * Whether the error is retryable
   */
  retryable: boolean;

  /**
   * Suggested handling strategy
   */
  strategy: ErrorHandlingOptions;

  /**
   * Error category for monitoring
   */
  category: string;

  /**
   * User-friendly error message
   */
  userMessage?: string;
}

/**
 * Error handler class for processing and managing errors
 */
export class ErrorHandler {
  private readonly logger = new Logger(ErrorHandler.name);

  /**
   * Classify an error and determine handling strategy
   */
  classifyError(error: Error | InngestError): ErrorClassification {
    if (error instanceof InngestError) {
      return this.classifyInngestError(error);
    }

    // Handle standard JavaScript errors
    return this.classifyStandardError(error);
  }

  /**
   * Handle an error according to its classification
   */
  async handleError(
    error: Error | InngestError,
    customOptions?: Partial<ErrorHandlingOptions>,
  ): Promise<void> {
    const classification = this.classifyError(error);
    const options = { ...classification.strategy, ...customOptions };

    // Log the error if requested
    if (options.log !== false) {
      this.logError(error, classification, options);
    }

    // Notify external systems if requested
    if (options.notify) {
      await this.notifyError(error, classification, options);
    }

    // Rethrow if requested
    if (options.rethrow !== false) {
      throw error;
    }
  }

  /**
   * Create a wrapped error with additional context
   */
  wrapError(
    originalError: Error,
    message: string,
    context?: Record<string, any>,
  ): InngestRuntimeError {
    return new InngestRuntimeError(
      message,
      context?.functionId,
      context?.runId,
      originalError,
    );
  }

  /**
   * Check if an error is retryable
   */
  isRetryable(error: Error | InngestError): boolean {
    const classification = this.classifyError(error);
    return classification.retryable;
  }

  /**
   * Get error severity
   */
  getSeverity(error: Error | InngestError): ErrorSeverity {
    const classification = this.classifyError(error);
    return classification.severity;
  }

  /**
   * Classify Inngest-specific errors
   */
  private classifyInngestError(error: InngestError): ErrorClassification {
    switch (error.code) {
      case "INNGEST_CONFIG_ERROR":
        return {
          severity: ErrorSeverity.CRITICAL,
          retryable: false,
          category: "configuration",
          strategy: {
            retry: false,
            log: true,
            logLevel: "error",
            notify: true,
            rethrow: true,
          },
          userMessage:
            "Configuration error occurred. Please check your Inngest configuration.",
        };

      case "INNGEST_FUNCTION_ERROR":
        return {
          severity: ErrorSeverity.HIGH,
          retryable: false,
          category: "function_registration",
          strategy: {
            retry: false,
            log: true,
            logLevel: "error",
            notify: true,
            rethrow: true,
          },
          userMessage:
            "Function registration error. Please check your function definitions.",
        };

      case "INNGEST_EVENT_ERROR":
        return {
          severity: ErrorSeverity.MEDIUM,
          retryable: true,
          category: "event_processing",
          strategy: {
            retry: true,
            maxRetries: 3,
            retryDelay: 1000,
            log: true,
            logLevel: "warn",
            notify: false,
            rethrow: false,
          },
          userMessage: "Event processing error. The operation will be retried.",
        };

      case "INNGEST_WEBHOOK_ERROR":
        return {
          severity: ErrorSeverity.MEDIUM,
          retryable: true,
          category: "webhook",
          strategy: {
            retry: true,
            maxRetries: 2,
            retryDelay: 500,
            log: true,
            logLevel: "warn",
            notify: false,
            rethrow: true,
          },
          userMessage: "Webhook processing error.",
        };

      case "INNGEST_RUNTIME_ERROR":
        return {
          severity: ErrorSeverity.HIGH,
          retryable: true,
          category: "runtime",
          strategy: {
            retry: true,
            maxRetries: 2,
            retryDelay: 2000,
            log: true,
            logLevel: "error",
            notify: true,
            rethrow: true,
          },
          userMessage: "Function execution error occurred.",
        };

      case "INNGEST_TIMEOUT_ERROR":
        return {
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          category: "timeout",
          strategy: {
            retry: false,
            log: true,
            logLevel: "warn",
            notify: true,
            rethrow: true,
          },
          userMessage: "Function execution timed out.",
        };

      case "INNGEST_RETRY_ERROR":
        return {
          severity: ErrorSeverity.HIGH,
          retryable: false,
          category: "retry_exhausted",
          strategy: {
            retry: false,
            log: true,
            logLevel: "error",
            notify: true,
            rethrow: true,
          },
          userMessage: "Maximum retry attempts exceeded.",
        };

      case "INNGEST_SCOPE_ERROR":
        return {
          severity: ErrorSeverity.HIGH,
          retryable: false,
          category: "dependency_injection",
          strategy: {
            retry: false,
            log: true,
            logLevel: "error",
            notify: true,
            rethrow: true,
          },
          userMessage: "Dependency injection error occurred.",
        };

      case "INNGEST_STEP_ERROR":
        return {
          severity: ErrorSeverity.MEDIUM,
          retryable: true,
          category: "step_execution",
          strategy: {
            retry: true,
            maxRetries: 3,
            retryDelay: 1000,
            log: true,
            logLevel: "warn",
            notify: false,
            rethrow: true,
          },
          userMessage: "Step execution error. The step will be retried.",
        };

      case "INNGEST_VALIDATION_ERROR":
        return {
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          category: "validation",
          strategy: {
            retry: false,
            log: true,
            logLevel: "warn",
            notify: false,
            rethrow: true,
          },
          userMessage: "Input validation failed.",
        };

      case "INNGEST_SERVICE_ERROR":
        return {
          severity: ErrorSeverity.HIGH,
          retryable: true,
          category: "service",
          strategy: {
            retry: true,
            maxRetries: 3,
            retryDelay: 2000,
            log: true,
            logLevel: "error",
            notify: true,
            rethrow: true,
          },
          userMessage: "External service error occurred.",
        };

      default:
        return this.getDefaultClassification();
    }
  }

  /**
   * Classify standard JavaScript errors
   */
  private classifyStandardError(error: Error): ErrorClassification {
    // Network-related errors
    if (this.isNetworkError(error)) {
      return {
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        category: "network",
        strategy: {
          retry: true,
          maxRetries: 3,
          retryDelay: 1000,
          log: true,
          logLevel: "warn",
          notify: false,
          rethrow: true,
        },
        userMessage: "Network error occurred. The operation will be retried.",
      };
    }

    // Timeout errors
    if (this.isTimeoutError(error)) {
      return {
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        category: "timeout",
        strategy: {
          retry: false,
          log: true,
          logLevel: "warn",
          notify: true,
          rethrow: true,
        },
        userMessage: "Operation timed out.",
      };
    }

    // Permission/authorization errors
    if (this.isAuthError(error)) {
      return {
        severity: ErrorSeverity.HIGH,
        retryable: false,
        category: "authorization",
        strategy: {
          retry: false,
          log: true,
          logLevel: "error",
          notify: true,
          rethrow: true,
        },
        userMessage: "Authorization failed.",
      };
    }

    return this.getDefaultClassification();
  }

  /**
   * Log an error with appropriate context
   */
  private logError(
    error: Error | InngestError,
    classification: ErrorClassification,
    options: ErrorHandlingOptions,
  ): void {
    const logLevel = options.logLevel || "error";
    const context = {
      errorCode: error instanceof InngestError ? error.code : "UNKNOWN",
      errorName: error.name,
      severity: classification.severity,
      category: classification.category,
      retryable: classification.retryable,
      stack: error.stack,
      ...(error instanceof InngestError ? error.context : {}),
      ...options.context,
    };

    const message = `${classification.category} error: ${error.message}`;

    switch (logLevel) {
      case "error":
        this.logger.error(message, context);
        break;
      case "warn":
        this.logger.warn(message, context);
        break;
      case "debug":
        this.logger.debug(message, context);
        break;
    }
  }

  /**
   * Notify external systems about the error
   */
  private async notifyError(
    error: Error | InngestError,
    classification: ErrorClassification,
    options: ErrorHandlingOptions,
  ): Promise<void> {
    // This is a placeholder for external notification systems
    // In a real implementation, you might integrate with:
    // - Sentry
    // - Datadog
    // - Slack notifications
    // - Email alerts
    // etc.

    this.logger.debug(
      `Would notify external systems about ${classification.category} error`,
    );
  }

  /**
   * Get default error classification for unknown errors
   */
  private getDefaultClassification(): ErrorClassification {
    return {
      severity: ErrorSeverity.MEDIUM,
      retryable: false,
      category: "unknown",
      strategy: {
        retry: false,
        log: true,
        logLevel: "error",
        notify: false,
        rethrow: true,
      },
      userMessage: "An unexpected error occurred.",
    };
  }

  /**
   * Check if error is network-related
   */
  private isNetworkError(error: Error): boolean {
    const networkErrorMessages = [
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
      "Network Error",
      "fetch failed",
    ];

    return networkErrorMessages.some(
      (msg) => error.message.includes(msg) || error.name.includes(msg),
    );
  }

  /**
   * Check if error is timeout-related
   */
  private isTimeoutError(error: Error): boolean {
    return (
      error.message.includes("timeout") ||
      error.message.includes("ETIMEDOUT") ||
      error.name.includes("TimeoutError")
    );
  }

  /**
   * Check if error is authorization-related
   */
  private isAuthError(error: Error): boolean {
    const authMessages = ["Unauthorized", "Forbidden", "401", "403"];
    return authMessages.some(
      (msg) => error.message.includes(msg) || error.name.includes(msg),
    );
  }
}

/**
 * Global error handler instance
 */
export const errorHandler = new ErrorHandler();

/**
 * Utility function to handle errors with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    retryCondition?: (error: Error) => boolean;
    onRetry?: (error: Error, attempt: number) => void;
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    retryCondition = () => true,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on the last attempt
      if (attempt > maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!retryCondition(lastError) || !errorHandler.isRetryable(lastError)) {
        break;
      }

      // Call retry callback
      if (onRetry) {
        onRetry(lastError, attempt);
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
    }
  }

  throw lastError!;
}

/**
 * Decorator for automatic error handling
 */
export function HandleErrors(options?: Partial<ErrorHandlingOptions>) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await method.apply(this, args);
      } catch (error) {
        await errorHandler.handleError(error as Error, {
          ...options,
          context: {
            className: target.constructor.name,
            methodName: propertyName,
            ...options?.context,
          },
        });
      }
    };

    return descriptor;
  };
}
