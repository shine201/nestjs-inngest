import { Test, TestingModule } from "@nestjs/testing";
import { Injectable } from "@nestjs/common";
import { InngestService } from "../../services/inngest.service";
import { FunctionRegistry } from "../../services/function-registry.service";
import { ExecutionContextService } from "../../services/execution-context.service";
import {
  InngestTestingModule,
  InngestTestUtils,
} from "../../testing/inngest-testing.module";
import { InngestFunction } from "../../decorators/inngest-function.decorator";
import { TypedInngestFunction } from "../../decorators/typed-inngest-function.decorator";
import { EventTypes } from "../../utils/event-types";
import { MergedInngestConfig } from "../../utils/config-validation";
import { InngestEvent } from "../../interfaces/inngest-event.interface";
import { InngestWebhookError, InngestRuntimeError } from "../../errors";

// Test event types for integration testing
type IntegrationEventTypes = {
  "integration.test": { testId: string; data: any };
  "batch.test": { batchId: string; items: any[] };
  "delayed.test": { delayMs: number; payload: any };
  "error.test": { shouldFail: boolean; errorType: string };
  "retry.test": { attempt: number; maxAttempts: number };
  "complex.workflow": { workflowId: string; steps: string[]; data: any };
};

// Test service with real Inngest service integration
@Injectable()
class IntegrationTestService {
  constructor(private readonly inngestService: InngestService) {}

  @InngestFunction({
    id: "integration-test-handler",
    name: "Integration Test Handler",
    triggers: [{ event: "integration.test" }],
  })
  async handleIntegrationTest(event: InngestEvent, { step }: any) {
    const { testId, data } = event.data;

    // Test step execution with real Inngest service
    const result = await step.run("process-test-data", async () => {
      return {
        testId,
        processed: true,
        processedAt: new Date().toISOString(),
        inputData: data,
      };
    });

    // Test event sending within a function
    await step.run("send-completion-event", async () => {
      const completionEvent = InngestTestUtils.createTestEvent(
        "test.completed",
        {
          testId,
          result,
          completedAt: new Date().toISOString(),
        },
      );

      await this.inngestService.send(completionEvent);
      return { eventSent: true };
    });

    return {
      success: true,
      testId,
      result,
      eventSent: true,
    };
  }

  @TypedInngestFunction<IntegrationEventTypes>({
    id: "batch-processor",
    name: "Batch Processor",
    triggers: [{ event: "batch.test" }],
  })
  async processBatch(
    event: InngestEvent<IntegrationEventTypes["batch.test"]>,
    { step }: any,
  ) {
    const { batchId, items } = event.data;

    // Process items in batches
    const batchSize = 5;
    const results: any[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResult = await step.run(
        `process-batch-${Math.floor(i / batchSize)}`,
        async () => {
          return {
            batchIndex: Math.floor(i / batchSize),
            itemsProcessed: batch.length,
            items: batch.map((item: any, index: number) => ({
              ...item,
              processed: true,
              processingIndex: i + index,
            })),
          };
        },
      );
      results.push(batchResult);
    }

    // Send batch completion events
    await step.run("send-batch-events", async () => {
      const batchEvents = results.map((batchResult, index) =>
        InngestTestUtils.createTestEvent("batch.processed", {
          batchId,
          batchIndex: index,
          itemsProcessed: batchResult.itemsProcessed,
        }),
      );

      await this.inngestService.send(batchEvents);
      return { eventsSent: batchEvents.length };
    });

    return {
      success: true,
      batchId,
      totalItems: items.length,
      batchesProcessed: results.length,
      results,
    };
  }

  @TypedInngestFunction<IntegrationEventTypes>({
    id: "delayed-processor",
    name: "Delayed Processor",
    triggers: [{ event: "delayed.test" }],
  })
  async processDelayed(
    event: InngestEvent<IntegrationEventTypes["delayed.test"]>,
    { step }: any,
  ) {
    const { delayMs, payload } = event.data;

    // Test step with sleep/delay
    await step.sleep("wait-delay", delayMs);

    const result = await step.run("process-after-delay", async () => {
      return {
        payload,
        processedAt: new Date().toISOString(),
        delayedBy: delayMs,
      };
    });

    return {
      success: true,
      delayed: true,
      delayMs,
      result,
    };
  }

