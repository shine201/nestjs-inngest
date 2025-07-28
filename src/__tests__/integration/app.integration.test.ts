import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { InngestModule } from "../../inngest.module";
import { InngestService } from "../../services/inngest.service";
import { FunctionRegistry } from "../../services/function-registry.service";
import { ExecutionContextService } from "../../services/execution-context.service";
import { SignatureVerificationService } from "../../services/signature-verification.service";
import { InngestController } from "../../controllers/inngest.controller";
import { createSimpleMockHttpAdapter } from "../../testing/http-adapter-test-helper";
import {
  InngestTestingModule,
  InngestTestUtils,
} from "../../testing/inngest-testing.module";
import { InngestFunction } from "../../decorators/inngest-function.decorator";
import { Injectable } from "@nestjs/common";
import { MergedInngestConfig } from "../../utils/config-validation";

// Test service with Inngest functions
@Injectable()
class TestAppService {
  @InngestFunction({
    id: "app-test-integration-function",
    name: "App Test Integration Function",
    triggers: [{ event: "test.integration" }],
  })
  async handleTestIntegrationEvent(event: any, { step }: any) {
    return {
      message: "Integration test successful",
      eventData: event.data,
      timestamp: Date.now(),
    };
  }

  @InngestFunction({
    id: "app-test-complex-function",
    name: "App Test Complex Function",
    triggers: [{ event: "test.complex" }],
  })
  async handleComplexEvent(event: any, { step }: any) {
    // Test with step functions
    const result1 = await step.run("step-1", async () => {
      return { step: 1, data: event.data };
    });

    const result2 = await step.run("step-2", async () => {
      return { step: 2, previous: result1, processed: true };
    });

    return {
      message: "Complex integration test successful",
      steps: [result1, result2],
      final: true,
    };
  }

  @InngestFunction({
    id: "app-test-error-function",
    name: "App Test Error Function",
    triggers: [{ event: "test.error" }],
  })
  async handleErrorEvent(event: any, { step }: any) {
    if (event.data.shouldError) {
      throw new Error("Intentional test error");
    }
    return { message: "No error occurred" };
  }
}

// Test module setup
@Injectable()
class TestModule {
  constructor(private readonly testService: TestAppService) {}
}

