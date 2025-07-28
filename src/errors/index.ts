/**
 * Custom error classes for nest-inngest
 */

/**
 * Base error class for all nest-inngest errors
 */
export abstract class InngestError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    public readonly context?: Record<string, any>,
  ) {
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
    public readonly value?: any,
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
    public readonly originalError?: Error,
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
    public readonly originalError?: Error,
    additionalContext?: Record<string, any>,
  ) {
    super(message, {
      eventName,
      originalError,
      ...additionalContext,
    });
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
    public readonly originalError?: Error,
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
    public readonly originalError?: Error,
  ) {
    super(message, { functionId, runId, originalError });
  }
}

/**
 * Function timeout error
 */
export class InngestTimeoutError extends InngestError {
  readonly code = "INNGEST_TIMEOUT_ERROR";

  constructor(
    message: string,
    public readonly functionId?: string,
    public readonly runId?: string,
    public readonly timeout?: number,
  ) {
    super(message, { functionId, runId, timeout });
  }
}

/**
 * Function retry exhausted error
 */
export class InngestRetryError extends InngestError {
  readonly code = "INNGEST_RETRY_ERROR";

  constructor(
    message: string,
    public readonly functionId?: string,
    public readonly runId?: string,
    public readonly attempts?: number,
    public readonly lastError?: Error,
  ) {
    super(message, { functionId, runId, attempts, lastError });
  }
}

/**
 * Dependency injection/scope error
 */
export class InngestScopeError extends InngestError {
  readonly code = "INNGEST_SCOPE_ERROR";

  constructor(
    message: string,
    public readonly providerId?: string,
    public readonly scope?: string,
    public readonly originalError?: Error,
  ) {
    super(message, { providerId, scope, originalError });
  }
}

/**
 * Step execution error
 */
export class InngestStepError extends InngestError {
  readonly code = "INNGEST_STEP_ERROR";

  constructor(
    message: string,
    public readonly stepId?: string,
    public readonly stepType?: string,
    public readonly functionId?: string,
    public readonly runId?: string,
    public readonly originalError?: Error,
  ) {
    super(message, { stepId, stepType, functionId, runId, originalError });
  }
}

/**
 * Validation error specifically for function arguments/context
 */
export class InngestValidationError extends InngestError {
  readonly code = "INNGEST_VALIDATION_ERROR";

  constructor(
    message: string,
    public readonly validationErrors?: Array<{
      path: string;
      message: string;
      code: string;
    }>,
    public readonly functionId?: string,
  ) {
    super(message, { validationErrors, functionId });
  }
}

/**
 * Service unavailable error
 */
export class InngestServiceError extends InngestError {
  readonly code = "INNGEST_SERVICE_ERROR";

  constructor(
    message: string,
    public readonly service?: string,
    public readonly statusCode?: number,
    public readonly originalError?: Error,
  ) {
    super(message, { service, statusCode, originalError });
  }
}