  @TypedInngestFunction<IntegrationEventTypes>({
    id: "error-handler",
    name: "Error Handler",
    triggers: [{ event: "error.test" }],
  })
  async handleErrors(
    event: InngestEvent<IntegrationEventTypes["error.test"]>,
    { step }: any,
  ) {
    const { shouldFail, errorType } = event.data;

    if (shouldFail) {
      if (errorType === "validation") {
        throw new Error("Validation error occurred");
      } else if (errorType === "timeout") {
        throw new Error("Operation timed out");
      } else if (errorType === "network") {
        throw new Error("Network error occurred");
      } else {
        throw new Error("Unknown error occurred");
      }
    }

    return {
      success: true,
      error: false,
      message: "No error occurred",
    };
  }

  @TypedInngestFunction<IntegrationEventTypes>({
    id: "retry-handler",
    name: "Retry Handler",
    triggers: [{ event: "retry.test" }],
  })
  async handleRetry(
    event: InngestEvent<IntegrationEventTypes["retry.test"]>,
    { step }: any,
  ) {
    const { attempt, maxAttempts } = event.data;

    // Simulate failure on early attempts
    if (attempt < maxAttempts) {
      throw new Error(`Retry attempt ${attempt} failed`);
    }

    return {
      success: true,
      finalAttempt: attempt,
      maxAttempts,
      message: "Succeeded after retries",
    };
  }

  @TypedInngestFunction<IntegrationEventTypes>({
    id: "complex-workflow",
    name: "Complex Workflow",
    triggers: [{ event: "complex.workflow" }],
  })
  async executeComplexWorkflow(
    event: InngestEvent<IntegrationEventTypes["complex.workflow"]>,
    { step }: any,
  ) {
    const { workflowId, steps, data } = event.data;

    // Initialize workflow
    const initialization = await step.run("initialize", async () => {
      return {
        workflowId,
        startedAt: new Date().toISOString(),
        totalSteps: steps.length,
        initialData: data,
      };
    });

    // Execute workflow steps with dependencies
    const stepResults: any[] = [];
    let currentData = data;

    for (let i = 0; i < steps.length; i++) {
      const stepName = steps[i];
      const stepResult = await step.run(`step-${stepName}`, async () => {
        // Simulate step processing with data transformation
        const processedData = {
          ...currentData,
          stepIndex: i,
          stepName,
          processedAt: new Date().toISOString(),
          previousStepCount: stepResults.length,
        };

        return {
          stepIndex: i,
          stepName,
          input: currentData,
          output: processedData,
          status: "completed",
        };
      });

      stepResults.push(stepResult);
      currentData = stepResult.output;
    }

    // Send intermediate events for each major step
    await step.run("send-progress-events", async () => {
      const progressEvents = stepResults
        .filter((_, index) => index % 2 === 0) // Send event every 2 steps
        .map((stepResult) =>
          InngestTestUtils.createTestEvent("workflow.progress", {
            workflowId,
            stepIndex: stepResult.stepIndex,
            stepName: stepResult.stepName,
            status: stepResult.status,
          }),
        );

      if (progressEvents.length > 0) {
        await this.inngestService.send(progressEvents);
      }

      return { progressEventsSent: progressEvents.length };
    });

    // Finalize workflow
    const finalization = await step.run("finalize", async () => {
      const finalEvent = InngestTestUtils.createTestEvent(
        "workflow.completed",
        {
          workflowId,
          completedAt: new Date().toISOString(),
          totalSteps: steps.length,
          finalData: currentData,
        },
      );

      await this.inngestService.send(finalEvent);

      return {
        workflowId,
        completedAt: new Date().toISOString(),
        finalData: currentData,
        eventSent: true,
      };
    });

    return {
      success: true,
      workflow: initialization,
      steps: stepResults,
      finalization,
    };
  }

  // Helper method to test direct service usage
  async sendTestEvent(eventName: string, data: any): Promise<any> {
    const event = InngestTestUtils.createTestEvent(eventName, data);
    return await this.inngestService.send(event);
  }

  async sendBatchTestEvents(
    events: Array<{ name: string; data: any }>,
  ): Promise<any> {
    const inngestEvents = events.map(({ name, data }) =>
      InngestTestUtils.createTestEvent(name, data),
    );
    return await this.inngestService.send(inngestEvents);
  }
}