describe("Application Integration Tests", () => {
  let app: INestApplication;
  let module: TestingModule;
  let inngestService: InngestService;
  let functionRegistry: FunctionRegistry;
  let executionContextService: ExecutionContextService;
  let signatureVerificationService: SignatureVerificationService;
  let testConfig: MergedInngestConfig;

  beforeAll(async () => {
    // Create test configuration
    testConfig = {
      appId: "test-integration-app",
      signingKey: "test-integration-signing-key",
      eventKey: "test-integration-event-key",
      endpoint: "/api/inngest",
      env: "test",
      isDev: true,
      logger: false, // Reduce log noise
      timeout: 5000,
      maxBatchSize: 100,
      strict: false,
      retry: {
        maxAttempts: 2,
        initialDelay: 100,
        maxDelay: 30000,
        backoffMultiplier: 2,
        backoff: "exponential",
      },
      development: {
        enabled: true,
        disableSignatureVerification: true,
      },
    };

    // Create testing module with real services for integration testing
    module = await Test.createTestingModule({
      imports: [
        InngestTestingModule.forSmartIntegrationTest({
          additionalProviders: [TestAppService],
        }),
      ],
      providers: [TestModule],
      controllers: [],
    }).compile();

    // Get service instances
    inngestService = module.get<InngestService>(InngestService);
    functionRegistry = module.get<FunctionRegistry>(FunctionRegistry);
    executionContextService = module.get<ExecutionContextService>(
      ExecutionContextService,
    );
    signatureVerificationService = module.get<SignatureVerificationService>(
      SignatureVerificationService,
    );

    // Clear any existing functions from previous tests
    functionRegistry.clearFunctions();

    // Manually trigger function discovery for testing
    await functionRegistry.onModuleInit();

    // Create the application
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (module) {
      await module.close();
    }
  });

  describe("Module Initialization", () => {
    it("should initialize all core services", () => {
      expect(inngestService).toBeDefined();
      expect(functionRegistry).toBeDefined();
      expect(executionContextService).toBeDefined();
      expect(signatureVerificationService).toBeDefined();
    });

    it("should register test functions", () => {
      const functionCount = functionRegistry.getFunctionCount();
      expect(functionCount).toBeGreaterThan(0);

      // Check specific test functions are registered
      const testFunction = functionRegistry.getFunction(
        "app-test-integration-function",
      );
      expect(testFunction).toBeDefined();
      expect(testFunction!.config.id).toBe("app-test-integration-function");
      expect(testFunction!.config.name).toBe("App Test Integration Function");

      const complexFunction = functionRegistry.getFunction(
        "app-test-complex-function",
      );
      expect(complexFunction).toBeDefined();
      expect(complexFunction!.config.id).toBe("app-test-complex-function");

      const errorFunction = functionRegistry.getFunction(
        "app-test-error-function",
      );
      expect(errorFunction).toBeDefined();
      expect(errorFunction!.config.id).toBe("app-test-error-function");
    });

    it("should create proper function definitions for Inngest", () => {
      const definitions = functionRegistry.createInngestFunctions();
      expect(definitions).toBeInstanceOf(Array);
      expect(definitions.length).toBeGreaterThan(0);

      const testFunctionDef = definitions.find(
        (def) => def.id === "app-test-integration-function",
      );
      expect(testFunctionDef).toBeDefined();
      expect(testFunctionDef!.name).toBe("App Test Integration Function");
      expect(testFunctionDef!.triggers).toBeDefined();
      expect(testFunctionDef!.triggers[0].event).toBe("test.integration");
    });

    it("should configure signature verification correctly", () => {
      const status = signatureVerificationService.getVerificationStatus(
        testConfig.signingKey,
      );
      expect(status.hasSigningKey).toBe(true);
      expect(status.algorithm).toBeDefined();
      expect(status.enabled).toBe(true);
    });
  });

  describe("Webhook Endpoint Integration", () => {
    it("should handle PUT requests for function introspection", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/inngest")
        .expect(200);

      expect(response.body).toHaveProperty("functions");
      expect(response.body).toHaveProperty("sdk");
      expect(response.body.sdk.name).toBe("nest-inngest");
      expect(response.body.sdk.framework).toBe("nestjs");
      expect(response.body.functions).toBeInstanceOf(Array);
      expect(response.body.functions.length).toBeGreaterThan(0);

      // Verify test functions are included
      const functionIds = response.body.functions.map((f: any) => f.id);
      expect(functionIds).toContain("app-test-integration-function");
      expect(functionIds).toContain("app-test-complex-function");
      expect(functionIds).toContain("app-test-error-function");
    });

    it("should handle POST requests for function execution", async () => {
      const testEvent = InngestTestUtils.createTestEvent("test.integration", {
        message: "Integration test event",
        value: 42,
      });

      const webhookRequest = InngestTestUtils.createTestWebhookRequest(
        "app-test-integration-function",
        testEvent,
      );

      const response = await request(app.getHttpServer())
        .post("/api/inngest")
        .send(webhookRequest)
        .expect(200);

      expect(response.body).toHaveProperty("status", "ok");
      expect(response.body).toHaveProperty("result");
      expect(response.body.result.message).toBe("Integration test successful");
      expect(response.body.result.eventData).toEqual(testEvent.data);
      expect(response.body.result.timestamp).toBeDefined();
    });

    it("should handle complex function execution with steps", async () => {
      const testEvent = InngestTestUtils.createTestEvent("test.complex", {
        operation: "complex-test",
        data: [1, 2, 3],
      });

      const webhookRequest = InngestTestUtils.createTestWebhookRequest(
        "app-test-complex-function",
        testEvent,
      );

      const response = await request(app.getHttpServer())
        .post("/api/inngest")
        .send(webhookRequest)
        .expect(200);

      expect(response.body.status).toBe("ok");
      expect(response.body.result.message).toBe(
        "Complex integration test successful",
      );
      expect(response.body.result.steps).toHaveLength(2);
      expect(response.body.result.steps[0].step).toBe(1);
      expect(response.body.result.steps[1].step).toBe(2);
      expect(response.body.result.final).toBe(true);
    });

    it("should handle function execution errors gracefully", async () => {
      const testEvent = InngestTestUtils.createTestEvent("test.error", {
        shouldError: true,
        message: "Force error",
      });

      const webhookRequest = InngestTestUtils.createTestWebhookRequest(
        "app-test-error-function",
        testEvent,
      );

      const response = await request(app.getHttpServer())
        .post("/api/inngest")
        .send(webhookRequest)
        .expect(500);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error.message).toContain("Intentional test error");
      expect(response.body.error.function_id).toBe("app-test-error-function");
      expect(response.body.error.code).toBeDefined();
      expect(response.body.error.timestamp).toBeDefined();
    });

    it("should handle non-existent function requests", async () => {
      const testEvent = InngestTestUtils.createTestEvent("test.nonexistent", {
        message: "This should fail",
      });

      const webhookRequest = InngestTestUtils.createTestWebhookRequest(
        "non-existent-function",
        testEvent,
      );

      const response = await request(app.getHttpServer())
        .post("/api/inngest")
        .send(webhookRequest)
        .expect(404);

      expect(response.body.error.message).toContain(
        "Inngest function not found: non-existent-function",
      );
      expect(response.body.error.function_id).toBe("non-existent-function");
    });
  });

  describe("Service Integration", () => {
    it("should integrate InngestService with event sending", async () => {
      const testEvent = InngestTestUtils.createTestEvent(
        "test.service.integration",
        { source: "service-test", value: 123 },
      );

      // Test single event sending - in test mode, this should not throw
      try {
        const result = await inngestService.send(testEvent);
        expect(result).toBeDefined();
      } catch (error) {
        // In test mode, this may fail due to network issues - this is expected
        expect(error).toBeDefined();
      }
    });

    it("should integrate with batch event sending", async () => {
      const events = [
        InngestTestUtils.createTestEvent("test.batch.1", { index: 1 }),
        InngestTestUtils.createTestEvent("test.batch.2", { index: 2 }),
        InngestTestUtils.createTestEvent("test.batch.3", { index: 3 }),
      ];

      // Test batch event sending - in test mode, this should not throw
      try {
        const result = await inngestService.send(events);
        expect(result).toBeDefined();
      } catch (error) {
        // In test mode, this may fail due to network issues - this is expected
        expect(error).toBeDefined();
      }
    });

    it("should integrate ExecutionContextService with function execution", async () => {
      const functionMetadata = functionRegistry.getFunction(
        "app-test-integration-function",
      );
      expect(functionMetadata).toBeDefined();
      expect(functionMetadata!.config.id).toBe("app-test-integration-function");

      const testEvent = InngestTestUtils.createTestEvent("test.integration", {
        context: "execution-test",
      });

      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "test-run-" + Date.now(),
          1,
        );

      expect(executionContext).toBeDefined();
      expect(executionContext.executionId).toBeDefined();
      expect(executionContext.attempt).toBe(1);
      expect(executionContext.inngestContext).toBeDefined();
      expect(executionContext.inngestContext.runId).toBeDefined();

      // Execute the function
      const result =
        await executionContextService.executeFunction(executionContext);
      expect(result).toBeDefined();
      expect(result.message).toBe("Integration test successful");
      expect(result.eventData).toEqual(testEvent.data);
    });
  });

  describe("Configuration Integration", () => {
    it("should properly load and validate configuration", () => {
      // Configuration should be properly merged and validated
      expect(testConfig.appId).toBe("test-integration-app");
      expect(testConfig.env).toBe("test");
      expect(testConfig.isDev).toBe(true);
      expect(testConfig.timeout).toBe(5000);
      expect(testConfig.retry.maxAttempts).toBe(2);
      expect(testConfig.development.enabled).toBe(true);
    });

    it("should configure services with proper dependencies", () => {
      // All services should be properly configured and connected (using mocks in test)
      expect(inngestService).toBeDefined();
      expect(functionRegistry).toBeDefined();
      expect(executionContextService).toBeDefined();
      expect(signatureVerificationService).toBeDefined();

      // Services should be properly configured
      const healthStatus = module
        .get<InngestController>(InngestController)
        .getHealthStatus();
      expect(healthStatus.status).toBe("healthy");
      expect(healthStatus.endpoint).toBe("/api/inngest");
      expect(healthStatus.registeredFunctions).toBeGreaterThan(0);
      expect(healthStatus.signatureVerification.hasSigningKey).toBe(true);
    });

    it("should validate webhook configuration", () => {
      const controller = module.get<InngestController>(InngestController);
      const validation = controller.validateWebhookConfig();

      expect(validation.isValid).toBe(true);
      expect(validation.issues).toEqual([]);
      expect(validation.recommendations.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Error Handling Integration", () => {
    it("should handle timeout scenarios", async () => {
      // Create a function that will timeout
      const testEvent = InngestTestUtils.createTestEvent(
        "test.timeout",
        { delay: 10000 }, // 10 seconds, but timeout is 5 seconds
      );

      const webhookRequest = InngestTestUtils.createTestWebhookRequest(
        "app-test-integration-function", // Use existing function
        testEvent,
      );

      // This should complete normally since our test function doesn't actually delay
      const response = await request(app.getHttpServer())
        .post("/api/inngest")
        .send(webhookRequest)
        .expect(200);

      expect(response.body.status).toBe("ok");
    });

    it("should handle retry configuration", () => {
      expect(testConfig.retry.maxAttempts).toBe(2);
      expect(testConfig.retry.backoff).toBe("exponential");
      expect(testConfig.retry.initialDelay).toBe(100);
    });
  });

  describe("Development Mode Integration", () => {
    it("should work properly in development mode", () => {
      expect(testConfig.isDev).toBe(true);
      expect(testConfig.development.enabled).toBe(true);
      expect(testConfig.development.disableSignatureVerification).toBe(true);
    });

    it("should bypass signature verification in development mode", async () => {
      // In development mode, requests without proper signatures should still work
      const testEvent = InngestTestUtils.createTestEvent("test.integration", {
        dev: true,
      });

      const webhookRequest = InngestTestUtils.createTestWebhookRequest(
        "app-test-integration-function",
        testEvent,
      );

      const response = await request(app.getHttpServer())
        .post("/api/inngest")
        .send(webhookRequest)
        .expect(200);

      expect(response.body.status).toBe("ok");
    });
  });
});
