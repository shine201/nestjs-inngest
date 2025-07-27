/**
 * Basic tests to verify project structure and interfaces
 */

describe("Project Structure", () => {
  it("should export main interfaces", () => {
    // Test that we can import the main interfaces
    expect(() => {
      require("../interfaces/inngest-config.interface");
      require("../interfaces/inngest-event.interface");
      require("../interfaces/inngest-function.interface");
    }).not.toThrow();
  });

  it("should export constants", () => {
    const constants = require("../constants");

    expect(constants.INNGEST_CONFIG).toBeDefined();
    expect(constants.INNGEST_CLIENT).toBeDefined();
    expect(constants.DEFAULT_CONFIG).toBeDefined();
    expect(constants.METADATA_KEYS).toBeDefined();
    expect(constants.ERROR_MESSAGES).toBeDefined();
  });

  it("should have correct default configuration", () => {
    const { DEFAULT_CONFIG } = require("../constants");

    expect(DEFAULT_CONFIG.endpoint).toBe("/api/inngest");
    expect(DEFAULT_CONFIG.isDev).toBe(false);
    expect(DEFAULT_CONFIG.logger).toBe(true);
    expect(DEFAULT_CONFIG.env).toBe("production");
    expect(DEFAULT_CONFIG.timeout).toBe(30000);
    expect(DEFAULT_CONFIG.maxBatchSize).toBe(100);
    expect(DEFAULT_CONFIG.strict).toBe(false);
    expect(DEFAULT_CONFIG.retry.maxAttempts).toBe(3);
    expect(DEFAULT_CONFIG.retry.initialDelay).toBe(1000);
    expect(DEFAULT_CONFIG.retry.maxDelay).toBe(30000);
    expect(DEFAULT_CONFIG.retry.backoffMultiplier).toBe(2);
  });
});
