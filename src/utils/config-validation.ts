import { InngestModuleConfig } from "../interfaces/inngest-config.interface";
import { VALIDATION_RULES, ERROR_MESSAGES } from "../constants";
import { InngestConfigError } from "../errors";

/**
 * Configuration validation error (alias for backward compatibility)
 */
export const ConfigValidationError = InngestConfigError;

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: InngestConfigError[];
}

/**
 * Validates the appId field
 */
function validateAppId(appId: string): InngestConfigError[] {
  const errors: InngestConfigError[] = [];

  if (!appId || typeof appId !== "string") {
    errors.push(
      new InngestConfigError(ERROR_MESSAGES.MISSING_APP_ID, "appId", appId),
    );
    return errors;
  }

  if (
    appId.length < VALIDATION_RULES.APP_ID.minLength ||
    appId.length > VALIDATION_RULES.APP_ID.maxLength
  ) {
    errors.push(
      new InngestConfigError(
        `appId must be between ${VALIDATION_RULES.APP_ID.minLength} and ${VALIDATION_RULES.APP_ID.maxLength} characters`,
        "appId",
        appId,
      ),
    );
  }

  if (!VALIDATION_RULES.APP_ID.pattern.test(appId)) {
    errors.push(
      new InngestConfigError(ERROR_MESSAGES.INVALID_APP_ID, "appId", appId),
    );
  }

  return errors;
}

/**
 * Validates the endpoint field
 */
function validateEndpoint(endpoint?: string): InngestConfigError[] {
  const errors: InngestConfigError[] = [];

  if (endpoint && !VALIDATION_RULES.ENDPOINT.pattern.test(endpoint)) {
    errors.push(
      new InngestConfigError(
        ERROR_MESSAGES.INVALID_ENDPOINT,
        "endpoint",
        endpoint,
      ),
    );
  }

  return errors;
}

/**
 * Validates the timeout field
 */
function validateTimeout(timeout?: number): InngestConfigError[] {
  const errors: InngestConfigError[] = [];

  if (timeout !== undefined) {
    if (
      typeof timeout !== "number" ||
      timeout < VALIDATION_RULES.TIMEOUT.min ||
      timeout > VALIDATION_RULES.TIMEOUT.max
    ) {
      errors.push(
        new InngestConfigError(
          ERROR_MESSAGES.INVALID_TIMEOUT,
          "timeout",
          timeout,
        ),
      );
    }
  }

  return errors;
}

/**
 * Validates the maxBatchSize field
 */
function validateMaxBatchSize(maxBatchSize?: number): InngestConfigError[] {
  const errors: InngestConfigError[] = [];

  if (maxBatchSize !== undefined) {
    if (
      typeof maxBatchSize !== "number" ||
      maxBatchSize < VALIDATION_RULES.MAX_BATCH_SIZE.min ||
      maxBatchSize > VALIDATION_RULES.MAX_BATCH_SIZE.max
    ) {
      errors.push(
        new InngestConfigError(
          ERROR_MESSAGES.INVALID_MAX_BATCH_SIZE,
          "maxBatchSize",
          maxBatchSize,
        ),
      );
    }
  }

  return errors;
}

/**
 * Validates the environment field
 */
function validateEnvironment(env?: string): InngestConfigError[] {
  const errors: InngestConfigError[] = [];

  if (env !== undefined) {
    const validEnvs = ["production", "development", "test"];
    if (!validEnvs.includes(env)) {
      errors.push(
        new InngestConfigError(ERROR_MESSAGES.INVALID_ENVIRONMENT, "env", env),
      );
    }
  }

  return errors;
}

/**
 * Validates the retry configuration
 */
