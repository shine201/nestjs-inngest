import { Test, TestingModule } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';
import { InngestService } from '../../services/inngest.service';
import { FunctionRegistry } from '../../services/function-registry.service';
import { ExecutionContextService } from '../../services/execution-context.service';
import { InngestTestingModule, InngestTestUtils } from '../../testing/inngest-testing.module';
import { InngestFunction } from '../../decorators/inngest-function.decorator';
import { TypedInngestFunction } from '../../decorators/typed-inngest-function.decorator';
import { EventTypes } from '../../utils/event-types';
import { MergedInngestConfig } from '../../utils/config-validation';
import { InngestEvent } from '../../interfaces/inngest-event.interface';

// Event types for workflow testing
type WorkflowEventTypes = EventTypes<{
  'workflow.started': { workflowId: string; userId: string; type: string };
  'user.onboarding.started': { userId: string; email: string; plan: string };
  'user.verification.completed': { userId: string; verified: boolean };
  'user.profile.created': { userId: string; profileId: string; data: any };
  'notification.welcome.sent': { userId: string; notificationId: string };
  'workflow.completed': { workflowId: string; userId: string; result: any };
  'order.created': { orderId: string; userId: string; items: any[] };
  'payment.processed': { orderId: string; paymentId: string; amount: number };
  'inventory.updated': { items: Array<{ id: string; quantity: number }> };
  'notification.order.confirmed': { orderId: string; userId: string };
  'analytics.event.tracked': { eventType: string; data: any; timestamp: number };
}>;

// Test service for complex event workflows
@Injectable()
class WorkflowTestService {
  constructor(private readonly inngestService: InngestService) {}

  // User onboarding workflow
  @TypedInngestFunction<WorkflowEventTypes>({
    id: 'user-onboarding-start',
    name: 'Start User Onboarding',
    triggers: [{ event: 'user.onboarding.started' }],
  })
  async startUserOnboarding(event: WorkflowEventTypes['user.onboarding.started'], { step }: any) {
    const { userId, email, plan } = event.data;

    // Step 1: Create user profile
    const profile = await step.run('create-profile', async () => {
      const profileData = {
        userId,
        email,
        plan,
        createdAt: new Date().toISOString(),
        status: 'pending_verification',
      };

      // Send profile created event
      await this.inngestService.send(
        InngestTestUtils.createTestEvent('user.profile.created', {
          userId,
          profileId: `profile_${userId}`,
          data: profileData,
        })
      );

      return profileData;
    });

    // Step 2: Trigger email verification
    await step.run('trigger-verification', async () => {
      // Simulate verification process
      await InngestTestUtils.wait(100);
      
      // Send verification completed event
      await this.inngestService.send(
        InngestTestUtils.createTestEvent('user.verification.completed', {
          userId,
          verified: true,
        })
      );

      return { verificationTriggered: true };
    });

    // Step 3: Track analytics
    await step.run('track-onboarding-start', async () => {
      await this.inngestService.send(
        InngestTestUtils.createTestEvent('analytics.event.tracked', {
          eventType: 'user_onboarding_started',
          data: { userId, plan },
          timestamp: Date.now(),
        })
      );

      return { analyticsTracked: true };
    });

    return {
      success: true,
      userId,
      profile,
      onboardingStarted: true,
    };
  }

