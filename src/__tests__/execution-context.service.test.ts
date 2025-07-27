import { Test, TestingModule } from "@nestjs/testing";
import { ModuleRef } from "@nestjs/core";
import { ExecutionContextService } from "../services/execution-context.service";
import { InngestService } from "../services/inngest.service";
import { InngestFunction } from "../decorators/inngest-function.decorator";
import { InngestFunctionMetadata } from "../interfaces/inngest-function.interface";
import { InngestEvent } from "../interfaces/inngest-event.interface";
import { InngestRuntimeError } from "../errors";

// Mock service for testing
class TestService {
  @InngestFunction({
    id: "test-function",
    triggers: [{ event: "test.event" }],
  })
  async handleEvent(context: any) {
    return `Handled event: ${context.event.name}`;
  }

  async methodWithDependency(context: any) {
    return "Method with dependency called";
  }
}

// Mock scoped service
class ScopedService {
  getValue() {
    return "scoped-value";
  }
}

describe("ExecutionContextService", () => {
  let service: ExecutionContextService;
  let moduleRef: jest.Mocked<ModuleRef>;
  let mockInngestService: jest.Mocked<InngestService>;

  beforeEach(async () => {
    mockInngestService = {
      send: jest.fn(),
      sendBatch: jest.fn(),
    } as any;

    const mockModuleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn(),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionContextService,
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
        },
        {
          provide: InngestService,
          useValue: mockInngestService,
        },
      ],
    }).compile();

    service = module.get<ExecutionContextService>(ExecutionContextService);
    moduleRef = module.get(ModuleRef);
  });

  afterEach(() => {
    service.clear();
  });

  describe("createExecutionContext", () => {
    it("should create execution context successfully", async () => {
      const testService = new TestService();
      const functionMetadata: InngestFunctionMetadata = {
        target: testService,
        propertyKey: "handleEvent",
        config: {
          id: "test-function",
          name: "Test Function",
          triggers: [{ event: "test.event" }],
        },
        handler: testService.handleEvent.bind(testService),
      };

      const event: InngestEvent = {
        name: "test.event",
        data: { message: "test" },
      };

      const context = await service.createExecutionContext(
        functionMetadata,
        event,
        "run-123",
        1
      );

      expect(context).toBeDefined();
      expect(context.executionId).toBe("test-function-run-123-1");
      expect(context.functionMetadata).toBe(functionMetadata);
      expect(context.inngestContext.event).toBe(event);
      expect(context.inngestContext.runId).toBe("run-123");
      expect(context.inngestContext.attempt).toBe(1);
      expect(context.startTime).toBeInstanceOf(Date);

      expect(moduleRef.registerRequestByContextId).toHaveBeenCalledWith(
        {
          event,
          runId: "run-123",
          attempt: 1,
          functionId: "test-function",
        },
        expect.any(Object)
      );
    });

    it("should handle context creation errors", async () => {
      const testService = new TestService();
      const functionMetadata: InngestFunctionMetadata = {
        target: testService,
        propertyKey: "handleEvent",
        config: {
          id: "test-function",
          triggers: [{ event: "test.event" }],
        },
        handler: testService.handleEvent.bind(testService),
      };

      const event: InngestEvent = {
        name: "test.event",
        data: { message: "test" },
      };

      // Mock registerRequestByContextId to throw an error
      moduleRef.registerRequestByContextId.mockImplementation(() => {
        throw new Error("Context registration failed");
      });

      await expect(
        service.createExecutionContext(functionMetadata, event, "run-123", 1)
      ).rejects.toThrow(InngestRuntimeError);
    });
  });

  describe("executeFunction", () => {
    it("should execute function successfully", async () => {
      const testService = new TestService();
      const functionMetadata: InngestFunctionMetadata = {
        target: testService,
        propertyKey: "handleEvent",
        config: {
          id: "test-function",
          triggers: [{ event: "test.event" }],
        },
        handler: testService.handleEvent.bind(testService),
      };

      const event: InngestEvent = {
        name: "test.event",
        data: { message: "test" },
      };

      // Mock moduleRef.resolve to return the test service
      moduleRef.resolve.mockResolvedValue(testService);

      const context = await service.createExecutionContext(
        functionMetadata,
        event,
        "run-123",
        1
      );

      const result = await service.executeFunction(context);

      expect(result).toBe("Handled event: test.event");
      expect(moduleRef.resolve).toHaveBeenCalledWith(
        TestService,
        expect.any(Object)
      );
    });

    it("should fallback to moduleRef.get for singleton providers", async () => {
      const testService = new TestService();
      const functionMetadata: InngestFunctionMetadata = {
        target: testService,
        propertyKey: "handleEvent",
        config: {
          id: "test-function",
          triggers: [{ event: "test.event" }],
        },
        handler: testService.handleEvent.bind(testService),
      };

      const event: InngestEvent = {
        name: "test.event",
        data: { message: "test" },
      };

      // Mock resolve to fail, but get to succeed
      moduleRef.resolve.mockRejectedValue(new Error("Resolve failed"));
      moduleRef.get.mockReturnValue(testService);

      const context = await service.createExecutionContext(
        functionMetadata,
        event,
        "run-123",
        1
      );

      const result = await service.executeFunction(context);

      expect(result).toBe("Handled event: test.event");
      expect(moduleRef.resolve).toHaveBeenCalled();
      expect(moduleRef.get).toHaveBeenCalledWith(TestService);
    });

    it("should handle function execution errors", async () => {
      const testService = new TestService();
      // Mock the method to throw an error
      testService.handleEvent = jest
        .fn()
        .mockRejectedValue(new Error("Function failed"));

      const functionMetadata: InngestFunctionMetadata = {
        target: testService,
        propertyKey: "handleEvent",
        config: {
          id: "test-function",
          triggers: [{ event: "test.event" }],
        },
        handler: testService.handleEvent.bind(testService),
      };

      const event: InngestEvent = {
        name: "test.event",
        data: { message: "test" },
      };

      moduleRef.resolve.mockResolvedValue(testService);

      const context = await service.createExecutionContext(
        functionMetadata,
        event,
        "run-123",
        1
      );

      await expect(service.executeFunction(context)).rejects.toThrow(
        InngestRuntimeError
      );
    });

    it("should handle dependency resolution errors", async () => {
      const testService = new TestService();
      const functionMetadata: InngestFunctionMetadata = {
        target: testService,
        propertyKey: "handleEvent",
        config: {
          id: "test-function",
          triggers: [{ event: "test.event" }],
        },
        handler: testService.handleEvent.bind(testService),
      };

      const event: InngestEvent = {
        name: "test.event",
        data: { message: "test" },
      };

      // Mock both resolve and get to fail
      moduleRef.resolve.mockRejectedValue(new Error("Resolve failed"));
      moduleRef.get.mockImplementation(() => {
        throw new Error("Get failed");
      });

      const context = await service.createExecutionContext(
        functionMetadata,
        event,
        "run-123",
        1
      );

      await expect(service.executeFunction(context)).rejects.toThrow(
        InngestRuntimeError
      );
    });
  });

  describe("step tools", () => {
    let executionContext: any;

    beforeEach(async () => {
      const testService = new TestService();
      const functionMetadata: InngestFunctionMetadata = {
        target: testService,
        propertyKey: "handleEvent",
        config: {
          id: "test-function",
          triggers: [{ event: "test.event" }],
        },
        handler: testService.handleEvent.bind(testService),
      };

      const event: InngestEvent = {
        name: "test.event",
        data: { message: "test" },
      };

      executionContext = await service.createExecutionContext(
        functionMetadata,
        event,
        "run-123",
        1
      );
    });

    describe("step.run", () => {
      it("should execute step function successfully", async () => {
        const stepFn = jest.fn().mockResolvedValue("step result");

        const result = await executionContext.inngestContext.step.run(
          "test-step",
          stepFn
        );

        expect(result).toBe("step result");
        expect(stepFn).toHaveBeenCalled();
      });

      it("should handle step function errors", async () => {
        const stepFn = jest.fn().mockRejectedValue(new Error("Step failed"));

        await expect(
          executionContext.inngestContext.step.run("test-step", stepFn)
        ).rejects.toThrow("Step failed");
      });
    });

    describe("step.sleep", () => {
      it("should handle numeric duration", async () => {
        const startTime = Date.now();
        await executionContext.inngestContext.step.sleep(10);
        const endTime = Date.now();

        expect(endTime - startTime).toBeGreaterThanOrEqual(10);
      });

      it("should parse string durations", async () => {
        // Test with a very short duration to avoid long test times
        const startTime = Date.now();
        await executionContext.inngestContext.step.sleep("10ms");
        const endTime = Date.now();

        expect(endTime - startTime).toBeGreaterThanOrEqual(10);
      });

      it("should handle invalid duration format", async () => {
        await expect(
          executionContext.inngestContext.step.sleep("invalid")
        ).rejects.toThrow("Invalid duration format");
      });
    });

    describe("step.sendEvent", () => {
      beforeEach(() => {
        moduleRef.resolve.mockResolvedValue(mockInngestService);
      });

      it("should send single event", async () => {
        const event: InngestEvent = {
          name: "test.event",
          data: { message: "test" },
        };

        await executionContext.inngestContext.step.sendEvent(event);

        expect(mockInngestService.send).toHaveBeenCalledWith(event);
      });

      it("should send batch of events", async () => {
        const events: InngestEvent[] = [
          { name: "test.event1", data: { message: "test1" } },
          { name: "test.event2", data: { message: "test2" } },
        ];

        await executionContext.inngestContext.step.sendEvent(events);

        expect(mockInngestService.sendBatch).toHaveBeenCalledWith(events);
      });
    });

    describe("step.waitForEvent", () => {
      it("should throw error indicating Inngest integration needed", async () => {
        await expect(
          executionContext.inngestContext.step.waitForEvent("test.event")
        ).rejects.toThrow(
          "waitForEvent requires Inngest step system integration"
        );
      });
    });

    describe("step.invoke", () => {
      it("should throw error indicating Inngest integration needed", async () => {
        await expect(
          executionContext.inngestContext.step.invoke("other-function")
        ).rejects.toThrow(
          "invoke requires Inngest function invocation system integration"
        );
      });
    });
  });

  describe("context logger", () => {
    it("should create context-aware logger", async () => {
      const testService = new TestService();
      const functionMetadata: InngestFunctionMetadata = {
        target: testService,
        propertyKey: "handleEvent",
        config: {
          id: "test-function",
          triggers: [{ event: "test.event" }],
        },
        handler: testService.handleEvent.bind(testService),
      };

      const event: InngestEvent = {
        name: "test.event",
        data: { message: "test" },
      };

      const context = await service.createExecutionContext(
        functionMetadata,
        event,
        "run-123",
        1
      );

      const logger = context.inngestContext.logger;

      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.debug).toBeDefined();

      // Test that logger methods don't throw
      expect(() => {
        logger.info("Test message");
        logger.warn("Test warning");
        logger.error("Test error");
        logger.debug("Test debug");
      }).not.toThrow();
    });
  });

  describe("utility methods", () => {
    it("should track active executions", async () => {
      const testService = new TestService();
      const functionMetadata: InngestFunctionMetadata = {
        target: testService,
        propertyKey: "handleEvent",
        config: {
          id: "test-function",
          triggers: [{ event: "test.event" }],
        },
        handler: testService.handleEvent.bind(testService),
      };

      const event: InngestEvent = {
        name: "test.event",
        data: { message: "test" },
      };

      expect(service.getActiveExecutions()).toHaveLength(0);

      const context = await service.createExecutionContext(
        functionMetadata,
        event,
        "run-123",
        1
      );

      expect(service.getActiveExecutions()).toHaveLength(1);
      expect(service.getActiveExecutions()[0]).toBe(context);
    });

    it("should provide execution statistics", async () => {
      const stats = service.getExecutionStats();

      expect(stats).toEqual({
        activeExecutions: 0,
        executionsByFunction: {},
        averageExecutionTime: 0,
      });
    });

    it("should clear all execution contexts", async () => {
      const testService = new TestService();
      const functionMetadata: InngestFunctionMetadata = {
        target: testService,
        propertyKey: "handleEvent",
        config: {
          id: "test-function",
          triggers: [{ event: "test.event" }],
        },
        handler: testService.handleEvent.bind(testService),
      };

      const event: InngestEvent = {
        name: "test.event",
        data: { message: "test" },
      };

      await service.createExecutionContext(
        functionMetadata,
        event,
        "run-123",
        1
      );
      expect(service.getActiveExecutions()).toHaveLength(1);

      service.clear();
      expect(service.getActiveExecutions()).toHaveLength(0);
    });
  });

  describe("duration parsing", () => {
    it("should parse various duration formats", async () => {
      const testService = new TestService();
      const functionMetadata: InngestFunctionMetadata = {
        target: testService,
        propertyKey: "handleEvent",
        config: {
          id: "test-function",
          triggers: [{ event: "test.event" }],
        },
        handler: testService.handleEvent.bind(testService),
      };

      const event: InngestEvent = {
        name: "test.event",
        data: { message: "test" },
      };

      const context = await service.createExecutionContext(
        functionMetadata,
        event,
        "run-123",
        1
      );

      // Test different duration formats (using very short durations for testing)
      await expect(
        context.inngestContext.step.sleep("1ms")
      ).resolves.not.toThrow();
      await expect(
        context.inngestContext.step.sleep("0.001s")
      ).resolves.not.toThrow();
    });
  });
});
