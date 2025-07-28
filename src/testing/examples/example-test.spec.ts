import { Test, TestingModule } from "@nestjs/testing";
import {
  InngestTestingModule,
  InngestTestUtils,
  createInngestTestingModule,
} from "../inngest-testing.module";
import {
  MockInngestService,
  MockExecutionContextService,
  MockSignatureVerificationService,
} from "../mocks";
import { InngestService } from "../../services/inngest.service";
import { ExecutionContextService } from "../../services/execution-context.service";
import { SignatureVerificationService } from "../../services/signature-verification.service";
import { InngestController } from "../../controllers/inngest.controller";
import { InngestFunction } from "../../decorators/inngest-function.decorator";
import { FunctionRegistry } from "../../services/function-registry.service";

/**
 * Example service with Inngest functions for testing
 */
class ExampleService {
  @InngestFunction({
    id: "test-function",
    name: "Test Function",
    triggers: [{ event: "user.created" }],
  })
  async handleUserCreated(event: any, { step }: any) {
    // Example function logic
    const result = await step.run("process-user", async () => {
      return { userId: event.data.userId, processed: true };
    });

    await step.sendEvent("send-welcome-email", {
      name: "email.send",
      data: { userId: event.data.userId, template: "welcome" },
    });

    return result;
  }

  @InngestFunction({
    id: "cleanup-function",
    name: "Cleanup Function",
    triggers: [{ cron: "0 2 * * *" }],
  })
  async cleanupOldData(event: any, { step }: any) {
    await step.run("cleanup", async () => {
      // Cleanup logic
      return { cleaned: 100 };
    });
  }
}