  @TypedInngestFunction<WorkflowEventTypes>({
    id: 'user-verification-handler',
    name: 'Handle User Verification',
    triggers: [{ event: 'user.verification.completed' }],
  })
  async handleUserVerification(event: WorkflowEventTypes['user.verification.completed'], { step }: any) {
    const { userId, verified } = event.data;

    if (!verified) {
      return {
        success: false,
        userId,
        message: 'User verification failed',
      };
    }

    // Step 1: Update profile status
    const profileUpdate = await step.run('update-profile-status', async () => {
      return {
        userId,
        status: 'verified',
        verifiedAt: new Date().toISOString(),
      };
    });

    // Step 2: Send welcome notification
    await step.run('send-welcome-notification', async () => {
      await this.inngestService.send(
        InngestTestUtils.createTestEvent('notification.welcome.sent', {
          userId,
          notificationId: `welcome_${userId}_${Date.now()}`,
        })
      );

      return { welcomeNotificationSent: true };
    });

    // Step 3: Complete onboarding workflow
    await step.run('complete-onboarding', async () => {
      await this.inngestService.send(
        InngestTestUtils.createTestEvent('workflow.completed', {
          workflowId: `onboarding_${userId}`,
          userId,
          result: {
            type: 'user_onboarding',
            status: 'completed',
            completedAt: new Date().toISOString(),
          },
        })
      );

      return { onboardingCompleted: true };
    });

    return {
      success: true,
      userId,
      verified: true,
      profileUpdate,
    };
  }

  @TypedInngestFunction<WorkflowEventTypes>({
    id: 'welcome-notification-handler',
    name: 'Handle Welcome Notification',
    triggers: [{ event: 'notification.welcome.sent' }],
  })
  async handleWelcomeNotification(event: WorkflowEventTypes['notification.welcome.sent'], { step }: any) {
    const { userId, notificationId } = event.data;

    // Step 1: Log notification delivery
    const delivery = await step.run('log-notification-delivery', async () => {
      return {
        notificationId,
        userId,
        deliveredAt: new Date().toISOString(),
        channel: 'email',
        status: 'delivered',
      };
    });

    // Step 2: Track analytics
    await step.run('track-welcome-notification', async () => {
      await this.inngestService.send(
        InngestTestUtils.createTestEvent('analytics.event.tracked', {
          eventType: 'welcome_notification_sent',
          data: { userId, notificationId },
          timestamp: Date.now(),
        })
      );

      return { analyticsTracked: true };
    });

    return {
      success: true,
      notificationId,
      delivery,
    };
  }

  // Order processing workflow
  @TypedInngestFunction<WorkflowEventTypes>({
    id: 'order-processor',
    name: 'Process Order',
    triggers: [{ event: 'order.created' }],
  })
  async processOrder(event: WorkflowEventTypes['order.created'], { step }: any) {
    const { orderId, userId, items } = event.data;

    // Step 1: Validate order
    const validation = await step.run('validate-order', async () => {
      if (!items || items.length === 0) {
        throw new Error('Order must contain at least one item');
      }

      return {
        orderId,
        valid: true,
        itemCount: items.length,
        validatedAt: new Date().toISOString(),
      };
    });

    // Step 2: Calculate total amount
    const calculation = await step.run('calculate-total', async () => {
      const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      return {
        orderId,
        subtotal: total,
        tax: total * 0.1,
        total: total * 1.1,
      };
    });

    // Step 3: Process payment
    const payment = await step.run('process-payment', async () => {
      const paymentId = `payment_${orderId}_${Date.now()}`;
      
      // Send payment processed event
      await this.inngestService.send(
        InngestTestUtils.createTestEvent('payment.processed', {
          orderId,
          paymentId,
          amount: calculation.total,
        })
      );

      return {
        paymentId,
        amount: calculation.total,
        status: 'processed',
        processedAt: new Date().toISOString(),
      };
    });

    // Step 4: Update inventory
    await step.run('update-inventory', async () => {
      const inventoryUpdates = items.map(item => ({
        id: item.id,
        quantity: -item.quantity, // Decrease inventory
      }));

      await this.inngestService.send(
        InngestTestUtils.createTestEvent('inventory.updated', {
          items: inventoryUpdates,
        })
      );

      return { inventoryUpdated: true, updates: inventoryUpdates };
    });

    // Step 5: Send order confirmation
    await step.run('send-confirmation', async () => {
      await this.inngestService.send(
        InngestTestUtils.createTestEvent('notification.order.confirmed', {
          orderId,
          userId,
        })
      );

      return { confirmationSent: true };
    });

    return {
      success: true,
      orderId,
      validation,
      calculation,
      payment,
    };
  }

