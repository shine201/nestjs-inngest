# Usage Guide and Best Practices

This guide provides comprehensive usage patterns, best practices, and real-world examples for using nestjs-inngest effectively in your NestJS applications.

## Table of Contents

- [Getting Started](#getting-started)
- [Configuration Patterns](#configuration-patterns)
- [Function Design Patterns](#function-design-patterns)
- [Event Design Patterns](#event-design-patterns)
- [Error Handling Strategies](#error-handling-strategies)
- [Testing Strategies](#testing-strategies)
- [Performance Optimization](#performance-optimization)
- [Production Deployment](#production-deployment)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Project Setup Checklist

1. **Install Dependencies**
   ```bash
   npm install nestjs-inngest inngest
   npm install --save-dev @types/node
   ```

2. **Environment Variables**
   ```bash
   # .env
   INNGEST_APP_ID=your-app-name
   INNGEST_SIGNING_KEY=signkey-prod-xxxx
   INNGEST_EVENT_KEY=your-event-key
   NODE_ENV=production
   ```

3. **Module Configuration**
   ```typescript
   // app.module.ts
   @Module({
     imports: [
       ConfigModule.forRoot(),
       InngestModule.forRootAsync({
         imports: [ConfigModule],
         useFactory: (config: ConfigService) => ({
           appId: config.get('INNGEST_APP_ID'),
           signingKey: config.get('INNGEST_SIGNING_KEY'),
           eventKey: config.get('INNGEST_EVENT_KEY'),
           env: config.get('NODE_ENV') as InngestEnvironment,
         }),
         inject: [ConfigService],
       }),
     ],
   })
   export class AppModule {}
   ```

## Configuration Patterns

### Environment-Based Configuration

```typescript
// config/inngest.config.ts
import { InngestModuleConfig } from 'nestjs-inngest';

export const getInngestConfig = (): InngestModuleConfig => {
  const env = process.env.NODE_ENV || 'development';
  
  const baseConfig: InngestModuleConfig = {
    appId: process.env.INNGEST_APP_ID!,
    signingKey: process.env.INNGEST_SIGNING_KEY,
    eventKey: process.env.INNGEST_EVENT_KEY,
  };

  switch (env) {
    case 'production':
      return {
        ...baseConfig,
        env: 'production',
        logger: false,
        strict: true,
        timeout: 30000,
        retry: {
          maxAttempts: 5,
          backoff: 'exponential',
          initialDelay: 1000,
          maxDelay: 60000,
        },
      };

    case 'staging':
      return {
        ...baseConfig,
        env: 'production',
        logger: true,
        strict: true,
        timeout: 30000,
        development: {
          enabled: false,
          disableSignatureVerification: false,
        },
      };

    case 'development':
      return {
        ...baseConfig,
        env: 'development',
        logger: true,
        strict: false,
        isDev: true,
        timeout: 5000,
        development: {
          enabled: true,
          disableSignatureVerification: true,
        },
      };

    default:
      return baseConfig;
  }
};
```

### Multi-Environment Module Setup

```typescript
// modules/inngest.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InngestModule } from 'nestjs-inngest';
import { getInngestConfig } from '../config/inngest.config';

@Module({
  imports: [
    InngestModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const config = getInngestConfig();
        
        // Override with environment-specific values
        return {
          ...config,
          appId: configService.get('INNGEST_APP_ID', config.appId),
          signingKey: configService.get('INNGEST_SIGNING_KEY', config.signingKey),
          eventKey: configService.get('INNGEST_EVENT_KEY', config.eventKey),
        };
      },
      inject: [ConfigService],
    }),
  ],
  exports: [InngestModule],
})
export class AppInngestModule {}
```

## Function Design Patterns

### Single Responsibility Functions

```typescript
@Injectable()
export class UserService {
  constructor(
    private readonly emailService: EmailService,
    private readonly userRepository: UserRepository,
  ) {}

  // ✅ Good: Single responsibility - welcome email
  @InngestFunction({
    id: 'send-welcome-email',
    name: 'Send Welcome Email',
    triggers: [{ event: 'user.registered' }],
    retries: 3,
  })
  async sendWelcomeEmail(
    event: InngestEvent<{ userId: string; email: string; name: string }>,
    { step }: InngestFunctionContext
  ) {
    const { userId, email, name } = event.data;

    const user = await step.run('fetch-user', async () => {
      return this.userRepository.findById(userId);
    });

    await step.run('send-email', async () => {
      return this.emailService.sendWelcomeEmail(email, { name });
    });

    await step.run('track-email-sent', async () => {
      return this.userRepository.updateEmailStatus(userId, 'welcome_sent');
    });
  }

  // ✅ Good: Separate function for different responsibility
  @InngestFunction({
    id: 'setup-user-profile',
    name: 'Setup User Profile',
    triggers: [{ event: 'user.registered' }],
  })
  async setupUserProfile(
    event: InngestEvent<{ userId: string }>,
    { step }: InngestFunctionContext
  ) {
    const { userId } = event.data;

    await step.run('create-profile', async () => {
      return this.userRepository.createProfile(userId);
    });

    await step.run('setup-defaults', async () => {
      return this.userRepository.setupDefaults(userId);
    });
  }
}
```

### Complex Workflow Functions

```typescript
@Injectable()
export class OrderService {
  @InngestFunction({
    id: 'process-order-workflow',
    name: 'Process Order Workflow',
    triggers: [{ event: 'order.created' }],
    timeout: 300000, // 5 minutes
    retries: 3,
  })
  async processOrderWorkflow(
    event: InngestEvent<OrderCreatedData>,
    { step }: InngestFunctionContext
  ) {
    const { orderId, userId, items, total } = event.data;

    // Step 1: Validate order
    const order = await step.run('validate-order', async () => {
      const order = await this.orderRepository.findById(orderId);
      if (!order) throw new Error('Order not found');
      return order;
    });

    // Step 2: Check inventory
    const inventoryCheck = await step.run('check-inventory', async () => {
      return this.inventoryService.checkAvailability(items);
    });

    if (!inventoryCheck.available) {
      await step.run('handle-out-of-stock', async () => {
        await this.orderService.markOutOfStock(orderId);
        await step.sendEvent({
          name: 'order.out-of-stock',
          data: { orderId, userId, missingItems: inventoryCheck.missing },
        });
      });
      return { status: 'out-of-stock' };
    }

    // Step 3: Process payment
    const payment = await step.run('process-payment', async () => {
      return this.paymentService.processPayment(orderId, total);
    });

    if (!payment.success) {
      await step.run('handle-payment-failure', async () => {
        await this.orderService.markPaymentFailed(orderId);
        await step.sendEvent({
          name: 'order.payment-failed',
          data: { orderId, userId, reason: payment.error },
        });
      });
      return { status: 'payment-failed' };
    }

    // Step 4: Reserve inventory
    await step.run('reserve-inventory', async () => {
      return this.inventoryService.reserve(items);
    });

    // Step 5: Update order status
    await step.run('confirm-order', async () => {
      return this.orderService.confirm(orderId);
    });

    // Step 6: Send confirmation
    await step.run('send-confirmation', async () => {
      await step.sendEvent({
        name: 'order.confirmed',
        data: { orderId, userId, paymentId: payment.id },
      });
    });

    return { status: 'confirmed', paymentId: payment.id };
  }
}
```

### Scheduled Functions

```typescript
@Injectable()
export class MaintenanceService {
  @InngestFunction({
    id: 'daily-cleanup',
    name: 'Daily Cleanup Task',
    triggers: [{ cron: '0 2 * * *' }], // Daily at 2 AM
  })
  async dailyCleanup(
    event: any,
    { step }: InngestFunctionContext
  ) {
    await step.run('cleanup-temp-files', async () => {
      return this.fileService.cleanupTemporaryFiles();
    });

    await step.run('cleanup-expired-sessions', async () => {
      return this.sessionService.cleanupExpiredSessions();
    });

    await step.run('cleanup-logs', async () => {
      return this.logService.archiveOldLogs();
    });

    const stats = await step.run('generate-stats', async () => {
      return this.analyticsService.generateDailyStats();
    });

    await step.run('send-report', async () => {
      return this.reportService.sendDailyReport(stats);
    });
  }

  @InngestFunction({
    id: 'weekly-backup',
    name: 'Weekly Database Backup',
    triggers: [{ cron: '0 1 * * 0' }], // Weekly on Sunday at 1 AM
  })
  async weeklyBackup(
    event: any,
    { step }: InngestFunctionContext
  ) {
    const backupId = await step.run('create-backup', async () => {
      return this.backupService.createBackup();
    });

    await step.run('verify-backup', async () => {
      return this.backupService.verifyBackup(backupId);
    });

    await step.run('upload-to-storage', async () => {
      return this.storageService.uploadBackup(backupId);
    });

    await step.run('cleanup-old-backups', async () => {
      return this.backupService.cleanupOldBackups();
    });
  }
}
```

## Event Design Patterns

### Type-Safe Event Definitions

```typescript
// types/events.ts
import { EventTypes } from 'nestjs-inngest';

export type AppEvents = EventTypes<{
  // User events
  'user.registered': {
    userId: string;
    email: string;
    name: string;
    registrationSource: 'web' | 'mobile' | 'api';
    timestamp: string;
  };
  
  'user.verified': {
    userId: string;
    verificationMethod: 'email' | 'phone' | 'manual';
    timestamp: string;
  };

  'user.updated': {
    userId: string;
    changes: Record<string, any>;
    updatedBy: string;
    timestamp: string;
  };

  // Order events
  'order.created': {
    orderId: string;
    userId: string;
    items: Array<{
      productId: string;
      quantity: number;
      price: number;
    }>;
    total: number;
    currency: string;
    timestamp: string;
  };

  'order.confirmed': {
    orderId: string;
    userId: string;
    paymentId: string;
    estimatedDelivery: string;
    timestamp: string;
  };

  'order.shipped': {
    orderId: string;
    userId: string;
    trackingNumber: string;
    carrier: string;
    timestamp: string;
  };

  // Payment events
  'payment.processing': {
    paymentId: string;
    orderId: string;
    amount: number;
    currency: string;
    method: 'card' | 'bank' | 'wallet';
    timestamp: string;
  };

  'payment.succeeded': {
    paymentId: string;
    orderId: string;
    amount: number;
    transactionId: string;
    timestamp: string;
  };

  'payment.failed': {
    paymentId: string;
    orderId: string;
    amount: number;
    reason: string;
    retryable: boolean;
    timestamp: string;
  };
}>;
```

### Event Publishing Patterns

```typescript
@Injectable()
export class EventPublisher {
  constructor(private readonly inngestService: InngestService) {}

  // ✅ Good: Centralized event publishing with validation
  async publishUserRegistered(user: User, source: string) {
    const event: AppEvents['user.registered'] = {
      name: 'user.registered',
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        registrationSource: source as any,
        timestamp: new Date().toISOString(),
      },
      id: `user-registered-${user.id}-${Date.now()}`,
      user: { id: user.id },
    };

    await this.inngestService.send(event);
  }

  // ✅ Good: Batch event publishing for related events
  async publishOrderWorkflow(order: Order, payment: Payment) {
    const events: Array<AppEvents[keyof AppEvents]> = [
      {
        name: 'order.created',
        data: {
          orderId: order.id,
          userId: order.userId,
          items: order.items,
          total: order.total,
          currency: order.currency,
          timestamp: new Date().toISOString(),
        },
        id: `order-created-${order.id}`,
        user: { id: order.userId },
      },
      {
        name: 'payment.processing',
        data: {
          paymentId: payment.id,
          orderId: order.id,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method as any,
          timestamp: new Date().toISOString(),
        },
        id: `payment-processing-${payment.id}`,
        user: { id: order.userId },
      },
    ];

    await this.inngestService.send(events);
  }

  // ✅ Good: Conditional event publishing
  async publishUserUpdate(userId: string, changes: Record<string, any>, updatedBy: string) {
    // Only publish if there are meaningful changes
    const meaningfulChanges = Object.keys(changes).filter(
      key => !['updatedAt', 'version'].includes(key)
    );

    if (meaningfulChanges.length === 0) {
      return;
    }

    const event: AppEvents['user.updated'] = {
      name: 'user.updated',
      data: {
        userId,
        changes: Object.fromEntries(
          meaningfulChanges.map(key => [key, changes[key]])
        ),
        updatedBy,
        timestamp: new Date().toISOString(),
      },
      id: `user-updated-${userId}-${Date.now()}`,
      user: { id: userId },
    };

    await this.inngestService.send(event);
  }
}
```

## Error Handling Strategies

### Graceful Error Handling

```typescript
@Injectable()
export class RobustService {
  @InngestFunction({
    id: 'robust-data-processing',
    name: 'Robust Data Processing',
    triggers: [{ event: 'data.process' }],
    retries: 5,
  })
  async processData(
    event: InngestEvent<{ dataId: string }>,
    { step, logger }: InngestFunctionContext
  ) {
    const { dataId } = event.data;

    try {
      // Step 1: Fetch data with retry logic
      const data = await step.run('fetch-data', async () => {
        try {
          return await this.dataService.fetchData(dataId);
        } catch (error) {
          logger.warn(`Failed to fetch data: ${error.message}`);
          // Retryable error - will be retried by Inngest
          throw error;
        }
      });

      // Step 2: Validate data
      const validationResult = await step.run('validate-data', async () => {
        const result = await this.dataService.validateData(data);
        if (!result.valid) {
          // Non-retryable error - mark as failed and continue
          logger.error(`Data validation failed: ${result.errors.join(', ')}`);
          await this.dataService.markAsFailed(dataId, result.errors);
          return { valid: false, errors: result.errors };
        }
        return result;
      });

      if (!validationResult.valid) {
        // Send failure notification
        await step.run('send-failure-notification', async () => {
          await step.sendEvent({
            name: 'data.validation-failed',
            data: { dataId, errors: validationResult.errors },
          });
        });
        return { status: 'failed', reason: 'validation' };
      }

      // Step 3: Process data with error recovery
      const result = await step.run('process-data', async () => {
        try {
          return await this.dataService.processData(data);
        } catch (error) {
          if (error.code === 'TEMPORARY_FAILURE') {
            logger.warn(`Temporary processing failure: ${error.message}`);
            throw error; // Retryable
          } else {
            logger.error(`Permanent processing failure: ${error.message}`);
            await this.dataService.markAsFailed(dataId, [error.message]);
            return { success: false, error: error.message };
          }
        }
      });

      if (!result.success) {
        await step.run('handle-processing-failure', async () => {
          await step.sendEvent({
            name: 'data.processing-failed',
            data: { dataId, error: result.error },
          });
        });
        return { status: 'failed', reason: 'processing' };
      }

      // Step 4: Success handling
      await step.run('mark-as-processed', async () => {
        await this.dataService.markAsProcessed(dataId, result.output);
      });

      await step.run('send-success-notification', async () => {
        await step.sendEvent({
          name: 'data.processed',
          data: { dataId, result: result.output },
        });
      });

      return { status: 'success', result: result.output };

    } catch (error) {
      // Final error handler - this should rarely be reached
      logger.error(`Unhandled error in data processing: ${error.message}`);
      
      await step.run('final-error-handler', async () => {
        await this.dataService.markAsFailed(dataId, [`Unhandled error: ${error.message}`]);
        await step.sendEvent({
          name: 'data.processing-error',
          data: { dataId, error: error.message, fatal: true },
        });
      });

      throw error; // Re-throw to trigger function retry
    }
  }
}
```

### Circuit Breaker Pattern

```typescript
@Injectable()
export class ExternalServiceIntegration {
  private circuitBreaker = new Map<string, {
    failures: number;
    lastFailure: Date;
    isOpen: boolean;
  }>();

  @InngestFunction({
    id: 'external-api-call',
    name: 'External API Call with Circuit Breaker',
    triggers: [{ event: 'api.call' }],
  })
  async callExternalAPI(
    event: InngestEvent<{ service: string; endpoint: string; data: any }>,
    { step, logger }: InngestFunctionContext
  ) {
    const { service, endpoint, data } = event.data;
    const circuitKey = `${service}-${endpoint}`;

    return await step.run('call-with-circuit-breaker', async () => {
      // Check circuit breaker
      const circuit = this.circuitBreaker.get(circuitKey) || {
        failures: 0,
        lastFailure: new Date(0),
        isOpen: false,
      };

      // Circuit breaker logic
      if (circuit.isOpen) {
        const timeSinceLastFailure = Date.now() - circuit.lastFailure.getTime();
        const cooldownPeriod = 60000; // 1 minute

        if (timeSinceLastFailure < cooldownPeriod) {
          logger.warn(`Circuit breaker is open for ${circuitKey}`);
          throw new Error(`Circuit breaker is open for ${service}`);
        } else {
          // Try to close circuit
          circuit.isOpen = false;
          logger.info(`Attempting to close circuit breaker for ${circuitKey}`);
        }
      }

      try {
        const result = await this.externalService.call(service, endpoint, data);
        
        // Reset circuit on success
        circuit.failures = 0;
        circuit.isOpen = false;
        this.circuitBreaker.set(circuitKey, circuit);
        
        return result;
      } catch (error) {
        circuit.failures++;
        circuit.lastFailure = new Date();

        // Open circuit if too many failures
        if (circuit.failures >= 5) {
          circuit.isOpen = true;
          logger.error(`Opening circuit breaker for ${circuitKey} after ${circuit.failures} failures`);
        }

        this.circuitBreaker.set(circuitKey, circuit);
        throw error;
      }
    });
  }
}
```

## Testing Strategies

### Unit Testing Functions

```typescript
// user.service.spec.ts
import { Test } from '@nestjs/testing';
import { InngestTestingModule, InngestTestUtils } from 'nestjs-inngest';
import { UserService } from './user.service';
import { EmailService } from './email.service';
import { UserRepository } from './user.repository';

describe('UserService', () => {
  let service: UserService;
  let emailService: EmailService;
  let userRepository: UserRepository;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        InngestTestingModule.forTest({
          useRealServices: false,
          mockConfig: {
            appId: 'test-app',
            signingKey: 'test-key',
          },
        }),
      ],
      providers: [
        UserService,
        {
          provide: EmailService,
          useValue: {
            sendWelcomeEmail: jest.fn(),
          },
        },
        {
          provide: UserRepository,
          useValue: {
            findById: jest.fn(),
            updateEmailStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    emailService = module.get<EmailService>(EmailService);
    userRepository = module.get<UserRepository>(UserRepository);
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email successfully', async () => {
      const event = InngestTestUtils.createTestEvent('user.registered', {
        userId: '123',
        email: 'test@example.com',
        name: 'Test User',
      });

      const mockUser = { id: '123', email: 'test@example.com', name: 'Test User' };
      const mockContext = InngestTestUtils.createMockExecutionContext(
        'send-welcome-email',
        'run-123',
        event
      );

      // Setup mocks
      mockContext.step.run
        .mockResolvedValueOnce(mockUser) // fetch-user step
        .mockResolvedValueOnce(undefined) // send-email step
        .mockResolvedValueOnce(undefined); // track-email-sent step

      jest.spyOn(userRepository, 'findById').mockResolvedValue(mockUser);
      jest.spyOn(emailService, 'sendWelcomeEmail').mockResolvedValue(undefined);
      jest.spyOn(userRepository, 'updateEmailStatus').mockResolvedValue(undefined);

      // Execute function
      await service.sendWelcomeEmail(event, mockContext);

      // Verify steps were called
      expect(mockContext.step.run).toHaveBeenCalledTimes(3);
      expect(mockContext.step.run).toHaveBeenNthCalledWith(1, 'fetch-user', expect.any(Function));
      expect(mockContext.step.run).toHaveBeenNthCalledWith(2, 'send-email', expect.any(Function));
      expect(mockContext.step.run).toHaveBeenNthCalledWith(3, 'track-email-sent', expect.any(Function));
    });

    it('should handle user not found error', async () => {
      const event = InngestTestUtils.createTestEvent('user.registered', {
        userId: 'non-existent',
        email: 'test@example.com',
        name: 'Test User',
      });

      const mockContext = InngestTestUtils.createMockExecutionContext(
        'send-welcome-email',
        'run-123',
        event
      );

      // Setup mock to throw error
      mockContext.step.run.mockRejectedValueOnce(new Error('User not found'));

      // Execute and expect error
      await expect(service.sendWelcomeEmail(event, mockContext)).rejects.toThrow('User not found');
      
      expect(mockContext.step.run).toHaveBeenCalledTimes(1);
    });
  });
});
```

### Integration Testing

```typescript
// app.integration.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { InngestTestingModule, InngestTestUtils } from 'nestjs-inngest';
import request from 'supertest';

describe('App Integration Tests', () => {
  let app: INestApplication;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        InngestTestingModule.forIntegrationTest({
          useRealServices: true,
          includeController: true,
          mockConfig: {
            appId: 'test-integration-app',
            signingKey: 'test-signing-key',
            development: {
              enabled: true,
              disableSignatureVerification: true,
            },
          },
        }),
        // Your app modules here
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await module.close();
  });

  it('should handle complete user registration workflow', async () => {
    // Test the complete workflow from event to function execution
    const userRegistrationEvent = InngestTestUtils.createTestEvent('user.registered', {
      userId: 'integration-test-user',
      email: 'integration@test.com',
      name: 'Integration Test User',
    });

    const webhookRequest = InngestTestUtils.createTestWebhookRequest(
      'send-welcome-email',
      userRegistrationEvent
    );

    const response = await request(app.getHttpServer())
      .post('/api/inngest')
      .send(webhookRequest)
      .expect(200);

    expect(response.body.status).toBe('ok');
    
    // Verify the workflow completed successfully
    // Add your specific assertions here
  });
});
```

## Performance Optimization

### Concurrency Control

```typescript
@Injectable()
export class HighVolumeService {
  @InngestFunction({
    id: 'process-high-volume-data',
    name: 'Process High Volume Data',
    triggers: [{ event: 'data.bulk-process' }],
    concurrency: { limit: 10, key: 'data.processing' }, // Limit concurrent executions
  })
  async processHighVolumeData(
    event: InngestEvent<{ batchId: string; items: any[] }>,
    { step }: InngestFunctionContext
  ) {
    const { batchId, items } = event.data;

    // Process in smaller chunks to avoid memory issues
    const chunkSize = 100;
    const results = [];

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      
      const chunkResult = await step.run(`process-chunk-${i}`, async () => {
        return this.processChunk(chunk);
      });

      results.push(chunkResult);

      // Optional: Add delay between chunks to avoid overwhelming external services
      if (i + chunkSize < items.length) {
        await step.sleep('wait-between-chunks', '1s');
      }
    }

    await step.run('save-results', async () => {
      return this.saveResults(batchId, results);
    });

    return { batchId, processedCount: items.length, chunks: results.length };
  }

  @InngestFunction({
    id: 'rate-limited-api-calls',
    name: 'Rate Limited API Calls',
    triggers: [{ event: 'api.batch-call' }],
    rateLimit: { limit: 100, period: '1m' }, // 100 executions per minute
  })
  async rateLimitedAPICalls(
    event: InngestEvent<{ requests: any[] }>,
    { step }: InngestFunctionContext
  ) {
    const { requests } = event.data;
    
    const results = [];
    for (const [index, request] of requests.entries()) {
      const result = await step.run(`api-call-${index}`, async () => {
        return this.externalAPIService.call(request);
      });
      results.push(result);
      
      // Rate limiting delay
      if (index < requests.length - 1) {
        await step.sleep('rate-limit-delay', '600ms'); // ~100 calls per minute
      }
    }
    
    return results;
  }
}
```

### Memory Management

```typescript
@Injectable()
export class MemoryEfficientService {
  @InngestFunction({
    id: 'process-large-file',
    name: 'Process Large File',
    triggers: [{ event: 'file.process' }],
    timeout: 600000, // 10 minutes for large file processing
  })
  async processLargeFile(
    event: InngestEvent<{ fileId: string; fileSize: number }>,
    { step, logger }: InngestFunctionContext
  ) {
    const { fileId, fileSize } = event.data;

    // Use streaming for large files
    if (fileSize > 100 * 1024 * 1024) { // 100MB
      return await this.processLargeFileStream(fileId, step, logger);
    } else {
      return await this.processSmallFile(fileId, step);
    }
  }

  private async processLargeFileStream(
    fileId: string,
    step: any,
    logger: any
  ) {
    let processedChunks = 0;
    let totalSize = 0;

    const stream = await step.run('create-file-stream', async () => {
      return this.fileService.createReadStream(fileId);
    });

    // Process file in chunks to manage memory
    return new Promise((resolve, reject) => {
      stream.on('data', async (chunk: Buffer) => {
        try {
          await step.run(`process-chunk-${processedChunks}`, async () => {
            await this.processChunk(chunk);
            processedChunks++;
            totalSize += chunk.length;
            
            // Log progress every 100 chunks
            if (processedChunks % 100 === 0) {
              logger.info(`Processed ${processedChunks} chunks, ${totalSize} bytes`);
            }
          });
        } catch (error) {
          reject(error);
        }
      });

      stream.on('end', () => {
        resolve({ processedChunks, totalSize });
      });

      stream.on('error', reject);
    });
  }
}
```

## Production Deployment

### Health Checks and Monitoring

```typescript
@Injectable()
export class MonitoringService {
  @InngestFunction({
    id: 'health-check',
    name: 'System Health Check',
    triggers: [{ cron: '*/5 * * * *' }], // Every 5 minutes
  })
  async performHealthCheck(
    event: any,
    { step, logger }: InngestFunctionContext
  ) {
    const checks = [];

    // Database health
    const dbHealth = await step.run('check-database', async () => {
      try {
        await this.databaseService.ping();
        return { status: 'healthy', responseTime: Date.now() };
      } catch (error) {
        return { status: 'unhealthy', error: error.message };
      }
    });
    checks.push({ name: 'database', ...dbHealth });

    // External API health
    const apiHealth = await step.run('check-external-apis', async () => {
      const results = await Promise.allSettled([
        this.paymentService.healthCheck(),
        this.emailService.healthCheck(),
        this.storageService.healthCheck(),
      ]);

      return results.map((result, index) => ({
        service: ['payment', 'email', 'storage'][index],
        status: result.status === 'fulfilled' ? 'healthy' : 'unhealthy',
        error: result.status === 'rejected' ? result.reason : undefined,
      }));
    });
    checks.push(...apiHealth);

    // Memory usage
    const memoryUsage = await step.run('check-memory', async () => {
      const usage = process.memoryUsage();
      return {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external,
        rss: usage.rss,
      };
    });

    // Alert if any checks failed
    const failedChecks = checks.filter(check => check.status === 'unhealthy');
    if (failedChecks.length > 0) {
      await step.run('send-alert', async () => {
        await this.alertService.sendHealthAlert(failedChecks);
      });
    }

    // Log metrics
    await step.run('log-metrics', async () => {
      await this.metricsService.recordHealthMetrics(checks, memoryUsage);
    });

    return {
      timestamp: new Date().toISOString(),
      status: failedChecks.length === 0 ? 'healthy' : 'degraded',
      checks,
      memoryUsage,
    };
  }
}
```

### Graceful Shutdown

```typescript
// app.module.ts
import { Module, OnModuleDestroy } from '@nestjs/common';
import { InngestService } from 'nestjs-inngest';

@Module({
  // ... module configuration
})
export class AppModule implements OnModuleDestroy {
  constructor(private readonly inngestService: InngestService) {}

  async onModuleDestroy() {
    // Graceful shutdown logic
    try {
      // Wait for ongoing functions to complete (with timeout)
      await this.waitForFunctionsToComplete(30000); // 30 seconds timeout
      
      // Close Inngest client
      const client = this.inngestService.getClient();
      if (client && typeof client.close === 'function') {
        await client.close();
      }
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
    }
  }

  private async waitForFunctionsToComplete(timeoutMs: number): Promise<void> {
    // Implementation depends on your tracking mechanism
    // This is a placeholder for the concept
    return new Promise((resolve) => {
      setTimeout(resolve, Math.min(timeoutMs, 5000));
    });
  }
}
```

## Common Patterns

### Event Sourcing Pattern

```typescript
@Injectable()
export class EventSourcingService {
  @InngestFunction({
    id: 'handle-domain-event',
    name: 'Handle Domain Event',
    triggers: [{ event: 'domain.*' }], // Listen to all domain events
  })
  async handleDomainEvent(
    event: InngestEvent<any>,
    { step }: InngestFunctionContext
  ) {
    // Store the event in event store
    await step.run('store-event', async () => {
      return this.eventStore.append(event);
    });

    // Update read models
    await step.run('update-read-models', async () => {
      return this.readModelUpdater.update(event);
    });

    // Trigger side effects
    await step.run('trigger-side-effects', async () => {
      const sideEffects = this.sideEffectRegistry.getSideEffects(event.name);
      
      for (const effect of sideEffects) {
        await step.sendEvent({
          name: effect.eventName,
          data: effect.transform(event.data),
        });
      }
    });
  }
}
```

### Saga Pattern

```typescript
@Injectable()
export class PaymentSagaService {
  @InngestFunction({
    id: 'payment-saga-orchestrator',
    name: 'Payment Saga Orchestrator',
    triggers: [{ event: 'payment.saga.start' }],
  })
  async orchestratePayment(
    event: InngestEvent<{ orderId: string; amount: number }>,
    { step }: InngestFunctionContext
  ) {
    const { orderId, amount } = event.data;
    const sagaId = `payment-saga-${orderId}`;

    try {
      // Step 1: Reserve inventory
      await step.run('reserve-inventory', async () => {
        await step.sendEvent({
          name: 'inventory.reserve',
          data: { orderId, sagaId },
        });
      });

      // Wait for inventory reservation confirmation
      const inventoryResult = await step.waitForEvent('inventory.reserved', {
        timeout: '5m',
        if: `async.data.sagaId == "${sagaId}"`,
      });

      if (!inventoryResult.data.success) {
        throw new Error('Inventory reservation failed');
      }

      // Step 2: Process payment
      await step.run('process-payment', async () => {
        await step.sendEvent({
          name: 'payment.process',
          data: { orderId, amount, sagaId },
        });
      });

      // Wait for payment confirmation
      const paymentResult = await step.waitForEvent('payment.processed', {
        timeout: '10m',
        if: `async.data.sagaId == "${sagaId}"`,
      });

      if (!paymentResult.data.success) {
        // Compensate - release inventory
        await step.run('compensate-inventory', async () => {
          await step.sendEvent({
            name: 'inventory.release',
            data: { orderId, sagaId },
          });
        });
        throw new Error('Payment processing failed');
      }

      // Step 3: Confirm order
      await step.run('confirm-order', async () => {
        await step.sendEvent({
          name: 'order.confirm',
          data: { orderId, paymentId: paymentResult.data.paymentId, sagaId },
        });
      });

      return { success: true, orderId, paymentId: paymentResult.data.paymentId };

    } catch (error) {
      // Saga failed - trigger compensation
      await step.run('saga-compensation', async () => {
        await step.sendEvent({
          name: 'payment.saga.compensate',
          data: { orderId, sagaId, error: error.message },
        });
      });

      throw error;
    }
  }

  @InngestFunction({
    id: 'payment-saga-compensator',
    name: 'Payment Saga Compensator',
    triggers: [{ event: 'payment.saga.compensate' }],
  })
  async compensatePayment(
    event: InngestEvent<{ orderId: string; sagaId: string; error: string }>,
    { step }: InngestFunctionContext
  ) {
    const { orderId, sagaId } = event.data;

    // Compensate in reverse order
    await step.run('refund-payment', async () => {
      await step.sendEvent({
        name: 'payment.refund',
        data: { orderId, sagaId },
      });
    });

    await step.run('release-inventory', async () => {
      await step.sendEvent({
        name: 'inventory.release',
        data: { orderId, sagaId },
      });
    });

    await step.run('cancel-order', async () => {
      await step.sendEvent({
        name: 'order.cancel',
        data: { orderId, sagaId, reason: 'saga-compensation' },
      });
    });
  }
}
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Functions Not Being Discovered

**Problem**: Functions decorated with `@InngestFunction` are not being registered.

**Solutions**:
```typescript
// ✅ Ensure service is properly imported in module
@Module({
  providers: [UserService], // Must be listed here
  exports: [UserService],
})
export class UserModule {}

// ✅ Ensure service is decorated with @Injectable()
@Injectable() // This is required
export class UserService {
  @InngestFunction({...})
  async myFunction() {}
}

// ✅ Check that InngestModule is imported
@Module({
  imports: [
    InngestModule.forRoot({...}), // Must be imported
    UserModule,
  ],
})
export class AppModule {}
```

#### 2. Webhook Signature Verification Failures

**Problem**: Webhook requests are being rejected with 401/403 errors.

**Solutions**:
```typescript
// ✅ For development - disable signature verification
InngestModule.forRoot({
  // ... other config
  development: {
    enabled: true,
    disableSignatureVerification: true, // Only for development
  },
})

// ✅ For production - ensure correct signing key
InngestModule.forRoot({
  signingKey: process.env.INNGEST_SIGNING_KEY, // Must match Inngest dashboard
  // ... other config
})

// ✅ Check webhook URL configuration
// In Inngest dashboard, webhook URL should be: https://yourdomain.com/api/inngest
```

#### 3. TypeScript Type Errors

**Problem**: TypeScript compilation errors with event types.

**Solutions**:
```typescript
// ✅ Use proper event type definitions
type MyEvents = EventTypes<{
  'user.created': { userId: string; email: string };
}>;

// ✅ Use TypedInngestFunction for type safety
@TypedInngestFunction<MyEvents>({
  id: 'my-function',
  triggers: [{ event: 'user.created' }],
})
async myFunction(
  event: MyEvents['user.created'], // Properly typed
  context: InngestFunctionContext
) {}

// ✅ Ensure event data matches type definition
await inngestService.send({
  name: 'user.created',
  data: {
    userId: '123',
    email: 'user@example.com',
    // All required fields must be present
  },
});
```

#### 4. Step Function Issues

**Problem**: Step functions are not working as expected.

**Solutions**:
```typescript
// ✅ Use unique step IDs
@InngestFunction({...})
async myFunction(event: any, { step }: InngestFunctionContext) {
  // Each step must have a unique ID within the function
  const result1 = await step.run('unique-step-1', async () => {
    return this.doSomething();
  });

  const result2 = await step.run('unique-step-2', async () => {
    return this.doSomethingElse(result1);
  });
}

// ✅ Handle step function errors properly
const result = await step.run('risky-operation', async () => {
  try {
    return await this.riskyOperation();
  } catch (error) {
    // Log the error but let Inngest handle retries
    console.error('Risky operation failed:', error);
    throw error; // Re-throw to trigger retry
  }
});
```

### Debugging Tips

#### Enable Debug Logging

```typescript
// Enable verbose logging for debugging
InngestModule.forRoot({
  // ... other config
  logger: true,
  development: {
    enabled: true,
    // Add custom logging if needed
  },
})
```

#### Use Development Mode

```typescript
// For local development
InngestModule.forRoot({
  appId: 'my-app-dev',
  isDev: true,
  development: {
    enabled: true,
    disableSignatureVerification: true,
  },
  logger: true,
})
```

#### Test Function Execution

```typescript
// Test functions in isolation
describe('Debug Function', () => {
  it('should execute function logic', async () => {
    const service = new MyService();
    const mockEvent = InngestTestUtils.createTestEvent('test.event', {
      // test data
    });
    const mockContext = InngestTestUtils.createMockExecutionContext(
      'my-function',
      'test-run',
      mockEvent
    );

    const result = await service.myFunction(mockEvent, mockContext);
    console.log('Function result:', result);
  });
});
```

## Conclusion

This usage guide covers the essential patterns and best practices for using nestjs-inngest effectively. Remember to:

1. **Start simple** - Begin with basic functions and gradually add complexity
2. **Use types** - Leverage TypeScript for better development experience
3. **Handle errors gracefully** - Plan for failures and implement proper error handling
4. **Test thoroughly** - Use the provided testing utilities to ensure reliability
5. **Monitor in production** - Implement health checks and monitoring
6. **Follow patterns** - Use established patterns for common scenarios

For more specific examples and advanced usage patterns, refer to the example applications in the repository.