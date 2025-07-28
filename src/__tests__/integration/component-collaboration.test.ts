import { Test, TestingModule } from "@nestjs/testing";
import { Injectable } from "@nestjs/common";
import { InngestService } from "../../services/inngest.service";
import { FunctionRegistry } from "../../services/function-registry.service";
import { ExecutionContextService } from "../../services/execution-context.service";
import { SignatureVerificationService } from "../../services/signature-verification.service";
import { ScopeManagerService } from "../../services/scope-manager.service";
import { InngestController } from "../../controllers/inngest.controller";
import { createSimpleMockHttpAdapter } from "../../testing/http-adapter-test-helper";
import {
  EnhancedLogger,
  LoggerFactory,
} from "../../services/enhanced-logger.service";
import {
  InngestTestingModule,
  InngestTestUtils,
} from "../../testing/inngest-testing.module";
import { InngestFunction } from "../../decorators/inngest-function.decorator";
import { TypedInngestFunction } from "../../decorators/typed-inngest-function.decorator";
import { EventTypes } from "../../utils/event-types";
import { MergedInngestConfig } from "../../utils/config-validation";
import { withRetry, errorHandler } from "../../utils/error-handler";
import { developmentMode } from "../../utils/development-mode";

// Test event types for type-safe testing
type TestEventTypes = {
  "user.created": { userId: string; email: string; name: string };
  "user.updated": { userId: string; changes: Record<string, any> };
  "notification.send": { userId: string; type: string; message: string };
  "workflow.started": { workflowId: string; userId: string; steps: string[] };
  "workflow.completed": { workflowId: string; userId: string; result: any };
};

// Test services with complex function interactions
@Injectable()
class UserService {
  @InngestFunction({
    id: "user-created-handler",
    name: "Handle User Creation",
    triggers: [{ event: "user.created" }],
  })
  async handleUserCreated(event: any, { step }: any) {
    // Simulate user creation workflow
    const userId = event.data.userId;

    // Step 1: Validate user data
    const validation = await step.run("validate-user", async () => {
      if (!event.data.email || !event.data.name) {
        throw new Error("Invalid user data");
      }
      return { valid: true, userId };
    });

    // Step 2: Create user profile
    const profile = await step.run("create-profile", async () => {
      return {
        userId,
        email: event.data.email,
        name: event.data.name,
        createdAt: new Date().toISOString(),
      };
    });

    // Step 3: Send welcome notification
    await step.run("send-welcome-notification", async () => {
      const notificationEvent = InngestTestUtils.createTestEvent(
        "notification.send",
        {
          userId,
          type: "welcome",
          message: `Welcome ${event.data.name}! Your account has been created.`,
        },
      );
      return { notificationScheduled: true, event: notificationEvent };
    });

    return {
      success: true,
      user: profile,
      steps: ["validate-user", "create-profile", "send-welcome-notification"],
    };
  }

  @TypedInngestFunction<TestEventTypes>({
    id: "user-updated-handler",
    name: "Handle User Updates",
    triggers: [{ event: "user.updated" }],
  })
  async handleUserUpdated(event: any, { step }: any) {
    const { userId, changes } = event.data;

    // Step 1: Validate changes
    const validationResult = await step.run("validate-changes", async () => {
      if (Object.keys(changes).length === 0) {
        throw new Error("No changes provided");
      }
      return { valid: true, changeCount: Object.keys(changes).length };
    });

    // Step 2: Apply changes
    const updateResult = await step.run("apply-changes", async () => {
      return {
        userId,
        appliedChanges: changes,
        updatedAt: new Date().toISOString(),
        changeCount: validationResult.changeCount,
      };
    });

    // Step 3: Trigger notification if significant changes
    if (changes.email || changes.name) {
      await step.run("notify-significant-changes", async () => {
        return {
          notificationType: "profile-updated",
          userId,
          changes: Object.keys(changes),
        };
      });
    }

    return {
      success: true,
      update: updateResult,
      notificationSent: !!(changes.email || changes.name),
    };
  }
}

@Injectable()
class NotificationService {
  @TypedInngestFunction<TestEventTypes>({
    id: "notification-sender",
    name: "Send Notification",
    triggers: [{ event: "notification.send" }],
  })
  async sendNotification(event: any, { step }: any) {
    const { userId, type, message } = event.data;

    // Step 1: Prepare notification
    const preparation = await step.run("prepare-notification", async () => {
      return {
        id: `notif_${Date.now()}`,
        userId,
        type,
        message,
        preparedAt: new Date().toISOString(),
      };
    });

    // Step 2: Send notification (simulate)
    const sendResult = await step.run("send-notification", async () => {
      // Simulate different delivery methods based on type
      const deliveryMethod = type === "welcome" ? "email" : "push";
      return {
        notificationId: preparation.id,
        deliveryMethod,
        status: "sent",
        sentAt: new Date().toISOString(),
      };
    });

    // Step 3: Track delivery
    await step.run("track-delivery", async () => {
      return {
        notificationId: preparation.id,
        userId,
        tracked: true,
        deliveryConfirmed: true,
      };
    });

    return {
      success: true,
      notification: preparation,
      delivery: sendResult,
      tracked: true,
    };
  }
}

