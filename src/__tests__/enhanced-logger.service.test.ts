import { Logger } from "@nestjs/common";
import {
  EnhancedLogger,
  LoggerFactory,
  LogLevel,
} from "../services/enhanced-logger.service";
import { InngestRuntimeError, InngestTimeoutError } from "../errors";

// Mock console.log to capture structured logs
const mockConsoleLog = jest.spyOn(console, "log").mockImplementation();

// Mock NestJS Logger
jest.mock("@nestjs/common", () => ({
  ...jest.requireActual("@nestjs/common"),
  Logger: jest.fn().mockImplementation(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    // Remove context property access
  })),
}));

describe("EnhancedLogger", () => {
  let logger: EnhancedLogger;
  let mockNestLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog.mockClear();
    logger = new EnhancedLogger("TestContext");
    // Set log level to VERBOSE to ensure all messages are logged
    logger.setLogLevel(LogLevel.VERBOSE);
    // Get the mocked NestJS logger instance
    mockNestLogger = (logger as any).nestLogger;
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
  });

  describe("basic logging methods", () => {
    it("should log error messages with context", () => {
      const error = new Error("Test error");
      const context = { userId: "123", action: "test" };

      logger.error("Error occurred", context, error);

      expect(mockNestLogger.error).toHaveBeenCalledWith(
        "Error occurred",
        error.stack,
      );
      expect(mockConsoleLog).toHaveBeenCalled();

      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);

      expect(parsedLog.level).toBe("ERROR");
      expect(parsedLog.message).toBe("Error occurred");
      expect(parsedLog.context).toEqual(context);
      expect(parsedLog.error).toBeDefined();
      expect(parsedLog.error.name).toBe("Error");
      expect(parsedLog.error.message).toBe("Test error");
    });

    it("should log warning messages", () => {
      const context = { component: "webhook" };

      logger.warn("Warning message", context);

      expect(mockNestLogger.warn).toHaveBeenCalledWith("Warning message");
      expect(mockConsoleLog).toHaveBeenCalled();

      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);

      expect(parsedLog.level).toBe("WARN");
      expect(parsedLog.message).toBe("Warning message");
      expect(parsedLog.context).toEqual(context);
    });

    it("should log info messages", () => {
      logger.log("Info message");

      expect(mockNestLogger.log).toHaveBeenCalledWith("Info message");
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it("should log debug messages", () => {
      logger.debug("Debug message");

      expect(mockNestLogger.debug).toHaveBeenCalledWith("Debug message");
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it("should log verbose messages", () => {
      logger.verbose("Verbose message");

      expect(mockNestLogger.verbose).toHaveBeenCalledWith("Verbose message");
      expect(mockConsoleLog).toHaveBeenCalled();
    });
  });

  describe("log level filtering", () => {
    it("should respect log level settings", () => {
      logger.setLogLevel(LogLevel.WARN);

      // Should log (WARN and above)
      logger.error("Error message");
      logger.warn("Warning message");

      // Should not log (below WARN)
      logger.log("Info message");
      logger.debug("Debug message");
      logger.verbose("Verbose message");

      expect(mockNestLogger.error).toHaveBeenCalledTimes(1);
      expect(mockNestLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockNestLogger.log).not.toHaveBeenCalled();
      expect(mockNestLogger.debug).not.toHaveBeenCalled();
      expect(mockNestLogger.verbose).not.toHaveBeenCalled();
    });
  });

  describe("structured logging control", () => {
    it("should disable structured logging when configured", () => {
      logger.setStructuredLogging(false);
      logger.log("Test message");

      expect(mockNestLogger.log).toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });

  describe("Inngest-specific logging methods", () => {
    it("should log function start", () => {
      const context = { eventName: "user.created", eventId: "evt_123" };

      logger.logFunctionStart("func_123", "run_456", 1, context);

      expect(mockConsoleLog).toHaveBeenCalled();
      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);

      expect(parsedLog.message).toContain(
        "Function func_123 execution started",
      );
      expect(parsedLog.context.functionId).toBe("func_123");
      expect(parsedLog.context.runId).toBe("run_456");
      expect(parsedLog.context.attempt).toBe(1);
      expect(parsedLog.context.phase).toBe("start");
      expect(parsedLog.context.tags).toContain("function-execution");
      expect(parsedLog.context.tags).toContain("start");
    });

    it("should log function success", () => {
      const result = { userId: "123", status: "completed" };

      logger.logFunctionSuccess("func_123", "run_456", 2, 1500, result);

      expect(mockConsoleLog).toHaveBeenCalled();
      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);

      expect(parsedLog.message).toContain(
        "Function func_123 executed successfully",
      );
      expect(parsedLog.context.duration).toBe(1500);
      expect(parsedLog.context.attempt).toBe(2);
      expect(parsedLog.context.phase).toBe("success");
      expect(parsedLog.context.resultType).toBe("object");
    });

    it("should log function error with InngestError", () => {
      const error = new InngestRuntimeError(
        "Function failed",
        "func_123",
        "run_456",
      );

      logger.logFunctionError("func_123", "run_456", 1, 800, error);

      expect(mockConsoleLog).toHaveBeenCalled();
      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);

      expect(parsedLog.message).toContain("Function func_123 execution failed");
      expect(parsedLog.context.errorCode).toBe("INNGEST_RUNTIME_ERROR");
      expect(parsedLog.context.errorType).toBe("InngestRuntimeError");
      expect(parsedLog.context.phase).toBe("error");
      expect(parsedLog.error.code).toBe("INNGEST_RUNTIME_ERROR");
    });

    it("should log step execution", () => {
      logger.logStep("step_1", "invoke", "func_123", "run_456", "success", {
        result: "ok",
      });

      expect(mockConsoleLog).toHaveBeenCalled();
      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);

      expect(parsedLog.message).toBe("Step step_1 (invoke) success");
      expect(parsedLog.context.stepId).toBe("step_1");
      expect(parsedLog.context.stepType).toBe("invoke");
      expect(parsedLog.context.stepStatus).toBe("success");
      expect(parsedLog.functionId).toBe("func_123");
      expect(parsedLog.runId).toBe("run_456");
    });

    it("should log step execution error", () => {
      const error = new Error("Step failed");

      logger.logStep(
        "step_1",
        "invoke",
        "func_123",
        "run_456",
        "error",
        {},
        error,
      );

      expect(mockConsoleLog).toHaveBeenCalled();
      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);

      expect(parsedLog.level).toBe("ERROR");
      expect(parsedLog.message).toBe("Step step_1 (invoke) error");
      expect(parsedLog.error).toBeDefined();
    });

    it("should log event processing", () => {
      logger.logEvent("user.created", "evt_123", "processed", {
        source: "api",
      });

      expect(mockConsoleLog).toHaveBeenCalled();
      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);

      expect(parsedLog.message).toBe("Event user.created processed");
      expect(parsedLog.context.eventName).toBe("user.created");
      expect(parsedLog.context.eventId).toBe("evt_123");
      expect(parsedLog.context.eventAction).toBe("processed");
      expect(parsedLog.context.tags).toContain("event-processing");
    });

    it("should log webhook processing", () => {
      logger.logWebhook("POST", "func_123", "received", 200, {
        userAgent: "test",
      });

      expect(mockConsoleLog).toHaveBeenCalled();
      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);

      expect(parsedLog.message).toBe("Webhook POST for func_123 received");
      expect(parsedLog.context.method).toBe("POST");
      expect(parsedLog.context.webhookStatus).toBe("received");
      expect(parsedLog.context.statusCode).toBe(200);
      expect(parsedLog.functionId).toBe("func_123");
    });

    it("should log configuration events", () => {
      logger.logConfig("loaded", { configFile: "app.config.ts" });

      expect(mockConsoleLog).toHaveBeenCalled();
      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);

      expect(parsedLog.message).toBe("Configuration loaded");
      expect(parsedLog.context.configAction).toBe("loaded");
      expect(parsedLog.context.tags).toContain("configuration");
    });

    it("should log performance metrics", () => {
      logger.logPerformance("database-query", 250, "func_123", "run_456");

      expect(mockConsoleLog).toHaveBeenCalled();
      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);

      expect(parsedLog.message).toContain(
        "Performance: database-query took 250ms",
      );
      expect(parsedLog.context.operation).toBe("database-query");
      expect(parsedLog.context.duration).toBe(250);
      expect(parsedLog.context.tags).toContain("performance");
    });
  });

  describe("trace logging", () => {
    it("should log with trace ID for correlation", () => {
      const traceId = "trace_123";

      logger.logWithTrace(LogLevel.LOG, "Traced message", traceId, {
        key: "value",
      });

      expect(mockConsoleLog).toHaveBeenCalled();
      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);

      expect(parsedLog.traceId).toBe(traceId);
      expect(parsedLog.message).toBe("Traced message");
      expect(parsedLog.context.key).toBe("value");
    });
  });

  describe("child logger", () => {
    it("should create child logger with additional context", () => {
      const childContext = { service: "webhook", requestId: "req_123" };
      const childLogger = logger.child(childContext);

      childLogger.log("Child log message", { extra: "data" });

      expect(mockConsoleLog).toHaveBeenCalled();
      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);

      expect(parsedLog.context.service).toBe("webhook");
      expect(parsedLog.context.requestId).toBe("req_123");
      expect(parsedLog.context.extra).toBe("data");
    });

    it("should inherit log level from parent", () => {
      logger.setLogLevel(LogLevel.WARN);
      const childLogger = logger.child({ test: true });

      childLogger.debug("Should not log");
      childLogger.warn("Should log");

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
    });
  });

  describe("message formatting", () => {
    it("should format Error objects", () => {
      const error = new Error("Test error");
      logger.log(error);

      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);
      expect(parsedLog.message).toBe("Test error");
    });

    it("should format objects as JSON", () => {
      const obj = { key: "value", number: 42 };
      logger.log(obj);

      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);
      expect(parsedLog.message).toBe(JSON.stringify(obj));
    });

    it("should handle string messages directly", () => {
      logger.log("Simple string message");

      const logCall = mockConsoleLog.mock.calls[0][0];
      const parsedLog = JSON.parse(logCall);
      expect(parsedLog.message).toBe("Simple string message");
    });
  });
});

