/**
 * Test configuration utilities for managing different testing modes
 */

// Load environment variables from .env file
try {
  require("dotenv").config();
} catch (e) {
  // dotenv is optional
}

export interface TestEnvironmentConfig {
  /** Whether to use real Inngest API calls */
  useRealAPI: boolean;
  /** Inngest app ID for testing */
  appId: string;
  /** Event key for sending events (required for real API) */
  eventKey?: string;
  /** Signing key for webhook verification (required for real API) */
  signingKey?: string;
  /** Base URL for Inngest API (optional, defaults to production) */
  baseUrl?: string;
  /** Whether to enable development mode */
  isDev: boolean;
  /** Timeout for API calls */
  timeout: number;
}

/**
 * Default configuration for mock testing mode
 */
export const MOCK_TEST_CONFIG: TestEnvironmentConfig = {
  useRealAPI: false,
  appId: "test-app-mock",
  signingKey: "test-signing-key-mock",
  isDev: true,
  timeout: 5000,
};

/**
 * Default configuration for real API testing mode
 * These values should be overridden with real credentials
 */
export const REAL_API_TEST_CONFIG: TestEnvironmentConfig = {
  useRealAPI: true,
  appId: process.env.INNGEST_APP_ID || "test-app-real",
  eventKey: process.env.INNGEST_EVENT_KEY,
  signingKey: process.env.INNGEST_SIGNING_KEY?.trim(),
  baseUrl: process.env.INNGEST_BASE_URL || "http://localhost:8288",
  isDev: process.env.INNGEST_ENV !== "production",
  timeout: 10000,
};

/**
 * Utility function to get test configuration based on environment
 */
export function getTestConfig(): TestEnvironmentConfig {
  const useRealAPI =
    process.env.INNGEST_USE_REAL_API === "true" ||
    process.env.NODE_ENV === "e2e";

  if (useRealAPI) {
    return {
      ...REAL_API_TEST_CONFIG,
      useRealAPI: true,
    };
  }

  return {
    ...MOCK_TEST_CONFIG,
    useRealAPI: false,
  };
}

/**
 * Validate that real API configuration is complete
 */
export function validateRealAPIConfig(config: TestEnvironmentConfig): void {
  if (!config.useRealAPI) return;

  const missing: string[] = [];

  if (!config.eventKey) missing.push("INNGEST_EVENT_KEY");
  if (!config.signingKey) missing.push("INNGEST_SIGNING_KEY");
  if (!config.appId || config.appId === "test-app-real")
    missing.push("INNGEST_APP_ID");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for real API testing: ${missing.join(", ")}\n` +
        "Please set these environment variables or use mock mode by removing INNGEST_USE_REAL_API=true",
    );
  }
}

/**
 * Check if all required environment variables are available for real API testing
 */
export function canUseRealAPI(): boolean {
  try {
    const config = REAL_API_TEST_CONFIG;
    validateRealAPIConfig(config);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a user-friendly status of the current test mode
 */
export function getTestModeStatus(): {
  mode: "mock" | "real-api";
  description: string;
  config: TestEnvironmentConfig;
} {
  const config = getTestConfig();

  if (config.useRealAPI) {
    return {
      mode: "real-api",
      description: `Using real Inngest API (App ID: ${config.appId})`,
      config,
    };
  }

  return {
    mode: "mock",
    description: "Using mock Inngest service (no external API calls)",
    config,
  };
}