describe("InngestTestingModule Examples", () => {
  describe("Unit Testing with Mocks", () => {
    let module: TestingModule;
    let mockInngestService: MockInngestService;
    let mockExecutionContext: MockExecutionContextService;

    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [InngestTestingModule.forUnitTest()],
        providers: [ExampleService],
      }).compile();

      mockInngestService = module.get<MockInngestService>(InngestService);
      mockExecutionContext = module.get<MockExecutionContextService>(
        ExecutionContextService,
      );
    });

    afterEach(async () => {
      await module.close();
    });

    it("should send events using mock service", async () => {
      // Create test event
      const testEvent = InngestTestUtils.createTestEvent(
        "user.created",
        {
          userId: "123",
          email: "test@example.com",
        },
        { user: { id: "test-user" } },
      );

      // Send event
      await mockInngestService.send(testEvent);

      // Assert event was sent
      mockInngestService.expectEventSent("user.created");
      mockInngestService.expectEventCount(1);

      const sentEvents = mockInngestService.getSentEvents();
      expect(sentEvents[0].data.userId).toBe("123");
    });

    it("should handle function execution with mocks", async () => {
      const service = module.get<ExampleService>(ExampleService);

      // Create test execution context
      const testEvent = InngestTestUtils.createTestEvent(
        "user.created",
        {
          userId: "123",
          email: "test@example.com",
        },
        { user: { id: "test-user" } },
      );

      const context = await mockExecutionContext.createExecutionContext(
        { id: "test-function", handler: service.handleUserCreated },
        testEvent,
        "run_123",
      );

      // Execute function using mock execution context
      const result = await mockExecutionContext.executeFunction(context);

      // Assert function was executed
      mockExecutionContext.expectFunctionExecuted();
      mockExecutionContext.expectContextCreated("test-function", "run_123");

      // Assert step methods were called
      expect(context.step.runMock).toHaveBeenCalledWith(
        "process-user",
        expect.any(Function),
      );
      expect(context.step.sendEventMock).toHaveBeenCalledWith(
        "send-welcome-email",
        expect.objectContaining({
          name: "email.send",
          data: { userId: "123", template: "welcome" },
        }),
      );
    });

    it("should test error scenarios", async () => {
      // Configure mock to throw error
      mockInngestService.mockSendError(new Error("Network error"));

      const testEvent = InngestTestUtils.createTestEvent(
        "user.created",
        { userId: "123" },
        { user: { id: "test-user" } },
      );

      // Expect send to throw error
      await expect(mockInngestService.send(testEvent)).rejects.toThrow(
        "Network error",
      );

      // Verify error handling
      mockInngestService.expectNoEventsSent();
    });
  });

  describe("Controller Testing", () => {
    let module: TestingModule;
    let controller: InngestController;
    let mockSignatureVerification: MockSignatureVerificationService;

    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [InngestTestingModule.forControllerTest()],
        providers: [ExampleService],
      }).compile();

      controller = module.get<InngestController>(InngestController);
      mockSignatureVerification = module.get<MockSignatureVerificationService>(
        SignatureVerificationService,
      );

      // Trigger function discovery for the ExampleService
      const functionRegistry = module.get<FunctionRegistry>(FunctionRegistry);
      await functionRegistry.onModuleInit();
    });

    afterEach(async () => {
      await module.close();
    });

    it("should handle webhook requests", async () => {
      const testEvent = InngestTestUtils.createTestEvent(
        "user.created",
        { userId: "123" },
        { user: { id: "test-user" } },
      );
      const webhookRequest = InngestTestUtils.createTestWebhookRequest(
        "test-function",
        testEvent,
      );

      // Mock successful signature verification
      mockSignatureVerification.mockVerificationSuccess();

      // Create mock request and response
      const mockRequest =
        MockSignatureVerificationService.createMockRequestWithSignature(
          webhookRequest,
        );
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Execute webhook
      await controller.handlePost(
        mockRequest as any,
        mockResponse,
        mockRequest.headers! as Record<string, string>,
        webhookRequest,
      );

      // Assert signature verification was called
      mockSignatureVerification.expectVerificationAttempted();

      // Assert response was sent
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "ok",
        }),
      );
    });

    it("should handle signature verification failure", async () => {
      const testEvent = InngestTestUtils.createTestEvent(
        "user.created",
        { userId: "123" },
        { user: { id: "test-user" } },
      );
      const webhookRequest = InngestTestUtils.createTestWebhookRequest(
        "test-function",
        testEvent,
      );

      // Mock signature verification failure
      mockSignatureVerification.mockVerificationFailure("Invalid signature");

      const mockRequest =
        MockSignatureVerificationService.createMockRequestWithInvalidSignature(
          webhookRequest,
        );
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Execute webhook - should handle error
      await controller.handlePost(
        mockRequest as any,
        mockResponse,
        mockRequest.headers! as Record<string, string>,
        webhookRequest,
      );

      // Assert error response
      expect(mockResponse.status).toHaveBeenCalledWith(expect.any(Number));
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Object),
        }),
      );
    });
  });

  describe("Integration Testing", () => {
    let module: TestingModule;

    beforeEach(async () => {
      module = await createInngestTestingModule({
        useRealServices: true,
        includeController: true,
        mockConfig: {
          appId: "test-app-integration",
          signingKey: "test-key-integration",
        },
      });
    });

    afterEach(async () => {
      await module.close();
    });

    it("should work with real services in test environment", async () => {
      const inngestService = module.get<InngestService>(InngestService);
      const executionContext = module.get<ExecutionContextService>(
        ExecutionContextService,
      );

      // Test with real services but test configuration
      expect(inngestService).toBeDefined();
      expect(executionContext).toBeDefined();

      // Services should be real instances, not mocks
      expect(inngestService).not.toBeInstanceOf(MockInngestService);
      expect(executionContext).not.toBeInstanceOf(MockExecutionContextService);
    });
  });

  describe("Testing Utilities", () => {
    it("should create test events with proper structure", () => {
      const event = InngestTestUtils.createTestEvent("user.created", {
        userId: "123",
        email: "test@example.com",
      });

      expect(event).toEqual({
        name: "user.created",
        data: { userId: "123", email: "test@example.com" },
        id: expect.stringMatching(/^test_\d+_[a-z0-9]+$/),
        ts: expect.any(Number),
        user: { id: "test-user" },
        v: "2022-04-21",
      });
    });

    it("should create webhook requests with proper structure", () => {
      const event = InngestTestUtils.createTestEvent("user.created", {
        userId: "123",
      });
      const webhookRequest = InngestTestUtils.createTestWebhookRequest(
        "test-function",
        event,
      );

      expect(webhookRequest).toEqual({
        function_id: "test-function",
        event,
        run_id: expect.stringMatching(/^run_\d+$/),
        attempt: 1,
        step: undefined,
        ctx: undefined,
      });
    });

    it("should create function metadata for testing", () => {
      const metadata = InngestTestUtils.createTestFunctionMetadata(
        "test-func",
        {
          name: "Test Function",
          trigger: { event: "test.event" },
        },
      );

      expect(metadata).toEqual({
        id: "test-func",
        name: "Test Function",
        trigger: { event: "test.event" },
        handler: expect.any(Function),
        config: {},
      });
    });

    it("should wait for specified time", async () => {
      const start = Date.now();
      await InngestTestUtils.wait(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow for timing variations
    });
  });

  describe("Advanced Mock Scenarios", () => {
    let module: TestingModule;
    let mockExecutionContext: MockExecutionContextService;

    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [InngestTestingModule.forUnitTest()],
        providers: [ExampleService],
      }).compile();

      mockExecutionContext = module.get<MockExecutionContextService>(
        ExecutionContextService,
      );
    });

    afterEach(async () => {
      await module.close();
    });

    it("should test step execution with custom results", async () => {
      const service = module.get<ExampleService>(ExampleService);
      const testEvent = InngestTestUtils.createTestEvent(
        "user.created",
        { userId: "123" },
        { user: { id: "test-user" } },
      );

      const context = await mockExecutionContext.createExecutionContext(
        { id: "test-function", handler: service.handleUserCreated },
        testEvent,
        "run_123",
      );

      // Configure step.run to return custom result
      context.step.runMock.mockResolvedValue({
        userId: "123",
        processed: true,
        custom: "data",
      });

      const result = await mockExecutionContext.executeFunction(context);

      expect(result).toEqual({
        userId: "123",
        processed: true,
        custom: "data",
      });
    });

    it("should test step failures", async () => {
      const service = module.get<ExampleService>(ExampleService);
      const testEvent = InngestTestUtils.createTestEvent(
        "user.created",
        { userId: "123" },
        { user: { id: "test-user" } },
      );

      const context = await mockExecutionContext.createExecutionContext(
        { id: "test-function", handler: service.handleUserCreated },
        testEvent,
        "run_123",
      );

      // Configure step.run to throw error
      context.step.runMock.mockImplementation(() => {
        throw new Error("Step failed");
      });

      await expect(
        mockExecutionContext.executeFunction(context),
      ).rejects.toThrow("Step failed");
    });

    it("should test async operations with delays", async () => {
      // Configure execution delay
      mockExecutionContext.mockExecutionDelay(100, { delayed: true });

      const testEvent = InngestTestUtils.createTestEvent(
        "user.created",
        { userId: "123" },
        { user: { id: "test-user" } },
      );
      const context = await mockExecutionContext.createExecutionContext(
        { id: "test-function" },
        testEvent,
        "run_123",
      );

      const start = Date.now();
      const result = await mockExecutionContext.executeFunction(context);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(95); // Allow for timing variations
      expect(result).toEqual({ delayed: true });
    });
  });
});