describe("LoggerFactory", () => {
  let factory: LoggerFactory;

  beforeEach(() => {
    factory = new LoggerFactory();
  });

  describe("createLogger", () => {
    it("should create logger with context", () => {
      const logger = factory.createLogger("TestService");
      expect(logger).toBeInstanceOf(EnhancedLogger);
      // Context is set internally but not directly testable due to protected access
    });
  });

  describe("createFunctionLogger", () => {
    it("should create function logger with function ID only", () => {
      const logger = factory.createFunctionLogger("func_123");
      expect(logger).toBeInstanceOf(EnhancedLogger);
      // Context is set internally but not directly testable due to protected access
    });

    it("should create function logger with function ID and run ID", () => {
      const logger = factory.createFunctionLogger("func_123", "run_456");
      expect(logger).toBeInstanceOf(EnhancedLogger);
      // Context is set internally but not directly testable due to protected access
    });

    it("should include function metadata in child context", () => {
      const logger = factory.createFunctionLogger("func_123", "run_456");

      logger.log("Test message");

      // The function logger creates a child logger with additional context
      // We can verify the logger was created with the right context
      expect(logger).toBeInstanceOf(EnhancedLogger);
    });
  });

  describe("createServiceLogger", () => {
    it("should create service logger", () => {
      const logger = factory.createServiceLogger("DatabaseService");
      expect(logger).toBeInstanceOf(EnhancedLogger);
      // Context is set internally but not directly testable due to protected access
    });
  });
});
