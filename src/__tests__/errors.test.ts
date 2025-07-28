import {
  InngestError,
  InngestConfigError,
  InngestFunctionError,
  InngestEventError,
  InngestWebhookError,
  InngestRuntimeError,
} from "../errors";

describe("Error Classes", () => {
  describe("InngestConfigError", () => {
    it("should create error with field and value", () => {
      const error = new InngestConfigError(
        "Test config error",
        "testField",
        "testValue",
      );

      expect(error.message).toBe("Test config error");
      expect(error.field).toBe("testField");
      expect(error.value).toBe("testValue");
      expect(error.code).toBe("INNGEST_CONFIG_ERROR");
      expect(error.name).toBe("InngestConfigError");
      expect(error.context).toEqual({ field: "testField", value: "testValue" });
    });

    it("should work without field and value", () => {
      const error = new InngestConfigError("Test config error");

      expect(error.message).toBe("Test config error");
      expect(error.field).toBeUndefined();
      expect(error.value).toBeUndefined();
      expect(error.code).toBe("INNGEST_CONFIG_ERROR");
    });
  });

  describe("InngestFunctionError", () => {
    it("should create error with function ID and original error", () => {
      const originalError = new Error("Original error");
      const error = new InngestFunctionError(
        "Function error",
        "test-function",
        originalError,
      );

      expect(error.message).toBe("Function error");
      expect(error.functionId).toBe("test-function");
      expect(error.originalError).toBe(originalError);
      expect(error.code).toBe("INNGEST_FUNCTION_ERROR");
      expect(error.name).toBe("InngestFunctionError");
    });
  });

  describe("InngestEventError", () => {
    it("should create error with event name and original error", () => {
      const originalError = new Error("Original error");
      const error = new InngestEventError(
        "Event error",
        "test.event",
        originalError,
      );

      expect(error.message).toBe("Event error");
      expect(error.eventName).toBe("test.event");
      expect(error.originalError).toBe(originalError);
      expect(error.code).toBe("INNGEST_EVENT_ERROR");
      expect(error.name).toBe("InngestEventError");
    });
  });

  describe("InngestWebhookError", () => {
    it("should create error with status code and original error", () => {
      const originalError = new Error("Original error");
      const error = new InngestWebhookError(
        "Webhook error",
        400,
        originalError,
      );

      expect(error.message).toBe("Webhook error");
      expect(error.statusCode).toBe(400);
      expect(error.originalError).toBe(originalError);
      expect(error.code).toBe("INNGEST_WEBHOOK_ERROR");
      expect(error.name).toBe("InngestWebhookError");
    });
  });

  describe("InngestRuntimeError", () => {
    it("should create error with function ID, run ID and original error", () => {
      const originalError = new Error("Original error");
      const error = new InngestRuntimeError(
        "Runtime error",
        "test-function",
        "run-123",
        originalError,
      );

      expect(error.message).toBe("Runtime error");
      expect(error.functionId).toBe("test-function");
      expect(error.runId).toBe("run-123");
      expect(error.originalError).toBe(originalError);
      expect(error.code).toBe("INNGEST_RUNTIME_ERROR");
      expect(error.name).toBe("InngestRuntimeError");
    });
  });

  describe("Error inheritance", () => {
    it("should extend Error correctly", () => {
      const error = new InngestConfigError("Test error");

      expect(error instanceof Error).toBe(true);
      expect(error instanceof InngestError).toBe(true);
      expect(error instanceof InngestConfigError).toBe(true);
    });

    it("should have correct stack trace", () => {
      const error = new InngestConfigError("Test error");

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("InngestConfigError");
    });
  });
});
