/**
 * Constants used throughout the nest-inngest library
 */

/**
 * Injection tokens
 */
export const INNGEST_CONFIG = Symbol("INNGEST_CONFIG");
export const INNGEST_CLIENT = Symbol("INNGEST_CLIENT");
export const INNGEST_FUNCTION_METADATA = Symbol("INNGEST_FUNCTION_METADATA");

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  endpoint: "/api/inngest",
  isDev: false,
  logger: true,
  env: "production" as const,
  timeout: 30000,
  maxBatchSize: 100,
  strict: false,
  retry: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
} as const;

/**
 * Configuration validation rules
 */
export const VALIDATION_RULES = {
  APP_ID: {
    minLength: 1,
    maxLength: 100,
    pattern: /^[a-zA-Z0-9-_]+$/,
  },
  ENDPOINT: {
    pattern: /^\/[a-zA-Z0-9-_/]*$/,
  },
  TIMEOUT: {
    min: 1000,
    max: 300000, // 5 minutes
  },
  MAX_BATCH_SIZE: {
    min: 1,
    max: 1000,
  },
  RETRY_ATTEMPTS: {
    min: 0,
    max: 10,
  },
  RETRY_DELAY: {
    min: 100,
    max: 60000, // 1 minute
  },
} as const;

/**
 * Metadata keys for decorators
 */
export const METADATA_KEYS = {
  INNGEST_FUNCTION: "inngest:function",
} as const;

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  // Configuration errors
  MISSING_APP_ID: "appId is required in Inngest configuration",
  INVALID_APP_ID:
    "appId must be a valid string containing only alphanumeric characters, hyphens, and underscores",
  MISSING_SIGNING_KEY:
    "signingKey is required for webhook signature verification",
  INVALID_ENDPOINT: "endpoint must be a valid path starting with /",
  INVALID_TIMEOUT: "timeout must be between 1000ms and 300000ms (5 minutes)",
  INVALID_MAX_BATCH_SIZE: "maxBatchSize must be between 1 and 1000",
  INVALID_ENVIRONMENT: "env must be one of: production, development, test",
  INVALID_RETRY_CONFIG: "retry configuration contains invalid values",

  // Function errors
  INVALID_FUNCTION_ID: "Function ID must be a non-empty string",
  INVALID_TRIGGERS: "At least one trigger must be specified",
  FUNCTION_NOT_FOUND: "Inngest function not found",
  DUPLICATE_FUNCTION_ID: "Function ID must be unique within the application",

  // Runtime errors
  SIGNATURE_VERIFICATION_FAILED: "Webhook signature verification failed",
  EVENT_SEND_FAILED: "Failed to send event to Inngest",
  FUNCTION_EXECUTION_FAILED: "Inngest function execution failed",

  // Validation errors
  INVALID_EVENT_NAME: "Event name must be a non-empty string",
  INVALID_EVENT_DATA: "Event data must be a valid object",
  INVALID_CRON_EXPRESSION: "Invalid cron expression",
} as const;
