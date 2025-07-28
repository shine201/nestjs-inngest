# NestJS Inngest Integration

🚀 **Advanced NestJS integration for Inngest** with enterprise-grade performance optimizations, type safety, and comprehensive testing support.

[![npm version](https://badge.fury.io/js/nestjs-inngest.svg)](https://badge.fury.io/js/nestjs-inngest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Test Coverage](https://img.shields.io/badge/coverage-82.6%25-green.svg)](https://github.com/shine201/nestjs-inngest)

## ✨ Features

### Core Features

- 🚀 **Seamless NestJS Integration** - Native dependency injection and NestJS patterns
- 🔒 **Type Safety** - Full TypeScript support with typed event definitions and handlers
- 🎯 **Decorator-Based** - Simple `@InngestFunction` and `@TypedInngestFunction` decorators
- 🔄 **Automatic Discovery** - Zero-config function registration and discovery
- 🌐 **Webhook Support** - Built-in webhook handling with signature verification
- 🧪 **Comprehensive Testing** - Advanced testing utilities and mock services

### Performance & Enterprise Features ⚡

- 🏎️ **Connection Pooling** - Optimized HTTP connection management with circuit breakers
- 🧠 **Memory Optimization** - Advanced memory management with object pooling and WeakRef caching
- 📊 **Request Optimization** - Batching, compression, and intelligent caching
- 📈 **Performance Monitoring** - Real-time metrics and health monitoring
- 🔧 **Auto-Optimization** - Intelligent performance tuning based on usage patterns
- 🛡️ **Circuit Breakers** - Resilient error handling and automatic recovery

### Developer Experience

- 🔍 **Development Mode** - Enhanced debugging with detailed logging
- 📝 **Validation & Error Reporting** - Comprehensive input validation and error handling
- 🎨 **Enhanced Logging** - Structured logging with performance metrics
- 🔧 **Flexible Configuration** - Sync/async configuration with environment support

## Installation

```bash
npm install nestjs-inngest inngest
# or
yarn add nestjs-inngest inngest
# or
pnpm add nestjs-inngest inngest
```

## Quick Start

### 1. Module Setup

First, configure the `InngestModule` in your NestJS application:

```typescript
import { Module } from "@nestjs/common";
import { InngestModule } from "nestjs-inngest";

@Module({
  imports: [
    InngestModule.forRoot({
      appId: "my-nestjs-app",
      signingKey: process.env.INNGEST_SIGNING_KEY,
      eventKey: process.env.INNGEST_EVENT_KEY,
    }),
  ],
})
export class AppModule {}
```

### 2. Define Event Types (Optional but Recommended)

Create type-safe event definitions:

```typescript
import { EventTypes } from "nestjs-inngest";

export type MyEventTypes = EventTypes<{
  "user.created": { userId: string; email: string; name: string };
  "order.placed": { orderId: string; userId: string; total: number };
  "email.send": { to: string; template: string; data: any };
}>;
```

### 3. Create Inngest Functions

Use the `@InngestFunction` decorator to define serverless functions:

```typescript
import { Injectable } from "@nestjs/common";
import {
  InngestFunction,
  TypedInngestFunction,
  InngestFunctionContext,
} from "nestjs-inngest";

@Injectable()
export class UserService {
  @TypedInngestFunction<MyEventTypes>({
    id: "user-welcome-flow",
    name: "User Welcome Flow",
    triggers: [{ event: "user.created" }],
  })
  async handleUserCreated(
    event: MyEventTypes["user.created"],
    { step, logger, runId, attempt }: InngestFunctionContext
  ) {
    const { userId, email, name } = event.data;

    // Step 1: Create user profile
    const profile = await step.run("create-profile", async () => {
      return this.createUserProfile(userId, { email, name });
    });

    // Step 2: Send welcome email
    await step.run("send-welcome-email", async () => {
      return this.sendEmail({
        to: email,
        template: "welcome",
        data: { name, userId },
      });
    });

    // Step 3: Schedule follow-up
    await step.run("schedule-follow-up", async () => {
      return this.scheduleFollowUp(userId, "7 days");
    });

    return { success: true, userId, profileId: profile.id };
  }

  private async createUserProfile(userId: string, data: any) {
    // Your implementation
  }

  private async sendEmail(params: any) {
    // Your implementation
  }

  private async scheduleFollowUp(userId: string, delay: string) {
    // Your implementation
  }
}
```

### 4. Send Events

Inject the `InngestService` to send events:

```typescript
import { Injectable } from "@nestjs/common";
import { InngestService } from "nestjs-inngest";

@Injectable()
export class AuthService {
  constructor(private readonly inngestService: InngestService) {}

  async createUser(userData: any) {
    // Create user in database
    const user = await this.userRepository.save(userData);

    // Trigger Inngest function
    await this.inngestService.send({
      name: "user.created",
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
      },
    });

    return user;
  }
}
```

## Configuration

### Basic Configuration

```typescript
InngestModule.forRoot({
  appId: "my-app", // Required: Your app identifier
  signingKey: "your-key", // Required: For webhook verification
  eventKey: "your-event-key", // Required: For sending events
  endpoint: "/api/inngest", // Optional: Webhook endpoint path
  env: "production", // Optional: Environment
  timeout: 30000, // Optional: Function timeout in ms
});
```

### Async Configuration

```typescript
InngestModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    appId: configService.get("INNGEST_APP_ID"),
    signingKey: configService.get("INNGEST_SIGNING_KEY"),
    eventKey: configService.get("INNGEST_EVENT_KEY"),
    env: configService.get("NODE_ENV"),
  }),
  inject: [ConfigService],
});
```

### Advanced Configuration with Performance Features

```typescript
InngestModule.forRoot({
  appId: "my-app",
  signingKey: process.env.INNGEST_SIGNING_KEY,
  eventKey: process.env.INNGEST_EVENT_KEY,

  // Performance settings
  timeout: 30000,
  maxBatchSize: 100,

  performance: {
    enableConnectionPooling: true,
    enableMemoryOptimization: true,
    enableRequestOptimization: true,
    enablePerformanceMonitoring: true,

    // Connection pool settings
    connectionPool: {
      maxSockets: 50,
      keepAlive: true,
      maxFreeSockets: 10,
    },

    // Memory optimization
    memoryOptimization: {
      enableObjectPooling: true,
      enableStringInterning: true,
      gcThreshold: 500 * 1024 * 1024, // 500MB
    },

    // Request optimization
    requestOptimization: {
      enableCompression: true,
      enableCaching: true,
      enableBatching: true,
      cacheSize: 1000,
    },
  },

  // Retry configuration
  retry: {
    maxAttempts: 3,
    backoff: "exponential",
    initialDelay: 1000,
    maxDelay: 30000,
  },

  // Development settings
  development: {
    enabled: process.env.NODE_ENV === "development",
    disableSignatureVerification: true,
    enablePerformanceDebugging: true,
  },

  // Enhanced logging
  logger: {
    enabled: true,
    level: "debug",
    includePerformanceMetrics: true,
  },

  strict: false,
});
```

## Performance Features (v2.0) ⚡

### Connection Pooling & Circuit Breakers

Optimize HTTP connections with automatic connection pooling:

```typescript
@Injectable()
export class OrderService {
  constructor(private readonly inngestService: InngestService) {}

  @InngestFunction({
    id: "process-high-volume-orders",
    triggers: [{ event: "orders.batch" }],
    // Automatic connection pooling handles high concurrency
  })
  async processOrders(event: any, { step }: any) {
    // Connection pool automatically manages HTTP connections
    // Circuit breaker protects against external service failures
    const results = await Promise.all(
      event.data.orders.map((order) =>
        step.run(`process-${order.id}`, () => this.processOrder(order))
      )
    );

    return results;
  }
}
```

### Memory Optimization

Advanced memory management with object pooling and WeakRef caching:

```typescript
@Injectable()
export class DataProcessor {
  @InngestFunction({
    id: "memory-optimized-processing",
    triggers: [{ event: "data.process" }],
  })
  async processData(event: any, { step }: any) {
    // Memory optimizer automatically:
    // - Reuses objects through pooling
    // - Interns strings for deduplication
    // - Manages garbage collection
    // - Monitors memory usage

    const result = await step.run("process-large-dataset", async () => {
      return this.processLargeDataset(event.data);
    });

    return result;
  }
}
```

### Performance Monitoring

Built-in performance monitoring and analytics:

```typescript
@Injectable()
export class MonitoringService {
  constructor(
    private readonly performanceService: PerformanceIntegrationService
  ) {}

  @Cron("0 */5 * * * *") // Every 5 minutes
  async checkPerformanceHealth() {
    const stats = this.performanceService.getComprehensiveStats();

    console.log("Performance Stats:", {
      memory: stats.memory.current.heapUsed,
      network: stats.network.connectionPool.averageResponseTime,
      health: stats.system.overallHealth, // 'excellent' | 'good' | 'warning' | 'critical'
    });

    // Auto-optimization based on metrics
    if (stats.system.overallHealth === "warning") {
      await this.performanceService.forceOptimization();
    }
  }
}
```

### Request Optimization

Intelligent request batching, compression, and caching:

```typescript
@Injectable()
export class ApiService {
  @InngestFunction({
    id: "optimized-api-calls",
    triggers: [{ event: "api.batch_request" }],
  })
  async handleBatchRequests(event: any, { step }: any) {
    // Request optimizer automatically:
    // - Batches similar requests
    // - Compresses request/response data
    // - Caches frequently accessed data
    // - Optimizes retry strategies

    const results = await step.run("batch-api-calls", async () => {
      return this.makeBatchedApiCalls(event.data.requests);
    });

    return results;
  }
}
```

## Advanced Usage

### Step Functions

Use step functions for reliable, resumable workflows:

```typescript
@InngestFunction({
  id: 'complex-workflow',
  name: 'Complex Workflow',
  triggers: [{ event: 'workflow.start' }],
})
async handleComplexWorkflow(event: any, { step }: any) {
  // Steps are automatically retried on failure
  const data = await step.run('fetch-data', async () => {
    return this.fetchExternalData(event.data.id);
  });

  // Sleep/delay execution
  await step.sleep('wait-for-processing', '5 minutes');

  // Conditional steps
  if (data.requiresApproval) {
    await step.run('request-approval', async () => {
      return this.requestApproval(data);
    });

    // Wait for external event
    const approval = await step.waitForEvent('approval.received', {
      timeout: '24 hours',
      if: `async.data.requestId == "${data.requestId}"`,
    });
  }

  // Final processing
  return await step.run('finalize', async () => {
    return this.finalizeWorkflow(data);
  });
}
```

### Event Scheduling

```typescript
@InngestFunction({
  id: 'daily-report',
  name: 'Daily Report Generator',
  triggers: [{ cron: '0 9 * * *' }], // Daily at 9 AM
})
async generateDailyReport(event: any, { step }: any) {
  const report = await step.run('generate-report', async () => {
    return this.generateReport();
  });

  await step.run('send-report', async () => {
    return this.emailReport(report);
  });
}
```

### Error Handling

```typescript
@InngestFunction({
  id: 'error-handling-example',
  name: 'Error Handling Example',
  triggers: [{ event: 'process.data' }],
  retries: 5, // Function-level retry configuration
})
async handleWithErrors(event: any, { step }: any) {
  try {
    const result = await step.run('risky-operation', async () => {
      // This step will be retried automatically on failure
      return this.riskyOperation(event.data);
    });

    return result;
  } catch (error) {
    // Handle non-retryable errors
    await step.run('log-error', async () => {
      return this.logError(error, event.data);
    });

    throw error; // Re-throw to trigger function retry
  }
}
```

## Testing

### Unit Testing

Use the provided testing utilities:

```typescript
import { Test } from "@nestjs/testing";
import { InngestTestingModule } from "nestjs-inngest";
import { UserService } from "./user.service";

describe("UserService", () => {
  let service: UserService;
  let inngestService: InngestService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        InngestTestingModule.forTest({
          useRealServices: false, // Use mocks
          mockConfig: {
            appId: "test-app",
            signingKey: "test-key",
          },
        }),
      ],
      providers: [UserService],
    }).compile();

    service = module.get<UserService>(UserService);
    inngestService = module.get<InngestService>(InngestService);
  });

  it("should handle user creation", async () => {
    const event = {
      name: "user.created",
      data: { userId: "123", email: "test@example.com" },
    };

    const result = await service.handleUserCreated(event, mockStepTools);

    expect(result.success).toBe(true);
    expect(result.userId).toBe("123");
  });
});
```

### Integration Testing

```typescript
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { InngestTestingModule, InngestTestUtils } from "nestjs-inngest";
import * as request from "supertest";

describe("Inngest Integration", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        InngestTestingModule.forIntegrationTest({
          useRealServices: true,
          includeController: true,
        }),
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  it("should handle webhook requests", async () => {
    const event = InngestTestUtils.createTestEvent("test.event", {
      message: "Hello, World!",
    });

    const webhookRequest = InngestTestUtils.createTestWebhookRequest(
      "my-function-id",
      event
    );

    const response = await request(app.getHttpServer())
      .post("/api/inngest")
      .send(webhookRequest)
      .expect(200);

    expect(response.body.status).toBe("ok");
  });
});
```

## API Reference

### Decorators

#### `@InngestFunction(config)`

Marks a method as an Inngest function.

**Parameters:**

- `config.id` (string): Unique function identifier
- `config.name` (string): Human-readable function name
- `config.triggers` (array): Array of event or cron triggers
- `config.concurrency` (number | object): Concurrency limits
- `config.rateLimit` (object): Rate limiting configuration
- `config.retries` (number): Number of retries on failure
- `config.timeout` (number): Function timeout in milliseconds

#### `@TypedInngestFunction<EventTypes>(config)`

Type-safe version of `@InngestFunction` with event type validation.

### Services

#### `InngestService`

Main service for interacting with Inngest.

**Methods:**

- `send(event)`: Send a single event
- `send(events[])`: Send multiple events
- `getClient()`: Get the underlying Inngest client

#### `FunctionRegistry`

Service for managing function registrations.

**Methods:**

- `getFunction(id)`: Get function metadata by ID
- `getFunctionCount()`: Get total number of registered functions
- `createInngestFunctions()`: Create Inngest function definitions

### Interfaces

#### `InngestEvent`

```typescript
interface InngestEvent<T = any> {
  name: string;
  data: T;
  id?: string;
  ts?: number;
  user?: { id: string; [key: string]: any };
  v?: string;
}
```

#### `InngestFunctionConfig`

```typescript
interface InngestFunctionConfig {
  id: string;
  name?: string;
  triggers: InngestTrigger[];
  concurrency?: number | ConcurrencyConfig;
  rateLimit?: RateLimit;
  retries?: number;
  timeout?: number;
}
```

## Migration Guide

### From Direct Inngest Usage

If you're currently using Inngest directly in your NestJS app:

**Before:**

```typescript
import { Inngest } from "inngest";

const inngest = new Inngest({ id: "my-app" });

export const myFunction = inngest.createFunction(
  { id: "my-function" },
  { event: "user.created" },
  async ({ event, step }) => {
    // Function logic
  }
);
```

**After:**

```typescript
import { InngestFunction } from "nestjs-inngest";

@Injectable()
export class MyService {
  @InngestFunction({
    id: "my-function",
    triggers: [{ event: "user.created" }],
  })
  async myFunction(event: any, { step }: any) {
    // Function logic with full NestJS DI support
  }
}
```

## Best Practices

### 1. Event Design

- Use descriptive event names: `user.created`, `order.completed`
- Include all necessary data in the event payload
- Keep events immutable and append-only

### 2. Function Organization

- Group related functions in services
- Use clear, descriptive function IDs and names
- Keep functions focused on single responsibilities

### 3. Error Handling

- Use step functions for retryable operations
- Implement proper error logging and monitoring
- Design for idempotency

### 4. Testing

- Test functions in isolation using mocks
- Write integration tests for critical workflows
- Use the provided testing utilities

### 5. Performance

- Use appropriate concurrency limits
- Implement rate limiting for external API calls
- Monitor function execution times

## Troubleshooting

### Common Issues

#### Functions Not Registering

**Problem:** Functions are not being discovered automatically.

**Solution:**

- Ensure services with `@InngestFunction` are properly imported in your module
- Check that the service is decorated with `@Injectable()`
- Verify module imports include `InngestModule`

#### Webhook 401/403 Errors

**Problem:** Webhook requests are being rejected.

**Solution:**

- Verify `signingKey` configuration
- Check webhook endpoint URL matches configuration
- Enable development mode for local testing

#### Type Errors with Events

**Problem:** TypeScript errors when using typed events.

**Solution:**

- Ensure event types are properly defined
- Use `TypedInngestFunction` instead of `InngestFunction`
- Check event data matches type definitions

### Debug Mode

Enable debug mode for detailed logging:

```typescript
InngestModule.forRoot({
  // ... other config
  logger: true,
  development: {
    enabled: true,
    disableSignatureVerification: true, // For local development only
  },
});
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://github.com/shine201/nestjs-inngest/docs)
- 🐛 [Issue Tracker](https://github.com/shine201/nestjs-inngest/issues)

## Examples

### E-commerce Saga Example

The repository includes a comprehensive e-commerce example demonstrating advanced patterns:

```bash
cd examples/ecommerce-example
npm install
docker-compose up -d postgres redis mailhog
npm run start:dev
```

**Features demonstrated:**

- 🛒 **Order Processing Pipeline** - Complete order lifecycle management
- 💳 **Payment Integration** - Multi-provider payment processing with retries
- 📦 **Inventory Management** - Stock checking, reservation, and backorder workflows
- 📧 **Customer Notifications** - Multi-channel communication system
- 🔄 **Saga Pattern** - Distributed transaction management with compensation
- ⚡ **Circuit Breaker** - External service failure handling
- 📊 **Event Sourcing** - Complete audit trail of all state changes

```typescript
// Order processing saga with compensation logic
@InngestFunction({
  id: 'order-processing-saga',
  triggers: [{ event: 'order.created' }],
})
async processOrderSaga(event: OrderCreatedEvent, { step }) {
  try {
    // Reserve inventory
    await step.run('reserve-inventory', async () => {
      return this.inventoryService.reserveItems(event.data.items);
    });

    // Process payment
    const payment = await step.run('process-payment', async () => {
      return this.paymentService.processPayment(event.data.payment);
    });

    // Confirm order
    await step.run('confirm-order', async () => {
      return this.orderService.confirmOrder(event.data.orderId);
    });

    // Prepare shipping
    await step.run('prepare-shipping', async () => {
      return this.shippingService.prepareShipment(event.data);
    });

  } catch (error) {
    // Compensation logic
    await this.compensateOrder(event.data.orderId, error);
    throw error;
  }
}
```

### Basic Example

```bash
cd examples/basic-example
npm install
npm run start:dev
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and migration guides.

## Related Projects

- [Inngest](https://www.inngest.com/) - The underlying serverless function platform
- [NestJS](https://nestjs.com/) - The progressive Node.js framework
- [TypeScript](https://www.typescriptlang.org/) - Typed JavaScript at scale