  @TypedInngestFunction<WorkflowEventTypes>({
    id: 'payment-handler',
    name: 'Handle Payment Processing',
    triggers: [{ event: 'payment.processed' }],
  })
  async handlePaymentProcessed(event: WorkflowEventTypes['payment.processed'], { step }: any) {
    const { orderId, paymentId, amount } = event.data;

    // Step 1: Record payment
    const record = await step.run('record-payment', async () => {
      return {
        paymentId,
        orderId,
        amount,
        recordedAt: new Date().toISOString(),
        status: 'recorded',
      };
    });

    // Step 2: Track analytics
    await step.run('track-payment-analytics', async () => {
      await this.inngestService.send(
        InngestTestUtils.createTestEvent('analytics.event.tracked', {
          eventType: 'payment_processed',
          data: { orderId, paymentId, amount },
          timestamp: Date.now(),
        })
      );

      return { analyticsTracked: true };
    });

    return {
      success: true,
      paymentId,
      record,
    };
  }

  @TypedInngestFunction<WorkflowEventTypes>({
    id: 'inventory-handler',
    name: 'Handle Inventory Updates',
    triggers: [{ event: 'inventory.updated' }],
  })
  async handleInventoryUpdate(event: WorkflowEventTypes['inventory.updated'], { step }: any) {
    const { items } = event.data;

    // Step 1: Process inventory changes
    const changes = await step.run('process-inventory-changes', async () => {
      const processedItems = items.map(item => ({
        ...item,
        processedAt: new Date().toISOString(),
        newQuantity: Math.max(0, 100 + item.quantity), // Simulate current inventory
      }));

      return {
        itemsProcessed: processedItems.length,
        changes: processedItems,
      };
    });

    // Step 2: Check for low stock alerts
    await step.run('check-low-stock', async () => {
      const lowStockItems = changes.changes.filter(item => item.newQuantity < 10);
      
      if (lowStockItems.length > 0) {
        await this.inngestService.send(
          InngestTestUtils.createTestEvent('analytics.event.tracked', {
            eventType: 'low_stock_alert',
            data: { items: lowStockItems },
            timestamp: Date.now(),
          })
        );
      }

      return { lowStockAlerts: lowStockItems.length };
    });

    return {
      success: true,
      changes,
    };
  }