@Injectable()
class WorkflowService {
  @TypedInngestFunction<TestEventTypes>({
    id: "workflow-orchestrator",
    name: "Workflow Orchestrator",
    triggers: [{ event: "workflow.started" }],
  })
  async orchestrateWorkflow(event: any, { step }: any) {
    const { workflowId, userId, steps: workflowSteps } = event.data;

    // Step 1: Initialize workflow
    const initialization = await step.run("initialize-workflow", async () => {
      return {
        workflowId,
        userId,
        status: "running",
        startedAt: new Date().toISOString(),
        totalSteps: workflowSteps.length,
      };
    });

    // Step 2: Execute workflow steps
    const stepResults = [];
    for (let i = 0; i < workflowSteps.length; i++) {
      const stepName = workflowSteps[i];
      const stepResult = await step.run(`execute-step-${i + 1}`, async () => {
        // Simulate step execution
        return {
          stepIndex: i + 1,
          stepName,
          status: "completed",
          executedAt: new Date().toISOString(),
        };
      });
      stepResults.push(stepResult);
    }

    // Step 3: Complete workflow
    const completion = await step.run("complete-workflow", async () => {
      const completedEvent = InngestTestUtils.createTestEvent(
        "workflow.completed",
        {
          workflowId,
          userId,
          result: {
            status: "completed",
            stepsExecuted: stepResults.length,
            completedAt: new Date().toISOString(),
          },
        },
      );
      return {
        workflowId,
        completedAt: new Date().toISOString(),
        completionEvent: completedEvent,
      };
    });

    return {
      success: true,
      workflow: initialization,
      steps: stepResults,
      completion,
    };
  }

  @TypedInngestFunction<TestEventTypes>({
    id: "workflow-completion-handler",
    name: "Handle Workflow Completion",
    triggers: [{ event: "workflow.completed" }],
  })
  async handleWorkflowCompletion(event: any, { step }: any) {
    const { workflowId, userId, result } = event.data;

    // Step 1: Process completion
    const processing = await step.run("process-completion", async () => {
      return {
        workflowId,
        userId,
        processedAt: new Date().toISOString(),
        result,
      };
    });

    // Step 2: Send completion notification
    await step.run("send-completion-notification", async () => {
      return {
        userId,
        notificationType: "workflow-completed",
        workflowId,
        message: `Workflow ${workflowId} has been completed successfully.`,
      };
    });

    return {
      success: true,
      processed: processing,
      notificationSent: true,
    };
  }
}

