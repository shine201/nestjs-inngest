import { Test, TestingModule } from "@nestjs/testing";
import { DiscoveryService, MetadataScanner, ModuleRef } from "@nestjs/core";
import { FunctionRegistry } from "../services/function-registry.service";
import { InngestFunction } from "../decorators/inngest-function.decorator";
import { InngestFunctionConfig } from "../interfaces/inngest-function.interface";
import { InngestFunctionError } from "../errors";
import { ERROR_MESSAGES } from "../constants";

// Mock classes for testing
class TestService1 {
  @InngestFunction({
    id: "test-function-1",
    name: "Test Function 1",
    triggers: [{ event: "test.event1" }],
  })
  async handleEvent1() {
    return "handled1";
  }

  @InngestFunction({
    id: "test-function-2",
    triggers: [{ cron: "0 0 * * *" }],
    retries: 5,
  })
  async handleCron() {
    return "handled2";
  }
}

class TestService2 {
  @InngestFunction({
    id: "test-function-3",
    triggers: [{ event: "test.event2", if: "event.data.important === true" }],
    concurrency: 10,
  })
  async handleEvent2() {
    return "handled3";
  }
}

class RegularService {
  regularMethod() {
    return "regular";
  }
}

describe("FunctionRegistry", () => {
  let registry: FunctionRegistry;
  let discoveryService: jest.Mocked<DiscoveryService>;
  let metadataScanner: jest.Mocked<MetadataScanner>;
  let moduleRef: jest.Mocked<ModuleRef>;

  beforeEach(async () => {
    const mockDiscoveryService = {
      getProviders: jest.fn(),
    };

    const mockMetadataScanner = {
      scanFromPrototype: jest.fn(),
    };

    const mockModuleRef = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FunctionRegistry,
        {
          provide: DiscoveryService,
          useValue: mockDiscoveryService,
        },
        {
          provide: MetadataScanner,
          useValue: mockMetadataScanner,
        },
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
        },
      ],
    }).compile();

    registry = module.get<FunctionRegistry>(FunctionRegistry);
    discoveryService = module.get(DiscoveryService);
    metadataScanner = module.get(MetadataScanner);
    moduleRef = module.get(ModuleRef);
  });

  afterEach(() => {
    registry.clear();
  });

  describe("initialization", () => {
    it("should be defined", () => {
      expect(registry).toBeDefined();
    });

    it("should discover functions on module init", async () => {
      const testService1 = new TestService1();
      const testService2 = new TestService2();
      const regularService = new RegularService();

      discoveryService.getProviders.mockReturnValue([
        {
          metatype: TestService1,
          instance: testService1,
        },
        {
          metatype: TestService2,
          instance: testService2,
        },
        {
          metatype: RegularService,
          instance: regularService,
        },
        {
          metatype: null,
          instance: null,
        },
      ] as any);

      await registry.onModuleInit();

      expect(registry.getFunctionCount()).toBe(3);
      expect(registry.hasFunction("test-function-1")).toBe(true);
      expect(registry.hasFunction("test-function-2")).toBe(true);
      expect(registry.hasFunction("test-function-3")).toBe(true);
    });
  });

  describe("function registration", () => {
    it("should register functions correctly", async () => {
      const testService = new TestService1();
      const config: InngestFunctionConfig = {
        id: "manual-function",
        triggers: [{ event: "manual.event" }],
      };

      await registry.registerFunction(testService, "handleEvent1", config);

      expect(registry.hasFunction("manual-function")).toBe(true);
      const metadata = registry.getFunction("manual-function");
      expect(metadata).toBeDefined();
      expect(metadata!.config.id).toBe("manual-function");
      expect(metadata!.target).toBe(testService);
      expect(metadata!.propertyKey).toBe("handleEvent1");
    });

    it("should prevent duplicate function IDs", async () => {
      const testService1 = new TestService1();
      const testService2 = new TestService2();

      const config: InngestFunctionConfig = {
        id: "duplicate-id",
        triggers: [{ event: "test.event" }],
      };

      await registry.registerFunction(testService1, "handleEvent1", config);

      await expect(
        registry.registerFunction(testService2, "handleEvent2", config)
      ).rejects.toThrow(ERROR_MESSAGES.DUPLICATE_FUNCTION_ID);
    });

    it("should validate that method exists and is callable", async () => {
      const testService = new TestService1();
      const config: InngestFunctionConfig = {
        id: "invalid-method",
        triggers: [{ event: "test.event" }],
      };

      await expect(
        registry.registerFunction(testService, "nonExistentMethod", config)
      ).rejects.toThrow('Method "nonExistentMethod" is not a function');
    });

    it("should bind methods to their instances", async () => {
      const testService = new TestService1();
      const config: InngestFunctionConfig = {
        id: "bound-function",
        triggers: [{ event: "test.event" }],
      };

      await registry.registerFunction(testService, "handleEvent1", config);

      const metadata = registry.getFunction("bound-function");

      // Mock context for testing
      const mockContext = {
        event: { name: "test.event", data: {} },
        step: {
          run: jest.fn(),
          sleep: jest.fn(),
          waitForEvent: jest.fn(),
          sendEvent: jest.fn(),
          invoke: jest.fn(),
        },
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
        },
        runId: "test-run-id",
        attempt: 1,
      };

      const result = await metadata!.handler(mockContext);
      expect(result).toBe("handled1");
    });
  });

  describe("function retrieval", () => {
    beforeEach(async () => {
      const testService1 = new TestService1();
      const testService2 = new TestService2();

      discoveryService.getProviders.mockReturnValue([
        {
          metatype: TestService1,
          instance: testService1,
        },
        {
          metatype: TestService2,
          instance: testService2,
        },
      ] as any);

      await registry.onModuleInit();
    });

    it("should get all functions", () => {
      const functions = registry.getFunctions();
      expect(functions).toHaveLength(3);
      expect(functions.map((f) => f.config.id)).toEqual(
        expect.arrayContaining([
          "test-function-1",
          "test-function-2",
          "test-function-3",
        ])
      );
    });

    it("should get specific function by ID", () => {
      const func = registry.getFunction("test-function-1");
      expect(func).toBeDefined();
      expect(func!.config.name).toBe("Test Function 1");
    });

    it("should return undefined for non-existent function", () => {
      const func = registry.getFunction("non-existent");
      expect(func).toBeUndefined();
    });

    it("should get functions by class", () => {
      const functions = registry.getFunctionsByClass(TestService1);
      expect(functions).toHaveLength(2);
      expect(functions.map((f) => f.config.id)).toEqual(
        expect.arrayContaining(["test-function-1", "test-function-2"])
      );
    });

    it("should get function IDs", () => {
      const ids = registry.getFunctionIds();
      expect(ids).toHaveLength(3);
      expect(ids).toEqual(
        expect.arrayContaining([
          "test-function-1",
          "test-function-2",
          "test-function-3",
        ])
      );
    });

    it("should get function count", () => {
      expect(registry.getFunctionCount()).toBe(3);
    });
  });

  describe("Inngest function creation", () => {
    beforeEach(async () => {
      const testService1 = new TestService1();
      const testService2 = new TestService2();

      discoveryService.getProviders.mockReturnValue([
        {
          metatype: TestService1,
          instance: testService1,
        },
        {
          metatype: TestService2,
          instance: testService2,
        },
      ] as any);

      await registry.onModuleInit();
    });

    it("should create Inngest function definitions", () => {
      const inngestFunctions = registry.createInngestFunctions();
      expect(inngestFunctions).toHaveLength(3);

      const func1 = inngestFunctions.find((f) => f.id === "test-function-1");
      expect(func1).toBeDefined();
      expect(func1.name).toBe("Test Function 1");
      expect(func1.triggers).toEqual([{ event: "test.event1" }]);
      expect(typeof func1.handler).toBe("function");

      const func2 = inngestFunctions.find((f) => f.id === "test-function-2");
      expect(func2).toBeDefined();
      expect(func2.name).toBe("test-function-2"); // Default to ID
      expect(func2.triggers).toEqual([{ cron: "0 0 * * *" }]);
      expect(func2.retries).toBe(5);

      const func3 = inngestFunctions.find((f) => f.id === "test-function-3");
      expect(func3).toBeDefined();
      expect(func3.triggers).toEqual([
        { event: "test.event2", if: "event.data.important === true" },
      ]);
      expect(func3.concurrency).toBe(10);
    });

    it("should handle function creation errors", async () => {
      // Register a valid function first
      const testService = new TestService1();
      const config: InngestFunctionConfig = {
        id: "test-function",
        triggers: [{ event: "test.event" }],
      };

      await registry.registerFunction(testService, "handleEvent1", config);

      // Mock the handler to be invalid after registration
      const metadata = registry.getFunction("test-function")!;
      metadata.handler = "not a function" as any;

      expect(() => registry.createInngestFunctions()).toThrow(
        InngestFunctionError
      );
    });
  });

  describe("validation", () => {
    it("should validate all functions successfully", async () => {
      const testService = new TestService1();
      discoveryService.getProviders.mockReturnValue([
        {
          metatype: TestService1,
          instance: testService,
        },
      ] as any);

      await registry.onModuleInit();

      expect(() => registry.validateFunctions()).not.toThrow();
    });

    it("should detect invalid handlers", async () => {
      const testService = new TestService1();
      await registry.registerFunction(testService, "handleEvent1", {
        id: "test-function",
        triggers: [{ event: "test.event" }],
      });

      // Corrupt the handler
      const metadata = registry.getFunction("test-function")!;
      metadata.handler = "not a function" as any;

      expect(() => registry.validateFunctions()).toThrow(InngestFunctionError);
    });

    it("should detect missing targets", async () => {
      const testService = new TestService1();
      await registry.registerFunction(testService, "handleEvent1", {
        id: "test-function",
        triggers: [{ event: "test.event" }],
      });

      // Corrupt the target
      const metadata = registry.getFunction("test-function")!;
      metadata.target = null;

      expect(() => registry.validateFunctions()).toThrow(InngestFunctionError);
    });
  });

  describe("statistics", () => {
    beforeEach(async () => {
      const testService1 = new TestService1();
      const testService2 = new TestService2();

      discoveryService.getProviders.mockReturnValue([
        {
          metatype: TestService1,
          instance: testService1,
        },
        {
          metatype: TestService2,
          instance: testService2,
        },
      ] as any);

      await registry.onModuleInit();
    });

    it("should provide registry statistics", () => {
      const stats = registry.getStats();

      expect(stats.totalFunctions).toBe(3);
      expect(stats.functionsByTriggerType.event).toBe(2);
      expect(stats.functionsByTriggerType.cron).toBe(1);
      expect(stats.functionsByClass.TestService1).toBe(2);
      expect(stats.functionsByClass.TestService2).toBe(1);
    });
  });

  describe("utility methods", () => {
    it("should clear registry", async () => {
      const testService = new TestService1();
      await registry.registerFunction(testService, "handleEvent1", {
        id: "test-function",
        triggers: [{ event: "test.event" }],
      });

      expect(registry.getFunctionCount()).toBe(1);

      registry.clear();

      expect(registry.getFunctionCount()).toBe(0);
      expect(registry.hasFunction("test-function")).toBe(false);
    });
  });
});
