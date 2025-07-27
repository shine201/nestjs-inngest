/**
 * Custom error classes for nest-inngest
 */

/**
 * Base error class for all nest-inngest errors
 */
export abstract class InngestError extends Error {
  abstract readonly code: string;

  constructor(message: string, public readonly context?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Configuration validation error
 */
export class InngestConfigError extends InngestError {
  readonly code = "INNGEST_CONFIG_ERROR";

  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: any
  ) {
    super(message, { field, value });
  }
}

/**
 * Function registration error
 */
export class InngestFunctionError extends InngestError {
  readonly code = "INNGEST_FUNCTION_ERROR";

  constructor(
    message: string,
    public readonly functionId?: string,
    public readonly originalError?: Error
  ) {
    super(message, { functionId, originalError });
  }
}

/**
 * Event sending error
 */
export class InngestEventError extends InngestError {
  readonly code = "INNGEST_EVENT_ERROR";

  constructor(
    message: string,
    public readonly eventName?: string,
    public readonly originalError?: Error
  ) {
    super(message, { eventName, originalError });
  }
}

/**
 * Webhook processing error
 */
export class InngestWebhookError extends InngestError {
  readonly code = "INNGEST_WEBHOOK_ERROR";

  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: Error
  ) {
    super(message, { statusCode, originalError });
  }
}

/**
 * Runtime execution error
 */
export class InngestRuntimeError extends InngestError {
  readonly code = "INNGEST_RUNTIME_ERROR";

  constructor(
    message: string,
    public readonly functionId?: string,
    public readonly runId?: string,
    public readonly originalError?: Error
  ) {
    super(message, { functionId, runId, originalError });
  }
}