describe("Component Collaboration Integration Tests", () => {
  let module: TestingModule;
  let inngestService: InngestService;
  let functionRegistry: FunctionRegistry;
  let executionContextService: ExecutionContextService;
  let signatureVerificationService: SignatureVerificationService;
  let scopeManagerService: ScopeManagerService;
  let controller: InngestController;
  let userService: UserService;
  let notificationService: NotificationService;
  let workflowService: WorkflowService;
  let logger: EnhancedLogger;

  beforeAll(async () => {
    const testConfig: MergedInngestConfig = {
      appId: "collaboration-test-app",
      signingKey: "collaboration-test-key",
      endpoint: "/api/inngest",
      env: "test",
      isDev: true,
      logger: true,
      timeout: 10000,
      maxBatchSize: 100,
      strict: false,
      retry: {
        maxAttempts: 3,
        backoff: "exponential",
        initialDelay: 100,
      },
      development: {
        enabled: true,
        disableSignatureVerification: true,
      },
    };

    module = await Test.createTestingModule({
      imports: [
        InngestTestingModule.forSmartIntegrationTest({
          additionalProviders: [
            UserService,
            NotificationService,
            WorkflowService,
          ],
        }),
      ],
    }).compile();

    // Get all service instances
    inngestService = module.get<InngestService>(InngestService);
    functionRegistry = module.get<FunctionRegistry>(FunctionRegistry);
    executionContextService = module.get<ExecutionContextService>(
      ExecutionContextService,
    );
    signatureVerificationService = module.get<SignatureVerificationService>(
      SignatureVerificationService,
    );
    scopeManagerService = module.get<ScopeManagerService>(ScopeManagerService);
    controller = module.get<InngestController>(InngestController);
    userService = module.get<UserService>(UserService);
    notificationService = module.get<NotificationService>(NotificationService);
    workflowService = module.get<WorkflowService>(WorkflowService);

    const loggerFactory = new LoggerFactory();
    logger = loggerFactory.createServiceLogger("ComponentCollaborationTest");

    // Manually trigger function discovery for testing
    await functionRegistry.onModuleInit();
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  describe("Service Registration and Discovery", () => {
    it("should register all functions from multiple services", () => {
      const functionCount = functionRegistry.getFunctionCount();
      expect(functionCount).toBe(5); // All functions from the three services

      // Check specific functions are registered
      const userCreatedHandler = functionRegistry.getFunction(
        "user-created-handler",
      );
      const userUpdatedHandler = functionRegistry.getFunction(
        "user-updated-handler",
      );
      const notificationSender = functionRegistry.getFunction(
        "notification-sender",
      );
      const workflowOrchestrator = functionRegistry.getFunction(
        "workflow-orchestrator",
      );
      const workflowCompletionHandler = functionRegistry.getFunction(
        "workflow-completion-handler",
      );

      expect(userCreatedHandler).toBeDefined();
      expect(userUpdatedHandler).toBeDefined();
      expect(notificationSender).toBeDefined();
      expect(workflowOrchestrator).toBeDefined();
      expect(workflowCompletionHandler).toBeDefined();
    });

    it("should create proper function definitions for Inngest", () => {
      const definitions = functionRegistry.createInngestFunctions();
      expect(definitions).toHaveLength(5);

      const functionIds = definitions.map((def) => def.id);
      expect(functionIds).toContain("user-created-handler");
      expect(functionIds).toContain("user-updated-handler");
      expect(functionIds).toContain("notification-sender");
      expect(functionIds).toContain("workflow-orchestrator");
      expect(functionIds).toContain("workflow-completion-handler");
    });

    it("should properly configure triggers for each function", () => {
      const definitions = functionRegistry.createInngestFunctions();

      const userCreatedDef = definitions.find(
        (def) => def.id === "user-created-handler",
      );
      expect(userCreatedDef.triggers[0].event).toBe("user.created");

      const notificationDef = definitions.find(
        (def) => def.id === "notification-sender",
      );
      expect(notificationDef.triggers[0].event).toBe("notification.send");

      const workflowDef = definitions.find(
        (def) => def.id === "workflow-orchestrator",
      );
      expect(workflowDef.triggers[0].event).toBe("workflow.started");
    });
  });

  describe("Cross-Service Function Execution", () => {
    it("should execute user creation workflow with all steps", async () => {
      const testEvent = InngestTestUtils.createTestEvent("user.created", {
        userId: "user-123",
        email: "test@example.com",
        name: "Test User",
      });

      const webhookRequest = InngestTestUtils.createTestWebhookRequest(
        "user-created-handler",
        testEvent,
      );

      // Get function metadata and create execution context
      const functionMetadata = functionRegistry.getFunction(
        "user-created-handler",
      );
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "run-" + Date.now(),
          1,
        );

      // Execute the function
      const result =
        await executionContextService.executeFunction(executionContext);

      expect(result.success).toBe(true);
      expect(result.user.userId).toBe("user-123");
      expect(result.user.email).toBe("test@example.com");
      expect(result.user.name).toBe("Test User");
      expect(result.steps).toEqual([
        "validate-user",
        "create-profile",
        "send-welcome-notification",
      ]);
    });

    it("should execute notification sending workflow", async () => {
      const testEvent = InngestTestUtils.createTestEvent("notification.send", {
        userId: "user-123",
        type: "welcome",
        message: "Welcome to our platform!",
      });

      const functionMetadata = functionRegistry.getFunction(
        "notification-sender",
      );
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "notif-run-" + Date.now(),
          1,
        );

      const result =
        await executionContextService.executeFunction(executionContext);

      expect(result.success).toBe(true);
      expect(result.notification.userId).toBe("user-123");
      expect(result.notification.type).toBe("welcome");
      expect(result.delivery.status).toBe("sent");
      expect(result.tracked).toBe(true);
    });

    it("should execute complex workflow orchestration", async () => {
      const testEvent = InngestTestUtils.createTestEvent("workflow.started", {
        workflowId: "workflow-456",
        userId: "user-123",
        steps: ["step1", "step2", "step3"],
      });

      const functionMetadata = functionRegistry.getFunction(
        "workflow-orchestrator",
      );
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "workflow-run-" + Date.now(),
          1,
        );

      const result =
        await executionContextService.executeFunction(executionContext);

      expect(result.success).toBe(true);
      expect(result.workflow.workflowId).toBe("workflow-456");
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].stepName).toBe("step1");
      expect(result.steps[1].stepName).toBe("step2");
      expect(result.steps[2].stepName).toBe("step3");
      expect(result.completion.workflowId).toBe("workflow-456");
    });

    it("should handle user update workflow with conditional notifications", async () => {
      // Test with significant changes (should trigger notification)
      const significantUpdateEvent = InngestTestUtils.createTestEvent(
        "user.updated",
        {
          userId: "user-123",
          changes: { name: "Updated Name", email: "new@example.com" },
        },
      );

      const functionMetadata = functionRegistry.getFunction(
        "user-updated-handler",
      );
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          significantUpdateEvent,
          "update-run-" + Date.now(),
          1,
        );

      const result =
        await executionContextService.executeFunction(executionContext);

      expect(result.success).toBe(true);
      expect(result.update.userId).toBe("user-123");
      expect(result.update.changeCount).toBe(2);
      expect(result.notificationSent).toBe(true);
    });

    it("should handle workflow completion events", async () => {
      const testEvent = InngestTestUtils.createTestEvent("workflow.completed", {
        workflowId: "workflow-789",
        userId: "user-123",
        result: {
          status: "completed",
          stepsExecuted: 5,
          completedAt: new Date().toISOString(),
        },
      });

      const functionMetadata = functionRegistry.getFunction(
        "workflow-completion-handler",
      );
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "completion-run-" + Date.now(),
          1,
        );

      const result =
        await executionContextService.executeFunction(executionContext);

      expect(result.success).toBe(true);
      expect(result.processed.workflowId).toBe("workflow-789");
      expect(result.processed.userId).toBe("user-123");
      expect(result.notificationSent).toBe(true);
    });
  });

  describe("Error Handling and Recovery", () => {
    it("should handle validation errors in user creation", async () => {
      const invalidEvent = InngestTestUtils.createTestEvent("user.created", {
        userId: "user-invalid",
        email: "", // Invalid email
        name: "Test User",
      });

      const functionMetadata = functionRegistry.getFunction(
        "user-created-handler",
      );
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          invalidEvent,
          "invalid-run-" + Date.now(),
          1,
        );

      await expect(
        executionContextService.executeFunction(executionContext),
      ).rejects.toThrow("Invalid user data");
    });

    it("should handle empty changes in user updates", async () => {
      const emptyChangesEvent = InngestTestUtils.createTestEvent(
        "user.updated",
        {
          userId: "user-123",
          changes: {}, // No changes
        },
      );

      const functionMetadata = functionRegistry.getFunction(
        "user-updated-handler",
      );
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          emptyChangesEvent,
          "empty-changes-run-" + Date.now(),
          1,
        );

      await expect(
        executionContextService.executeFunction(executionContext),
      ).rejects.toThrow("No changes provided");
    });

    it("should handle errors with retry configuration", async () => {
      // Test retry mechanism with a function that might fail
      const testEvent = InngestTestUtils.createTestEvent("user.created", {
        userId: "retry-user",
        email: "retry@example.com",
        name: "Retry User",
      });

      const functionMetadata = functionRegistry.getFunction(
        "user-created-handler",
      );

      // Execute multiple times to test retry behavior
      for (let attempt = 1; attempt <= 3; attempt++) {
        const executionContext =
          await executionContextService.createExecutionContext(
            functionMetadata!,
            testEvent,
            "retry-run-" + Date.now(),
            attempt,
          );

        const result =
          await executionContextService.executeFunction(executionContext);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("Step Function Integration", () => {
    it("should properly handle step execution and context", async () => {
      const testEvent = InngestTestUtils.createTestEvent("workflow.started", {
        workflowId: "step-test-workflow",
        userId: "user-steps",
        steps: ["validate", "process", "finalize"],
      });

      const functionMetadata = functionRegistry.getFunction(
        "workflow-orchestrator",
      );
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "step-test-run-" + Date.now(),
          1,
        );

      // Test that step functions are properly mocked
      expect(executionContext.inngestContext.step).toBeDefined();
      expect(executionContext.inngestContext.step.run).toBeInstanceOf(Function);

      const result =
        await executionContextService.executeFunction(executionContext);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);

      // Verify each step was executed
      result.steps.forEach((stepResult: any, index: number) => {
        expect(stepResult.stepIndex).toBe(index + 1);
        expect(stepResult.status).toBe("completed");
        expect(stepResult.executedAt).toBeDefined();
      });
    });

    it("should handle step dependencies and sequencing", async () => {
      const testEvent = InngestTestUtils.createTestEvent("user.created", {
        userId: "sequential-user",
        email: "sequential@example.com",
        name: "Sequential User",
      });

      const functionMetadata = functionRegistry.getFunction(
        "user-created-handler",
      );
      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "sequential-run-" + Date.now(),
          1,
        );

      const result =
        await executionContextService.executeFunction(executionContext);

      // Verify that steps were executed in the correct order
      expect(result.steps).toEqual([
        "validate-user",
        "create-profile",
        "send-welcome-notification",
      ]);

      // Verify the user profile was created with validation results
      expect(result.user.userId).toBe("sequential-user");
      expect(result.user.email).toBe("sequential@example.com");
      expect(result.user.createdAt).toBeDefined();
    });
  });

  describe("Event Type Safety", () => {
    it("should work with typed event functions", async () => {
      // Test TypedInngestFunction with proper type safety
      const testEvent = InngestTestUtils.createTestEvent("notification.send", {
        userId: "typed-user",
        type: "typed-notification",
        message: "This is a typed event test",
      });

      const functionMetadata = functionRegistry.getFunction(
        "notification-sender",
      );
      expect(functionMetadata).toBeDefined();
      expect(functionMetadata!.config.name).toBe("Send Notification");
      expect((functionMetadata!.config.triggers[0] as any).event).toBe(
        "notification.send",
      );

      const executionContext =
        await executionContextService.createExecutionContext(
          functionMetadata!,
          testEvent,
          "typed-run-" + Date.now(),
          1,
        );

      const result =
        await executionContextService.executeFunction(executionContext);

      expect(result.success).toBe(true);
      expect(result.notification.userId).toBe("typed-user");
      expect(result.notification.type).toBe("typed-notification");
      expect(result.delivery.deliveryMethod).toBeDefined();
    });

    it("should validate event structure for typed functions", () => {
      // Verify that typed functions maintain proper event structure
      const userUpdateHandler = functionRegistry.getFunction(
        "user-updated-handler",
      );
      expect(userUpdateHandler).toBeDefined();
      expect((userUpdateHandler!.config.triggers[0] as any).event).toBe(
        "user.updated",
      );

      const workflowCompletionHandler = functionRegistry.getFunction(
        "workflow-completion-handler",
      );
      expect(workflowCompletionHandler).toBeDefined();
      expect((workflowCompletionHandler!.config.triggers[0] as any).event).toBe(
        "workflow.completed",
      );
    });
  });

  describe("Performance and Scalability", () => {
    it("should handle multiple concurrent function executions", async () => {
      const concurrentExecutions = 5;
      const executions = [];

      for (let i = 0; i < concurrentExecutions; i++) {
        const testEvent = InngestTestUtils.createTestEvent(
          "notification.send",
          {
            userId: `concurrent-user-${i}`,
            type: "concurrent-test",
            message: `Concurrent message ${i}`,
          },
        );

        const functionMetadata = functionRegistry.getFunction(
          "notification-sender",
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

      const results = await Promise.all(executions);

      expect(results).toHaveLength(concurrentExecutions);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.notification.userId).toBe(`concurrent-user-${index}`);
      });
    });

    it("should maintain function registry performance with multiple functions", () => {
      const startTime = Date.now();

      // Perform multiple registry operations
      for (let i = 0; i < 100; i++) {
        const count = functionRegistry.getFunctionCount();
        expect(count).toBe(5);

        const userFunction = functionRegistry.getFunction(
          "user-created-handler",
        );
        expect(userFunction).toBeDefined();

        const definitions = functionRegistry.createInngestFunctions();
        expect(definitions).toHaveLength(5);
      }

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should complete within reasonable time (less than 1 second)
      expect(executionTime).toBeLessThan(1000);
    });
  });

  describe("Integration with Development Mode", () => {
    it("should work properly in development mode", () => {
      // Verify development mode is enabled
      expect(developmentMode.isEnabled()).toBe(true);

      // Test development mode features
      const devConfig = developmentMode.getConfig();
      expect(devConfig.enabled).toBe(true);
      expect(devConfig.disableSignatureVerification).toBe(true);
    });

    it("should bypass signature verification in development", async () => {
      const status =
        signatureVerificationService.getVerificationStatus("any-key");
      expect(status.enabled).toBe(true);

      // Signature verification should not throw in development mode
      await expect(
        signatureVerificationService.verifyWebhookSignature(
          { headers: {} } as any, // Mock request with headers
          { signingKey: "any-key" },
        ),
      ).resolves.not.toThrow();
    });
  });
});
