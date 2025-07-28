/**
 * Export all mock services for easy importing
 */
export { MockInngestService } from "./mock-inngest.service";
export {
  MockExecutionContextService,
  MockStepTools,
  MockExecutionContext,
} from "./mock-execution-context.service";
export { MockSignatureVerificationService } from "./mock-signature-verification.service";

// Re-import for use in factory functions
import { MockInngestService } from "./mock-inngest.service";
import { MockExecutionContextService } from "./mock-execution-context.service";
import { MockSignatureVerificationService } from "./mock-signature-verification.service";

/**
 * Create a complete set of mock providers for testing
 */
export function createMockProviders() {
  return [
    MockInngestService,
    MockExecutionContextService,
    MockSignatureVerificationService,
  ];
}

/**
 * Mock factory helpers
 */
export class MockFactory {
  /**
   * Create a mock Inngest service with custom behavior
   */
  static createMockInngestService(
    options: {
      throwOnSend?: boolean;
      sendDelay?: number;
    } = {},
  ): MockInngestService {
    const mock = new MockInngestService();

    if (options.throwOnSend) {
      mock.mockSendError(new Error("Mock send error"));
    }

    if (options.sendDelay) {
      mock.mockSendDelay(options.sendDelay);
    }

    return mock;
  }

  /**
   * Create a mock execution context service with custom behavior
   */
  static createMockExecutionContextService(
    options: {
      throwOnCreate?: boolean;
      throwOnExecute?: boolean;
      executionDelay?: number;
      executionResult?: any;
    } = {},
  ): MockExecutionContextService {
    const mock = new MockExecutionContextService();

    if (options.throwOnCreate) {
      mock.mockCreateContextError(new Error("Mock context creation error"));
    }

    if (options.throwOnExecute) {
      mock.mockExecutionError(new Error("Mock execution error"));
    }

    if (options.executionDelay) {
      mock.mockExecutionDelay(options.executionDelay, options.executionResult);
    } else if (options.executionResult) {
      mock.mockExecutionResult(options.executionResult);
    }

    return mock;
  }

  /**
   * Create a mock signature verification service with custom behavior
   */
  static createMockSignatureVerificationService(
    options: {
      bypassVerification?: boolean;
      throwOnVerify?: boolean;
      verificationError?: string;
    } = {},
  ): MockSignatureVerificationService {
    const mock = new MockSignatureVerificationService();

    if (options.bypassVerification) {
      mock.bypassVerification(true);
    }

    if (options.throwOnVerify) {
      mock.mockVerificationFailure(
        options.verificationError || "Mock verification error",
      );
    }

    return mock;
  }
}