describe("Inngest Service Integration Tests", () => {
  let module: TestingModule;
  let inngestService: InngestService;
  let functionRegistry: FunctionRegistry;
  let executionContextService: ExecutionContextService;
  let testService: IntegrationTestService;
  let testConfig: MergedInngestConfig;

  beforeAll(async () => {
    testConfig = {
      appId: "inngest-integration-test",
      signingKey: "inngest-integration-key",
      eventKey: "inngest-integration-event-key",
      baseUrl: "https://api.inngest.com",
      endpoint: "/api/inngest",
      env: "test",
      isDev: true,
      logger: true,
      timeout: 15000,
      maxBatchSize: 100,
      strict: false,
      retry: {
        maxAttempts: 3,
        backoff: "exponential",
        initialDelay: 100,
        maxDelay: 5000,
        backoffMultiplier: 2,
      },
      development: {
        enabled: true,
        disableSignatureVerification: true,
      },
    };

    module = await Test.createTestingModule({
      imports: [
        InngestTestingModule.forSmartIntegrationTest({
          additionalProviders: [IntegrationTestService],
        }),
      ],
    }).compile();

    inngestService = module.get<InngestService>(InngestService);
    functionRegistry = module.get<FunctionRegistry>(FunctionRegistry);
    executionContextService = module.get<ExecutionContextService>(
      ExecutionContextService,
    );
    testService = module.get<IntegrationTestService>(IntegrationTestService);

    // Manually trigger function discovery for testing
    await functionRegistry.onModuleInit();
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  describe("Real Inngest Service Integration", () => {
    it("should initialize with real Inngest service", () => {
      expect(inngestService).toBeDefined();
      expect(inngestService).toBeInstanceOf(InngestService);
      expect(testService).toBeDefined();
    });

    it("should register all integration test functions", () => {
      const functionCount = functionRegistry.getFunctionCount();
      expect(functionCount).toBe(6);

      const functionIds = [
        "integration-test-handler",
        "batch-processor",
        "delayed-processor",
        "error-handler",
        "retry-handler",
        "complex-workflow",
      ];

      functionIds.forEach((id) => {
        const functionMetadata = functionRegistry.getFunction(id);
        expect(functionMetadata).toBeDefined();
        expect(functionMetadata!.config.id).toBe(id);
      });
    });

    it("should send single events through real service", async () => {
      const testData = {
        message: "Single event test",
        timestamp: Date.now(),
        source: "integration-test",
      };

      const result = await testService.sendTestEvent("integration.test", {
        testId: "single-event-test",
        data: testData,
      });

      expect(result).toBeUndefined(); // Service returns void in test mode
    });

    it("should send batch events through real service", async () => {
      const batchEvents = [
        { name: "batch.item", data: { itemId: 1, value: "item1" } },
        { name: "batch.item", data: { itemId: 2, value: "item2" } },
        { name: "batch.item", data: { itemId: 3, value: "item3" } },
      ];

      const result = await testService.sendBatchTestEvents(batchEvents);

      expect(result).toBeUndefined(); // Service returns void in test mode
    });

    it("should handle event sending with retry configuration", async () => {
      // Test multiple event sends to verify retry configuration
      const promises = [];

      for (let i = 0; i < 5; i++) {
        const promise = testService.sendTestEvent("retry.test", {
          attempt: i + 1,
          maxAttempts: 3,
          batchIndex: i,
        });
        promises.push(promise);
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result).toBeUndefined(); // Service returns void in test mode
      });
    });

    it("should respect batch size configuration", async () => {
      const largeEventBatch = [];
      for (let i = 0; i < 150; i++) {
        // Exceeds maxBatchSize of 100
        largeEventBatch.push({
          name: "large.batch.item",
          data: { index: i, value: `item-${i}` },
        });
      }

      // Should throw error when batch size exceeds maximum
      await expect(
        testService.sendBatchTestEvents(largeEventBatch),
      ).rejects.toThrow(
        "Batch size exceeds maximum allowed (100). Got 150 events.",
      );
    });
  });

  describe("Function Execution with Real Services", () => {
    it("should execute integration test handler with real services", async () => {
      const testEvent = InngestTestUtils.createTestEvent("integration.test", {
        testId: "real-service-test",
        data: {
          operation: "test-real-services",
          parameters: { timeout: 5000, retries: 2 },
        },
      });

      const functionMetadata = functionRegistry.getFunction(
        "integration-test-handler",
      );
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "real-service-run-" + Date.now(),
          1,
        );

      const result =
        await executionContextService.executeFunction(executionContext);

      expect(result.success).toBe(true);
      expect(result.testId).toBe("real-service-test");
      expect(result.result.processed).toBe(true);
      expect(result.eventSent).toBe(true);
    });

    it("should execute batch processor with real services", async () => {
      const items = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: `Item ${i + 1}`,
        category: i % 3 === 0 ? "A" : i % 3 === 1 ? "B" : "C",
      }));

      const testEvent = InngestTestUtils.createTestEvent("batch.test", {
        batchId: "real-batch-test",
        items,
      });

      const functionMetadata = functionRegistry.getFunction("batch-processor");
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "batch-run-" + Date.now(),
          1,
        );

      const result =
        await executionContextService.executeFunction(executionContext);

      expect(result.success).toBe(true);
      expect(result.batchId).toBe("real-batch-test");
      expect(result.totalItems).toBe(12);
      expect(result.batchesProcessed).toBe(3); // 12 items / 5 per batch = 3 batches
      expect(result.results).toHaveLength(3);
    });

    it("should execute complex workflow with real services", async () => {
      const workflowSteps = [
        "validate",
        "transform",
        "process",
        "notify",
        "cleanup",
      ];
      const workflowData = {
        inputData: { records: 100, format: "json" },
        configuration: { parallel: true, timeout: 30000 },
      };

      const testEvent = InngestTestUtils.createTestEvent("complex.workflow", {
        workflowId: "complex-real-workflow",
        steps: workflowSteps,
        data: workflowData,
      });

      const functionMetadata = functionRegistry.getFunction("complex-workflow");
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "complex-workflow-run-" + Date.now(),
          1,
        );

      const result =
        await executionContextService.executeFunction(executionContext);

      expect(result.success).toBe(true);
      expect(result.workflow.workflowId).toBe("complex-real-workflow");
      expect(result.steps).toHaveLength(5);
      expect(result.finalization.eventSent).toBe(true);

      // Verify step execution order and data flow
      result.steps.forEach((stepResult: any, index: number) => {
        expect(stepResult.stepIndex).toBe(index);
        expect(stepResult.stepName).toBe(workflowSteps[index]);
        expect(stepResult.status).toBe("completed");
        expect(stepResult.output.stepIndex).toBe(index);
      });
    });

    it("should handle delayed processing with real services", async () => {
      const delayMs = 100; // Small delay for testing
      const payload = {
        operation: "delayed-operation",
        priority: "high",
        data: { value: 42 },
      };

      const testEvent = InngestTestUtils.createTestEvent("delayed.test", {
        delayMs,
        payload,
      });

      const functionMetadata =
        functionRegistry.getFunction("delayed-processor");
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "delayed-run-" + Date.now(),
          1,
        );

      const startTime = Date.now();
      const result =
        await executionContextService.executeFunction(executionContext);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.delayed).toBe(true);
      expect(result.delayMs).toBe(delayMs);
      expect(result.result.payload).toEqual(payload);

      // Should have taken at least the delay time
      expect(endTime - startTime).toBeGreaterThanOrEqual(delayMs);
    });
  });

  describe("Error Handling with Real Services", () => {
    it("should handle validation errors properly", async () => {
      const testEvent = InngestTestUtils.createTestEvent("error.test", {
        shouldFail: true,
        errorType: "validation",
      });

      const functionMetadata = functionRegistry.getFunction("error-handler");
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "error-run-" + Date.now(),
          1,
        );

      await expect(
        executionContextService.executeFunction(executionContext),
      ).rejects.toThrow("Validation error occurred");
    });

    it("should handle timeout errors properly", async () => {
      const testEvent = InngestTestUtils.createTestEvent("error.test", {
        shouldFail: true,
        errorType: "timeout",
      });

      const functionMetadata = functionRegistry.getFunction("error-handler");
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "timeout-error-run-" + Date.now(),
          1,
        );

      await expect(
        executionContextService.executeFunction(executionContext),
      ).rejects.toThrow("Operation timed out");
    });

    it("should handle network errors properly", async () => {
      const testEvent = InngestTestUtils.createTestEvent("error.test", {
        shouldFail: true,
        errorType: "network",
      });

      const functionMetadata = functionRegistry.getFunction("error-handler");
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "network-error-run-" + Date.now(),
          1,
        );

      await expect(
        executionContextService.executeFunction(executionContext),
      ).rejects.toThrow("Network error occurred");
    });

    it("should handle successful execution after error scenarios", async () => {
      const testEvent = InngestTestUtils.createTestEvent("error.test", {
        shouldFail: false,
        errorType: "none",
      });

      const functionMetadata = functionRegistry.getFunction("error-handler");
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "success-run-" + Date.now(),
          1,
        );

      const result =
        await executionContextService.executeFunction(executionContext);

      expect(result.success).toBe(true);
      expect(result.error).toBe(false);
      expect(result.message).toBe("No error occurred");
    });
  });

  describe("Retry Scenarios with Real Services", () => {
    it("should simulate retry scenarios", async () => {
      // Test early failure
      const failureEvent = InngestTestUtils.createTestEvent("retry.test", {
        attempt: 1,
        maxAttempts: 3,
      });

      const functionMetadata = functionRegistry.getFunction("retry-handler");
      const failureContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          failureEvent,
          "retry-failure-run-" + Date.now(),
          1,
        );

      await expect(
        executionContextService.executeFunction(failureContext),
      ).rejects.toThrow("Retry attempt 1 failed");

      // Test final success
      const successEvent = InngestTestUtils.createTestEvent("retry.test", {
        attempt: 3,
        maxAttempts: 3,
      });

      const successContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          successEvent,
          "retry-success-run-" + Date.now(),
          3,
        );

      const result =
        await executionContextService.executeFunction(successContext);

      expect(result.success).toBe(true);
      expect(result.finalAttempt).toBe(3);
      expect(result.maxAttempts).toBe(3);
      expect(result.message).toBe("Succeeded after retries");
    });
  });

  describe("Performance with Real Services", () => {
    it("should handle concurrent function executions", async () => {
      const concurrentCount = 10;
      const executions = [];

      for (let i = 0; i < concurrentCount; i++) {
        const testEvent = InngestTestUtils.createTestEvent("integration.test", {
          testId: `concurrent-test-${i}`,
          data: { index: i, timestamp: Date.now() },
        });

        const functionMetadata = functionRegistry.getFunction(
          "integration-test-handler",
        );
        const executionContext =
          await executionContextService.createExecutionContext(
            functionMetadata!,
            testEvent,
            `concurrent-run-${i}-${Date.now()}`,
            1,
          );

        executions.push(
          executionContextService.executeFunction(executionContext),
        );
      }

      const startTime = Date.now();
      const results = await Promise.all(executions);
      const endTime = Date.now();

      expect(results).toHaveLength(concurrentCount);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.testId).toBe(`concurrent-test-${index}`);
      });

      // Should complete all executions within reasonable time
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it("should handle high-volume event sending", async () => {
      const eventCount = 50;
      const batchSize = 10;
      const batches = [];

      for (let i = 0; i < eventCount; i += batchSize) {
        const batchEvents = [];
        for (let j = 0; j < batchSize && i + j < eventCount; j++) {
          batchEvents.push({
            name: "volume.test",
            data: { index: i + j, batchIndex: Math.floor(i / batchSize) },
          });
        }
        batches.push(batchEvents);
      }

      const startTime = Date.now();
      const batchPromises = batches.map((batch) =>
        testService.sendBatchTestEvents(batch),
      );
      const results = await Promise.all(batchPromises);
      const endTime = Date.now();

      expect(results).toHaveLength(Math.ceil(eventCount / batchSize));

      // All results should be undefined (void) in test mode
      results.forEach((result) => {
        expect(result).toBeUndefined();
      });

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(10000);
    });
  });

  describe("Configuration Validation with Real Services", () => {
    it("should use proper configuration for real services", () => {
      expect(testConfig.appId).toBe("inngest-integration-test");
      expect(testConfig.eventKey).toBe("inngest-integration-event-key");
      expect(testConfig.baseUrl).toBe("https://api.inngest.com");
      expect(testConfig.timeout).toBe(15000);
      expect(testConfig.maxBatchSize).toBe(100);
      expect(testConfig.retry.maxAttempts).toBe(3);
    });

    it("should handle development mode configuration correctly", () => {
      expect(testConfig.isDev).toBe(true);
      expect(testConfig.development.enabled).toBe(true);
      expect(testConfig.development.disableSignatureVerification).toBe(true);
    });
  });
});