  @TypedInngestFunction<WorkflowEventTypes>({
    id: 'analytics-tracker',
    name: 'Track Analytics Events',
    triggers: [{ event: 'analytics.event.tracked' }],
  })
  async trackAnalytics(event: WorkflowEventTypes['analytics.event.tracked'], { step }: any) {
    const { eventType, data, timestamp } = event.data;

    // Step 1: Store analytics event
    const storage = await step.run('store-analytics', async () => {
      return {
        eventId: `analytics_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        eventType,
        data,
        timestamp,
        storedAt: new Date().toISOString(),
      };
    });

    // Step 2: Update aggregations
    await step.run('update-aggregations', async () => {
      return {
        eventType,
        aggregated: true,
        aggregatedAt: new Date().toISOString(),
      };
    });

    return {
      success: true,
      eventType,
      storage,
    };
  }

  // Helper methods for testing
  async triggerUserOnboarding(userId: string, email: string, plan: string = 'basic') {
    return await this.inngestService.send(
      InngestTestUtils.createTestEvent('user.onboarding.started', {
        userId,
        email,
        plan,
      })
    );
  }

  async triggerOrderCreation(orderId: string, userId: string, items: any[]) {
    return await this.inngestService.send(
      InngestTestUtils.createTestEvent('order.created', {
        orderId,
        userId,
        items,
      })
    );
  }

  async triggerWorkflowStart(workflowId: string, userId: string, type: string) {
    return await this.inngestService.send(
      InngestTestUtils.createTestEvent('workflow.started', {
        workflowId,
        userId,
        type,
      })
    );
  }
}

describe('Event Workflow Integration Tests', () => {
  let module: TestingModule;
  let inngestService: InngestService;
  let functionRegistry: FunctionRegistry;
  let executionContextService: ExecutionContextService;
  let workflowService: WorkflowTestService;
  let testConfig: MergedInngestConfig;

  beforeAll(async () => {
    testConfig = {
      appId: 'workflow-integration-test',
      signingKey: 'workflow-integration-key',
      eventKey: 'workflow-event-key',
      endpoint: '/api/inngest',
      env: 'test',
      isDev: true,
      logger: true,
      timeout: 10000,
      maxBatchSize: 100,
      strict: false,
      retry: {
        maxAttempts: 3,
        backoff: 'exponential',
        initialDelay: 100,
      },
      development: {
        enabled: true,
        disableSignatureVerification: true,
      },
    };

    module = await Test.createTestingModule({
      imports: [
        InngestTestingModule.forIntegrationTest({
          useRealServices: true,
          includeController: true,
          mockConfig: testConfig,
        }),
      ],
      providers: [WorkflowTestService],
    }).compile();

    inngestService = module.get<InngestService>(InngestService);
    functionRegistry = module.get<FunctionRegistry>(FunctionRegistry);
    executionContextService = module.get<ExecutionContextService>(ExecutionContextService);
    workflowService = module.get<WorkflowTestService>(WorkflowTestService);
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('User Onboarding Workflow', () => {
    it('should register all onboarding workflow functions', () => {
      const onboardingFunctions = [
        'user-onboarding-start',
        'user-verification-handler',
        'welcome-notification-handler',
      ];

      onboardingFunctions.forEach(functionId => {
        const func = functionRegistry.getFunction(functionId);
        expect(func).toBeDefined();
        expect(func.id).toBe(functionId);
      });
    });

    it('should execute complete user onboarding workflow', async () => {
      const userId = 'user-onboarding-test';
      const email = 'test@onboarding.com';
      const plan = 'premium';

      // Trigger onboarding start
      await workflowService.triggerUserOnboarding(userId, email, plan);

      // Execute onboarding start function
      const onboardingEvent = InngestTestUtils.createTestEvent('user.onboarding.started', {
        userId,
        email,
        plan,
      });

      const onboardingFunction = functionRegistry.getFunction('user-onboarding-start');
      const onboardingContext = await executionContextService.createExecutionContext(
        onboardingFunction,
        onboardingEvent,
        'onboarding-run-' + Date.now(),
        1
      );

      const onboardingResult = await executionContextService.executeFunction(onboardingContext);

      expect(onboardingResult.success).toBe(true);
      expect(onboardingResult.userId).toBe(userId);
      expect(onboardingResult.profile.email).toBe(email);
      expect(onboardingResult.profile.plan).toBe(plan);
      expect(onboardingResult.onboardingStarted).toBe(true);

      // Execute verification handler function
      const verificationEvent = InngestTestUtils.createTestEvent('user.verification.completed', {
        userId,
        verified: true,
      });

      const verificationFunction = functionRegistry.getFunction('user-verification-handler');
      const verificationContext = await executionContextService.createExecutionContext(
        verificationFunction,
        verificationEvent,
        'verification-run-' + Date.now(),
        1
      );

      const verificationResult = await executionContextService.executeFunction(verificationContext);

      expect(verificationResult.success).toBe(true);
      expect(verificationResult.userId).toBe(userId);
      expect(verificationResult.verified).toBe(true);
      expect(verificationResult.profileUpdate.status).toBe('verified');

      // Execute welcome notification handler
      const notificationEvent = InngestTestUtils.createTestEvent('notification.welcome.sent', {
        userId,
        notificationId: `welcome_${userId}_test`,
      });

      const notificationFunction = functionRegistry.getFunction('welcome-notification-handler');
      const notificationContext = await executionContextService.createExecutionContext(
        notificationFunction,
        notificationEvent,
        'notification-run-' + Date.now(),
        1
      );

      const notificationResult = await executionContextService.executeFunction(notificationContext);

      expect(notificationResult.success).toBe(true);
      expect(notificationResult.notificationId).toBe(`welcome_${userId}_test`);
      expect(notificationResult.delivery.status).toBe('delivered');
    });

    it('should handle failed verification in onboarding workflow', async () => {
      const userId = 'user-failed-verification';

      const verificationEvent = InngestTestUtils.createTestEvent('user.verification.completed', {
        userId,
        verified: false,
      });

      const verificationFunction = functionRegistry.getFunction('user-verification-handler');
      const verificationContext = await executionContextService.createExecutionContext(
        verificationFunction,
        verificationEvent,
        'failed-verification-run-' + Date.now(),
        1
      );

      const result = await executionContextService.executeFunction(verificationContext);

      expect(result.success).toBe(false);
      expect(result.userId).toBe(userId);
      expect(result.message).toBe('User verification failed');
    });
  });

  describe('Order Processing Workflow', () => {
    it('should register all order processing functions', () => {
      const orderFunctions = [
        'order-processor',
        'payment-handler',
        'inventory-handler',
      ];

      orderFunctions.forEach(functionId => {
        const func = functionRegistry.getFunction(functionId);
        expect(func).toBeDefined();
        expect(func.id).toBe(functionId);
      });
    });

    it('should execute complete order processing workflow', async () => {
      const orderId = 'order-workflow-test';
      const userId = 'user-order-test';
      const items = [
        { id: 'item1', name: 'Product 1', price: 29.99, quantity: 2 },
        { id: 'item2', name: 'Product 2', price: 19.99, quantity: 1 },
      ];

      // Trigger order creation
      await workflowService.triggerOrderCreation(orderId, userId, items);

      // Execute order processor
      const orderEvent = InngestTestUtils.createTestEvent('order.created', {
        orderId,
        userId,
        items,
      });

      const orderFunction = functionRegistry.getFunction('order-processor');
      const orderContext = await executionContextService.createExecutionContext(
        orderFunction,
        orderEvent,
        'order-run-' + Date.now(),
        1
      );

      const orderResult = await executionContextService.executeFunction(orderContext);

      expect(orderResult.success).toBe(true);
      expect(orderResult.orderId).toBe(orderId);
      expect(orderResult.validation.valid).toBe(true);
      expect(orderResult.validation.itemCount).toBe(2);
      expect(orderResult.calculation.subtotal).toBe(79.97); // (29.99*2) + (19.99*1)
      expect(orderResult.calculation.total).toBe(87.967); // subtotal * 1.1
      expect(orderResult.payment.status).toBe('processed');

      // Execute payment handler
      const paymentEvent = InngestTestUtils.createTestEvent('payment.processed', {
        orderId,
        paymentId: orderResult.payment.paymentId,
        amount: orderResult.payment.amount,
      });

      const paymentFunction = functionRegistry.getFunction('payment-handler');
      const paymentContext = await executionContextService.createExecutionContext(
        paymentFunction,
        paymentEvent,
        'payment-run-' + Date.now(),
        1
      );

      const paymentResult = await executionContextService.executeFunction(paymentContext);

      expect(paymentResult.success).toBe(true);
      expect(paymentResult.paymentId).toBe(orderResult.payment.paymentId);
      expect(paymentResult.record.status).toBe('recorded');

      // Execute inventory handler
      const inventoryEvent = InngestTestUtils.createTestEvent('inventory.updated', {
        items: [
          { id: 'item1', quantity: -2 },
          { id: 'item2', quantity: -1 },
        ],
      });

      const inventoryFunction = functionRegistry.getFunction('inventory-handler');
      const inventoryContext = await executionContextService.createExecutionContext(
        inventoryFunction,
        inventoryEvent,
        'inventory-run-' + Date.now(),
        1
      );

      const inventoryResult = await executionContextService.executeFunction(inventoryContext);

      expect(inventoryResult.success).toBe(true);
      expect(inventoryResult.changes.itemsProcessed).toBe(2);
      expect(inventoryResult.changes.changes[0].newQuantity).toBe(98); // 100 + (-2)
      expect(inventoryResult.changes.changes[1].newQuantity).toBe(99); // 100 + (-1)
    });

    it('should handle invalid orders', async () => {
      const orderId = 'invalid-order-test';
      const userId = 'user-invalid-order';
      const items: any[] = []; // Empty items array

      const orderEvent = InngestTestUtils.createTestEvent('order.created', {
        orderId,
        userId,
        items,
      });

      const orderFunction = functionRegistry.getFunction('order-processor');
      const orderContext = await executionContextService.createExecutionContext(
        orderFunction,
        orderEvent,
        'invalid-order-run-' + Date.now(),
        1
      );

      await expect(
        executionContextService.executeFunction(orderContext)
      ).rejects.toThrow('Order must contain at least one item');
    });

    it('should trigger low stock alerts', async () => {
      const inventoryEvent = InngestTestUtils.createTestEvent('inventory.updated', {
        items: [
          { id: 'low-stock-item', quantity: -95 }, // This will result in quantity 5 (below threshold of 10)
        ],
      });

      const inventoryFunction = functionRegistry.getFunction('inventory-handler');
      const inventoryContext = await executionContextService.createExecutionContext(
        inventoryFunction,
        inventoryEvent,
        'low-stock-run-' + Date.now(),
        1
      );

      const result = await executionContextService.executeFunction(inventoryContext);

      expect(result.success).toBe(true);
      expect(result.changes.changes[0].newQuantity).toBe(5); // Below threshold
    });
  });

  describe('Analytics Tracking Workflow', () => {
    it('should track analytics events from all workflows', async () => {
      const analyticsEvent = InngestTestUtils.createTestEvent('analytics.event.tracked', {
        eventType: 'test_event',
        data: { userId: 'analytics-test-user', action: 'test_action' },
        timestamp: Date.now(),
      });

      const analyticsFunction = functionRegistry.getFunction('analytics-tracker');
      const analyticsContext = await executionContextService.createExecutionContext(
        analyticsFunction,
        analyticsEvent,
        'analytics-run-' + Date.now(),
        1
      );

      const result = await executionContextService.executeFunction(analyticsContext);

      expect(result.success).toBe(true);
      expect(result.eventType).toBe('test_event');
      expect(result.storage.eventType).toBe('test_event');
      expect(result.storage.eventId).toBeDefined();
    });
  });

  describe('Complex Multi-Step Workflows', () => {
    it('should handle cascading events across multiple functions', async () => {
      // Test complete user onboarding + order processing workflow
      const userId = 'cascade-user';
      const email = 'cascade@test.com';
      const orderId = 'cascade-order';

      // Step 1: Start onboarding
      const onboardingEvent = InngestTestUtils.createTestEvent('user.onboarding.started', {
        userId,
        email,
        plan: 'premium',
      });

      const onboardingFunction = functionRegistry.getFunction('user-onboarding-start');
      const onboardingContext = await executionContextService.createExecutionContext(
        onboardingFunction,
        onboardingEvent,
        'cascade-onboarding-' + Date.now(),
        1
      );

      const onboardingResult = await executionContextService.executeFunction(onboardingContext);
      expect(onboardingResult.success).toBe(true);

      // Step 2: Complete verification
      const verificationEvent = InngestTestUtils.createTestEvent('user.verification.completed', {
        userId,
        verified: true,
      });

      const verificationFunction = functionRegistry.getFunction('user-verification-handler');
      const verificationContext = await executionContextService.createExecutionContext(
        verificationFunction,
        verificationEvent,
        'cascade-verification-' + Date.now(),
        1
      );

      const verificationResult = await executionContextService.executeFunction(verificationContext);
      expect(verificationResult.success).toBe(true);

      // Step 3: Process an order for the user
      const orderEvent = InngestTestUtils.createTestEvent('order.created', {
        orderId,
        userId,
        items: [{ id: 'premium-item', name: 'Premium Product', price: 99.99, quantity: 1 }],
      });

      const orderFunction = functionRegistry.getFunction('order-processor');
      const orderContext = await executionContextService.createExecutionContext(
        orderFunction,
        orderEvent,
        'cascade-order-' + Date.now(),
        1
      );

      const orderResult = await executionContextService.executeFunction(orderContext);
      expect(orderResult.success).toBe(true);
      expect(orderResult.orderId).toBe(orderId);
      expect(orderResult.calculation.subtotal).toBe(99.99);
    });

    it('should handle concurrent workflows for different users', async () => {
      const userCount = 5;
      const workflows = [];

      for (let i = 0; i < userCount; i++) {
        const userId = `concurrent-user-${i}`;
        const email = `user${i}@concurrent.test`;

        const onboardingEvent = InngestTestUtils.createTestEvent('user.onboarding.started', {
          userId,
          email,
          plan: 'basic',
        });

        const onboardingFunction = functionRegistry.getFunction('user-onboarding-start');
        const onboardingContext = await executionContextService.createExecutionContext(
          onboardingFunction,
          onboardingEvent,
          `concurrent-onboarding-${i}-${Date.now()}`,
          1
        );

        workflows.push(executionContextService.executeFunction(onboardingContext));
      }

      const results = await Promise.all(workflows);

      expect(results).toHaveLength(userCount);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.userId).toBe(`concurrent-user-${index}`);
        expect(result.profile.plan).toBe('basic');
      });
    });
  });

  describe('Event Sending and Triggering Performance', () => {
    it('should handle high-volume event cascades', async () => {
      const eventCount = 20;
      const batchEvents = [];

      for (let i = 0; i < eventCount; i++) {
        batchEvents.push({
          name: 'analytics.event.tracked',
          data: {
            eventType: 'bulk_test_event',
            data: { index: i, timestamp: Date.now() },
            timestamp: Date.now(),
          },
        });
      }

      const startTime = Date.now();
      
      // Send events in smaller batches
      const batchSize = 5;
      const promises = [];
      
      for (let i = 0; i < batchEvents.length; i += batchSize) {
        const batch = batchEvents.slice(i, i + batchSize);
        const inngestEvents = batch.map(({ name, data }) =>
          InngestTestUtils.createTestEvent(name, data)
        );
        
        promises.push(inngestService.send(inngestEvents));
      }

      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(Math.ceil(eventCount / batchSize));
      
      // All results should be undefined (void) in test mode
      results.forEach(result => {
        expect(result).toBeUndefined();
      });

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should maintain function execution performance under load', async () => {
      const concurrentFunctions = 10;
      const executions = [];

      for (let i = 0; i < concurrentFunctions; i++) {
        const analyticsEvent = InngestTestUtils.createTestEvent('analytics.event.tracked', {
          eventType: `performance_test_${i}`,
          data: { index: i, performance: true },
          timestamp: Date.now(),
        });

        const analyticsFunction = functionRegistry.getFunction('analytics-tracker');
        const analyticsContext = await executionContextService.createExecutionContext(
          analyticsFunction,
          analyticsEvent,
          `performance-analytics-${i}-${Date.now()}`,
          1
        );

        executions.push(executionContextService.executeFunction(analyticsContext));
      }

      const startTime = Date.now();
      const results = await Promise.all(executions);
      const endTime = Date.now();

      expect(results).toHaveLength(concurrentFunctions);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.eventType).toBe(`performance_test_${index}`);
      });

      // Should complete all functions within reasonable time
      expect(endTime - startTime).toBeLessThan(3000);
    });
  });
});