import {
  ErrorHandler,
  ErrorSeverity,
  withRetry,
  HandleErrors,
} from "../utils/error-handler";
import {
  InngestError,
  InngestConfigError,
  InngestFunctionError,
  InngestEventError,
  InngestWebhookError,
  InngestRuntimeError,
  InngestTimeoutError,
  InngestRetryError,
  InngestScopeError,
  InngestStepError,
  InngestValidationError,
  InngestServiceError,
} from "../errors";

describe("ErrorHandler", () => {
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    errorHandler = new ErrorHandler();
  });

  describe("classifyError", () => {
    it("should classify InngestConfigError correctly", () => {
      const error = new InngestConfigError(
        "Config validation failed",
        "signingKey",
      );
      const classification = errorHandler.classifyError(error);

      expect(classification.severity).toBe(ErrorSeverity.CRITICAL);
      expect(classification.retryable).toBe(false);
      expect(classification.category).toBe("configuration");
      expect(classification.userMessage).toContain("configuration");
    });

    it("should classify InngestFunctionError correctly", () => {
      const error = new InngestFunctionError(
        "Function registration failed",
        "test-function",
      );
      const classification = errorHandler.classifyError(error);

      expect(classification.severity).toBe(ErrorSeverity.HIGH);
      expect(classification.retryable).toBe(false);
      expect(classification.category).toBe("function_registration");
    });

    it("should classify InngestEventError correctly", () => {
      const error = new InngestEventError(
        "Event processing failed",
        "user.created",
      );
      const classification = errorHandler.classifyError(error);

      expect(classification.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.retryable).toBe(true);
      expect(classification.category).toBe("event_processing");
      expect(classification.strategy.maxRetries).toBe(3);
    });

    it("should classify InngestTimeoutError correctly", () => {
      const error = new InngestTimeoutError(
        "Function timed out",
        "test-function",
        "run-123",
        30000,
      );
      const classification = errorHandler.classifyError(error);

      expect(classification.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.retryable).toBe(false);
      expect(classification.category).toBe("timeout");
    });

    it("should classify standard JavaScript errors", () => {
      const error = new Error("ECONNRESET: Connection reset by peer");
      const classification = errorHandler.classifyError(error);

      expect(classification.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.retryable).toBe(true);
      expect(classification.category).toBe("network");
    });

    it("should classify timeout errors", () => {
      const error = new Error("Operation timeout after 5000ms");
      const classification = errorHandler.classifyError(error);

      expect(classification.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.retryable).toBe(false);
      expect(classification.category).toBe("timeout");
    });

    it("should classify authorization errors", () => {
      const error = new Error("Unauthorized access - 401");
      const classification = errorHandler.classifyError(error);

      expect(classification.severity).toBe(ErrorSeverity.HIGH);
      expect(classification.retryable).toBe(false);
      expect(classification.category).toBe("authorization");
    });

    it("should provide default classification for unknown errors", () => {
      const error = new Error("Unknown error occurred");
      const classification = errorHandler.classifyError(error);

      expect(classification.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.retryable).toBe(false);
      expect(classification.category).toBe("unknown");
    });
  });

  describe("handleError", () => {
    it("should handle error with default strategy", async () => {
      const error = new InngestEventError("Test error", "test.event");
      const logSpy = jest.spyOn(console, "log").mockImplementation();

      try {
        await errorHandler.handleError(error, { rethrow: false });
      } catch (e) {
        // Should not throw when rethrow is false
        fail("Should not throw error");
      }

      logSpy.mockRestore();
    });

    it("should rethrow error when rethrow is true", async () => {
      const error = new InngestConfigError("Config error");

      await expect(
        errorHandler.handleError(error, { rethrow: true }),
      ).rejects.toThrow("Config error");
    });

    it("should use custom options to override default strategy", async () => {
      const error = new InngestEventError("Test error");
      const logSpy = jest.spyOn(console, "log").mockImplementation();

      await errorHandler.handleError(error, {
        log: false,
        rethrow: false,
      });

      // Should not log when log is false
      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe("wrapError", () => {
    it("should wrap standard error as InngestRuntimeError", () => {
      const originalError = new Error("Original error");
      const context = {
        functionId: "test-function",
        runId: "run-123",
      };

      const wrappedError = errorHandler.wrapError(
        originalError,
        "Wrapped error message",
        context,
      );

      expect(wrappedError).toBeInstanceOf(InngestRuntimeError);
      expect(wrappedError.message).toBe("Wrapped error message");
      expect(wrappedError.functionId).toBe("test-function");
      expect(wrappedError.runId).toBe("run-123");
    });
  });

  describe("isRetryable", () => {
    it("should return true for retryable errors", () => {
      const error = new InngestEventError("Retryable error");
      expect(errorHandler.isRetryable(error)).toBe(true);
    });

    it("should return false for non-retryable errors", () => {
      const error = new InngestConfigError("Non-retryable error");
      expect(errorHandler.isRetryable(error)).toBe(false);
    });
  });

  describe("getSeverity", () => {
    it("should return correct severity for errors", () => {
      const criticalError = new InngestConfigError("Critical error");
      const highError = new InngestFunctionError("High severity error");
      const mediumError = new InngestEventError("Medium severity error");

      expect(errorHandler.getSeverity(criticalError)).toBe(
        ErrorSeverity.CRITICAL,
      );
      expect(errorHandler.getSeverity(highError)).toBe(ErrorSeverity.HIGH);
      expect(errorHandler.getSeverity(mediumError)).toBe(ErrorSeverity.MEDIUM);
    });
  });
});

describe("withRetry", () => {
  it("should succeed on first attempt", async () => {
    const operation = jest.fn().mockResolvedValue("success");

    const result = await withRetry(operation);

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("should retry on retryable errors", async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new InngestEventError("Retryable error"))
      .mockResolvedValue("success");

    const result = await withRetry(operation, {
      maxRetries: 2,
      retryDelay: 10,
    });

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("should not retry on non-retryable errors", async () => {
    const operation = jest
      .fn()
      .mockRejectedValue(new InngestConfigError("Non-retryable error"));

    await expect(
      withRetry(operation, { maxRetries: 2, retryDelay: 10 }),
    ).rejects.toThrow("Non-retryable error");

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("should call onRetry callback", async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new InngestEventError("Retryable error"))
      .mockResolvedValue("success");
    const onRetry = jest.fn();

    await withRetry(operation, {
      maxRetries: 2,
      retryDelay: 10,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  it("should respect custom retry condition", async () => {
    const operation = jest.fn().mockRejectedValue(new Error("Custom error"));

    const retryCondition = jest.fn().mockReturnValue(false);

    await expect(
      withRetry(operation, {
        maxRetries: 2,
        retryDelay: 10,
        retryCondition,
      }),
    ).rejects.toThrow("Custom error");

    expect(operation).toHaveBeenCalledTimes(1);
    expect(retryCondition).toHaveBeenCalled();
  });

  it("should exhaust max retries and throw last error", async () => {
    const operation = jest
      .fn()
      .mockRejectedValue(new InngestEventError("Always fails"));

    await expect(
      withRetry(operation, { maxRetries: 2, retryDelay: 10 }),
    ).rejects.toThrow("Always fails");

    expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });
});

describe("HandleErrors decorator", () => {
  class TestService {
    @HandleErrors({ rethrow: false })
    async testMethod(shouldThrow: boolean): Promise<string> {
      if (shouldThrow) {
        throw new InngestEventError("Test error");
      }
      return "success";
    }

    @HandleErrors({ log: false, rethrow: true })
    async testMethodWithCustomOptions(): Promise<void> {
      throw new Error("Test error");
    }
  }

  it("should handle errors using decorator", async () => {
    const service = new TestService();
    const logSpy = jest.spyOn(console, "log").mockImplementation();

    // Should not throw due to rethrow: false
    const result = await service.testMethod(true);
    expect(result).toBeUndefined();

    logSpy.mockRestore();
  });

  it("should pass through successful calls", async () => {
    const service = new TestService();

    const result = await service.testMethod(false);
    expect(result).toBe("success");
  });

  it("should respect custom decorator options", async () => {
    const service = new TestService();
    const logSpy = jest.spyOn(console, "log").mockImplementation();

    await expect(service.testMethodWithCustomOptions()).rejects.toThrow(
      "Test error",
    );

    // Should not log due to log: false
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
