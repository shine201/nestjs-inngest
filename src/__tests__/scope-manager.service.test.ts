import { Test, TestingModule } from "@nestjs/testing";
import { ModuleRef } from "@nestjs/core";
import {
  ScopeManagerService,
  InngestRequestContext,
} from "../services/scope-manager.service";
import { InngestEvent } from "../interfaces/inngest-event.interface";

// Mock service for testing scoped resolution
class MockScopedService {
  getValue() {
    return "scoped-value";
  }
}

class MockSingletonService {
  getValue() {
    return "singleton-value";
  }
}

describe("ScopeManagerService", () => {
  let service: ScopeManagerService;
  let moduleRef: jest.Mocked<ModuleRef>;

  beforeEach(async () => {
    const mockModuleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn(),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScopeManagerService,
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
        },
      ],
    }).compile();

    service = module.get<ScopeManagerService>(ScopeManagerService);
    moduleRef = module.get(ModuleRef);
  });

  afterEach(() => {
    service.clear();
  });

  describe("createExecutionScope", () => {
    it("should create execution scope successfully", () => {
      const requestContext: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-123",
        attempt: 1,
        functionId: "test-function",
        startTime: new Date(),
      };

      const contextId = service.createExecutionScope(requestContext);

      expect(contextId).toBeDefined();
      expect(moduleRef.registerRequestByContextId).toHaveBeenCalledWith(
        requestContext,
        contextId
      );
    });

    it("should handle scope creation errors", () => {
      const requestContext: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-123",
        attempt: 1,
        functionId: "test-function",
        startTime: new Date(),
      };

      moduleRef.registerRequestByContextId.mockImplementation(() => {
        throw new Error("Registration failed");
      });

      expect(() => service.createExecutionScope(requestContext)).toThrow(
        "Registration failed"
      );
    });

    it("should track active scopes", () => {
      const requestContext: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-123",
        attempt: 1,
        functionId: "test-function",
        startTime: new Date(),
      };

      expect(service.getActiveScopes()).toHaveLength(0);

      service.createExecutionScope(requestContext);

      const activeScopes = service.getActiveScopes();
      expect(activeScopes).toHaveLength(1);
      expect(activeScopes[0].requestContext).toBe(requestContext);
      expect(activeScopes[0].scopeKey).toBe("test-function-run-123-1");
    });
  });

  describe("resolveScoped", () => {
    let contextId: any;

    beforeEach(() => {
      const requestContext: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-123",
        attempt: 1,
        functionId: "test-function",
        startTime: new Date(),
      };

      contextId = service.createExecutionScope(requestContext);
    });

    it("should resolve scoped provider successfully", async () => {
      const mockService = new MockScopedService();
      moduleRef.resolve.mockResolvedValue(mockService);

      const result = await service.resolveScoped(MockScopedService, contextId);

      expect(result).toBe(mockService);
      expect(moduleRef.resolve).toHaveBeenCalledWith(
        MockScopedService,
        contextId,
        { strict: false }
      );
    });

    it("should fallback to singleton when scoped resolution fails", async () => {
      const mockService = new MockSingletonService();
      moduleRef.resolve.mockRejectedValue(
        new Error("Scoped resolution failed")
      );
      moduleRef.get.mockReturnValue(mockService);

      const result = await service.resolveScoped(
        MockSingletonService,
        contextId,
        { fallbackToSingleton: true }
      );

      expect(result).toBe(mockService);
      expect(moduleRef.resolve).toHaveBeenCalled();
      expect(moduleRef.get).toHaveBeenCalledWith(MockSingletonService, {
        strict: false,
      });
    });

    it("should not fallback when fallbackToSingleton is false", async () => {
      moduleRef.resolve.mockRejectedValue(
        new Error("Scoped resolution failed")
      );

      await expect(
        service.resolveScoped(MockScopedService, contextId, {
          fallbackToSingleton: false,
        })
      ).rejects.toThrow("Scoped resolution failed");

      expect(moduleRef.get).not.toHaveBeenCalled();
    });

    it("should handle fallback errors", async () => {
      moduleRef.resolve.mockRejectedValue(
        new Error("Scoped resolution failed")
      );
      moduleRef.get.mockImplementation(() => {
        throw new Error("Singleton resolution failed");
      });

      await expect(
        service.resolveScoped(MockScopedService, contextId)
      ).rejects.toThrow("Singleton resolution failed");
    });

    it("should support strict mode", async () => {
      const mockService = new MockScopedService();
      moduleRef.resolve.mockResolvedValue(mockService);

      await service.resolveScoped(MockScopedService, contextId, {
        strict: true,
      });

      expect(moduleRef.resolve).toHaveBeenCalledWith(
        MockScopedService,
        contextId,
        { strict: true }
      );
    });
  });

  describe("getRequestContext", () => {
    it("should return request context for valid scope", () => {
      const requestContext: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-123",
        attempt: 1,
        functionId: "test-function",
        startTime: new Date(),
      };

      const contextId = service.createExecutionScope(requestContext);
      const retrievedContext = service.getRequestContext(contextId);

      expect(retrievedContext).toBe(requestContext);
    });

    it("should return undefined for invalid scope", () => {
      const invalidContextId = "invalid-context-id";
      const retrievedContext = service.getRequestContext(invalidContextId);

      expect(retrievedContext).toBeUndefined();
    });
  });

  describe("cleanupScope", () => {
    it("should cleanup specific scope", () => {
      const requestContext: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-123",
        attempt: 1,
        functionId: "test-function",
        startTime: new Date(),
      };

      service.createExecutionScope(requestContext);
      expect(service.getActiveScopes()).toHaveLength(1);

      service.cleanupScope("test-function-run-123-1");
      expect(service.getActiveScopes()).toHaveLength(0);
    });

    it("should handle cleanup of non-existent scope", () => {
      expect(() => service.cleanupScope("non-existent-scope")).not.toThrow();
    });
  });

  describe("cleanupOldScopes", () => {
    it("should cleanup old scopes based on age", async () => {
      const oldRequestContext: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-123",
        attempt: 1,
        functionId: "test-function",
        startTime: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      };

      const newRequestContext: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-456",
        attempt: 1,
        functionId: "test-function",
        startTime: new Date(),
      };

      service.createExecutionScope(oldRequestContext);
      service.createExecutionScope(newRequestContext);

      expect(service.getActiveScopes()).toHaveLength(2);

      // Cleanup scopes older than 5 minutes
      const cleanedCount = service.cleanupOldScopes(5 * 60 * 1000);

      expect(cleanedCount).toBe(1);
      expect(service.getActiveScopes()).toHaveLength(1);
      expect(service.getActiveScopes()[0].requestContext.runId).toBe("run-456");
    });

    it("should not cleanup recent scopes", () => {
      const requestContext: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-123",
        attempt: 1,
        functionId: "test-function",
        startTime: new Date(),
      };

      service.createExecutionScope(requestContext);
      expect(service.getActiveScopes()).toHaveLength(1);

      const cleanedCount = service.cleanupOldScopes(5 * 60 * 1000);

      expect(cleanedCount).toBe(0);
      expect(service.getActiveScopes()).toHaveLength(1);
    });
  });

  describe("getScopeStats", () => {
    it("should return empty stats when no scopes exist", () => {
      const stats = service.getScopeStats();

      expect(stats).toEqual({
        activeScopes: 0,
        scopesByFunction: {},
        averageAge: 0,
        oldestScope: undefined,
      });
    });

    it("should return correct stats for active scopes", () => {
      const requestContext1: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-123",
        attempt: 1,
        functionId: "function-1",
        startTime: new Date(Date.now() - 1000), // 1 second ago
      };

      const requestContext2: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-456",
        attempt: 1,
        functionId: "function-1",
        startTime: new Date(Date.now() - 2000), // 2 seconds ago
      };

      const requestContext3: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-789",
        attempt: 1,
        functionId: "function-2",
        startTime: new Date(Date.now() - 3000), // 3 seconds ago
      };

      service.createExecutionScope(requestContext1);
      service.createExecutionScope(requestContext2);
      service.createExecutionScope(requestContext3);

      const stats = service.getScopeStats();

      expect(stats.activeScopes).toBe(3);
      expect(stats.scopesByFunction["function-1"]).toBe(2);
      expect(stats.scopesByFunction["function-2"]).toBe(1);
      expect(stats.averageAge).toBeGreaterThan(0);
      expect(stats.oldestScope).toBeDefined();
      expect(stats.oldestScope!.scopeKey).toBe("function-2-run-789-1");
    });
  });

  describe("clear", () => {
    it("should clear all scopes", () => {
      const requestContext1: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-123",
        attempt: 1,
        functionId: "test-function",
        startTime: new Date(),
      };

      const requestContext2: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-456",
        attempt: 1,
        functionId: "test-function",
        startTime: new Date(),
      };

      service.createExecutionScope(requestContext1);
      service.createExecutionScope(requestContext2);

      expect(service.getActiveScopes()).toHaveLength(2);

      service.clear();

      expect(service.getActiveScopes()).toHaveLength(0);
    });
  });

  describe("request context with metadata", () => {
    it("should handle request context with additional metadata", () => {
      const requestContext: InngestRequestContext = {
        event: { name: "test.event", data: { message: "test" } },
        runId: "run-123",
        attempt: 1,
        functionId: "test-function",
        startTime: new Date(),
        metadata: {
          userId: "user-123",
          traceId: "trace-456",
          customData: { key: "value" },
        },
      };

      const contextId = service.createExecutionScope(requestContext);
      const retrievedContext = service.getRequestContext(contextId);

      expect(retrievedContext?.metadata).toEqual({
        userId: "user-123",
        traceId: "trace-456",
        customData: { key: "value" },
      });
    });
  });
});