function validateRetryConfig(
  retry?: Partial<InngestModuleConfig["retry"]>,
): InngestConfigError[] {
  const errors: InngestConfigError[] = [];

  if (retry) {
    if (retry.maxAttempts !== undefined) {
      if (
        typeof retry.maxAttempts !== "number" ||
        retry.maxAttempts < VALIDATION_RULES.RETRY_ATTEMPTS.min ||
        retry.maxAttempts > VALIDATION_RULES.RETRY_ATTEMPTS.max
      ) {
        errors.push(
          new InngestConfigError(
            `retry.maxAttempts must be between ${VALIDATION_RULES.RETRY_ATTEMPTS.min} and ${VALIDATION_RULES.RETRY_ATTEMPTS.max}`,
            "retry.maxAttempts",
            retry.maxAttempts,
          ),
        );
      }
    }

    if (retry.initialDelay !== undefined) {
      if (
        typeof retry.initialDelay !== "number" ||
        retry.initialDelay < VALIDATION_RULES.RETRY_DELAY.min ||
        retry.initialDelay > VALIDATION_RULES.RETRY_DELAY.max
      ) {
        errors.push(
          new InngestConfigError(
            `retry.initialDelay must be between ${VALIDATION_RULES.RETRY_DELAY.min}ms and ${VALIDATION_RULES.RETRY_DELAY.max}ms`,
            "retry.initialDelay",
            retry.initialDelay,
          ),
        );
      }
    }

    if (retry.maxDelay !== undefined) {
      if (
        typeof retry.maxDelay !== "number" ||
        retry.maxDelay < VALIDATION_RULES.RETRY_DELAY.min ||
        retry.maxDelay > VALIDATION_RULES.RETRY_DELAY.max
      ) {
        errors.push(
          new InngestConfigError(
            `retry.maxDelay must be between ${VALIDATION_RULES.RETRY_DELAY.min}ms and ${VALIDATION_RULES.RETRY_DELAY.max}ms`,
            "retry.maxDelay",
            retry.maxDelay,
          ),
        );
      }
    }

    if (retry.backoffMultiplier !== undefined) {
      if (
        typeof retry.backoffMultiplier !== "number" ||
        retry.backoffMultiplier < 1 ||
        retry.backoffMultiplier > 10
      ) {
        errors.push(
          new InngestConfigError(
            "retry.backoffMultiplier must be between 1 and 10",
            "retry.backoffMultiplier",
            retry.backoffMultiplier,
          ),
        );
      }
    }
  }

  return errors;
}

/**
 * Validates the complete Inngest module configuration
 */
export function validateConfig(config: InngestModuleConfig): ValidationResult {
  const errors: InngestConfigError[] = [];

  // Validate required fields
  errors.push(...validateAppId(config.appId));

  // Validate optional fields
  errors.push(...validateEndpoint(config.endpoint));
  errors.push(...validateTimeout(config.timeout));
  errors.push(...validateMaxBatchSize(config.maxBatchSize));
  errors.push(...validateEnvironment(config.env));
  errors.push(...validateRetryConfig(config.retry));

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Merged configuration type with required fields
 */
export type MergedInngestConfig = Required<
  Omit<
    InngestModuleConfig,
    "eventKey" | "signingKey" | "baseUrl" | "httpPlatform"
  >
> & {
  eventKey?: string;
  signingKey?: string;
  baseUrl?: string;
  httpPlatform?: string;
};

/**
 * Merges user configuration with default values
 */
export function mergeWithDefaults(
  config: InngestModuleConfig,
): MergedInngestConfig {
  return {
    appId: config.appId,
    eventKey: config.eventKey,
    signingKey: config.signingKey,
    baseUrl: config.baseUrl,
    endpoint: config.endpoint ?? "/api/inngest",
    isDev: config.isDev ?? false,
    logger: config.logger ?? true,
    env: config.env ?? "production",
    timeout: config.timeout ?? 30000,
    maxBatchSize: config.maxBatchSize ?? 100,
    strict: config.strict ?? false,
    retry: {
      maxAttempts: config.retry?.maxAttempts ?? 3,
      initialDelay: config.retry?.initialDelay ?? 1000,
      maxDelay: config.retry?.maxDelay ?? 30000,
      backoffMultiplier: config.retry?.backoffMultiplier ?? 2,
    },
    development: config.development || {
      enabled: false,
      disableSignatureVerification: false,
    },
    httpPlatform: config.httpPlatform,
  };
}

/**
 * Validates and merges configuration in one step
 */
export function validateAndMergeConfig(config: InngestModuleConfig): {
  config: MergedInngestConfig;
  validation: ValidationResult;
} {
  const validation = validateConfig(config);
  const mergedConfig = mergeWithDefaults(config);

  return {
    config: mergedConfig,
    validation,
  };
}
