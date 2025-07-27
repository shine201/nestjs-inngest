import {
  validateConfig,
  mergeWithDefaults,
  ConfigValidationError,
  MergedInngestConfig,
} from "../utils/config-validation";
import { InngestModuleConfig } from "../interfaces/inngest-config.interface";
import { ERROR_MESSAGES } from "../constants";

describe("Config Validation", () => {
  describe("validateConfig", () => {
    it("should validate a valid configuration", () => {
      const config: InngestModuleConfig = {
        appId: "test-app",
        eventKey: "test-key",
        signingKey: "test-signing-key",
      };

      const result = validateConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should require appId", () => {
      const config = {} as InngestModuleConfig;

      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe(ERROR_MESSAGES.MISSING_APP_ID);
      expect(result.errors[0].field).toBe("appId");
    });

    it("should validate appId format", () => {
      const config: InngestModuleConfig = {
        appId: "invalid app id!", // Contains spaces and special characters
      };

      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.message === ERROR_MESSAGES.INVALID_APP_ID)
      ).toBe(true);
    });

    it("should validate appId length", () => {
      const config: InngestModuleConfig = {
        appId: "", // Too short
      };

      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === "appId")).toBe(true);
    });

    it("should validate endpoint format", () => {
      const config: InngestModuleConfig = {
        appId: "test-app",
        endpoint: "invalid-endpoint", // Should start with /
      };

      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.message === ERROR_MESSAGES.INVALID_ENDPOINT)
      ).toBe(true);
    });

    it("should validate timeout range", () => {
      const config: InngestModuleConfig = {
        appId: "test-app",
        timeout: 500, // Too low
      };

      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.message === ERROR_MESSAGES.INVALID_TIMEOUT)
      ).toBe(true);
    });

    it("should validate maxBatchSize range", () => {
      const config: InngestModuleConfig = {
        appId: "test-app",
        maxBatchSize: 0, // Too low
      };

      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.message === ERROR_MESSAGES.INVALID_MAX_BATCH_SIZE
        )
      ).toBe(true);
    });

    it("should validate environment values", () => {
      const config: InngestModuleConfig = {
        appId: "test-app",
        env: "invalid" as any,
      };

      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.message === ERROR_MESSAGES.INVALID_ENVIRONMENT
        )
      ).toBe(true);
    });

    it("should validate retry configuration", () => {
      const config: InngestModuleConfig = {
        appId: "test-app",
        retry: {
          maxAttempts: -1, // Invalid
          initialDelay: 50, // Too low
          maxDelay: 100000, // Too high
          backoffMultiplier: 0, // Too low
        },
      };

      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("mergeWithDefaults", () => {
    it("should merge configuration with defaults", () => {
      const config: InngestModuleConfig = {
        appId: "test-app",
        eventKey: "test-key",
      };

      const merged = mergeWithDefaults(config);

      expect(merged.appId).toBe("test-app");
      expect(merged.eventKey).toBe("test-key");
      expect(merged.endpoint).toBe("/api/inngest");
      expect(merged.isDev).toBe(false);
      expect(merged.logger).toBe(true);
      expect(merged.env).toBe("production");
      expect(merged.timeout).toBe(30000);
      expect(merged.maxBatchSize).toBe(100);
      expect(merged.strict).toBe(false);
      expect(merged.retry.maxAttempts).toBe(3);
      expect(merged.retry.initialDelay).toBe(1000);
      expect(merged.retry.maxDelay).toBe(30000);
      expect(merged.retry.backoffMultiplier).toBe(2);
    });

    it("should preserve user-provided values", () => {
      const config: InngestModuleConfig = {
        appId: "test-app",
        endpoint: "/custom/endpoint",
        isDev: true,
        logger: false,
        env: "development",
        timeout: 60000,
        maxBatchSize: 50,
        strict: true,
        retry: {
          maxAttempts: 5,
          initialDelay: 2000,
        },
      };

      const merged = mergeWithDefaults(config);

      expect(merged.endpoint).toBe("/custom/endpoint");
      expect(merged.isDev).toBe(true);
      expect(merged.logger).toBe(false);
      expect(merged.env).toBe("development");
      expect(merged.timeout).toBe(60000);
      expect(merged.maxBatchSize).toBe(50);
      expect(merged.strict).toBe(true);
      expect(merged.retry.maxAttempts).toBe(5);
      expect(merged.retry.initialDelay).toBe(2000);
      // Should still use defaults for unspecified retry values
      expect(merged.retry.maxDelay).toBe(30000);
      expect(merged.retry.backoffMultiplier).toBe(2);
    });
  });

  describe("ConfigValidationError", () => {
    it("should create error with field and value", () => {
      const error = new ConfigValidationError(
        "Test error",
        "testField",
        "testValue"
      );

      expect(error.message).toBe("Test error");
      expect(error.field).toBe("testField");
      expect(error.value).toBe("testValue");
      expect(error.name).toBe("InngestConfigError");
      expect(error.code).toBe("INNGEST_CONFIG_ERROR");
    });
  });
});
