# NestJS Inngest Integration

🚀 **Simple, unified NestJS integration for Inngest** with multi-platform support and type safety.

[![npm version](https://badge.fury.io/js/nestjs-inngest.svg)](https://badge.fury.io/js/nestjs-inngest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

## ✨ Features

### Core Features

- 🚀 **Seamless NestJS Integration** - Native dependency injection and NestJS patterns
- ⚡ **Multi-Platform Support** - Works with both Express and Fastify HTTP platforms
- 🔒 **Type Safety** - Full TypeScript support with typed event definitions and handlers
- 🎯 **Decorator-Based** - Simple `@InngestFunction` decorator for defining serverless functions
- 🔄 **Automatic Discovery** - Zero-config function registration and discovery
- 🎛️ **Unified API** - Single `createServe()` method works with both platforms
- 🎮 **Controller Integration** - Custom NestJS controller support with `createControllerHandler()`

### Developer Experience

- 🔧 **Simplified Configuration** - Streamlined module setup with essential options only
- 📝 **Error Handling** - Comprehensive error reporting with detailed validation messages
- 🐛 **Debug Logging** - Enhanced logging for development and troubleshooting
- 🧪 **Basic Testing** - Simple testing utilities for unit and integration tests
- 🎯 **Flexible Integration** - Choose between automatic middleware/plugin or custom controller integration

## Installation

```bash
npm install nestjs-inngest inngest
# or
yarn add nestjs-inngest inngest
# or
pnpm add nestjs-inngest inngest
```

## Run inngest in you local

```npm

npx inngest-cli@latest dev -u http://localhost:3000/api/inngest

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
      // signingKey and eventKey not required in local, but required in Inngest-Cloud or your self-host, you need add NODE_ENV === "development" into .env file
      signingKey: process.env.INNGEST_SIGNING_KEY, // Inngest authenticates to me when calling my functions
      eventKey: process.env.INNGEST_EVENT_KEY, // I authenticate to Inngest when sending events
    }),
  ],
})
export class AppModule {}
```

### 2. HTTP Platform Setup

This module supports both **Express** and **Fastify** HTTP platforms with a unified API. You can choose between **automatic integration** (middleware/plugin) or **controller-based integration** for more control.

#### Option A: Automatic Integration (Recommended)

```typescript
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import {
  NestFastifyApplication,
  FastifyAdapter,
} from "@nestjs/platform-fastify";
import { InngestService } from "nestjs-inngest";
import { AppModule } from "./app.module";

async function bootstrap() {
  // Platform switch - change this to switch platforms
  const USE_FASTIFY = false; // Set to true for Fastify, false for Express

  if (USE_FASTIFY) {
    // Create Fastify application
    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter()
    );

    // Setup Inngest Fastify plugin
    const inngestService = app.get(InngestService);
    const { plugin, options } = await inngestService.createServe("fastify");
    await app.register(plugin, options);

    await app.listen(3000, "0.0.0.0");
  } else {
    // Create Express application
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bodyParser: false,
    });

    // Configure Express body parser
    app.useBodyParser("json", { limit: "10mb" });

    // Setup Inngest Express middleware
    const inngestService = app.get(InngestService);
    const serveMiddleware = await inngestService.createServe("express");
    app.use("/api/inngest", serveMiddleware);

    await app.listen(3000);
  }
}
bootstrap();
```

#### Option B: Controller-Based Integration

For more control over the Inngest webhook endpoint, you can use a custom NestJS controller:

**Express Controller Example:**

```typescript
// express-inngest.controller.ts
import { Controller, Post, Put, Get, Req, Res, Logger } from "@nestjs/common";
import { InngestService } from "nestjs-inngest";

@Controller("api/inngest")
export class ExpressInngestController {
  private readonly logger = new Logger(ExpressInngestController.name);

  constructor(private readonly inngestService: InngestService) {}

  @Get()
  async handleIntrospection(
    @Req() req: any,
    @Res({ passthrough: false }) res: any
  ) {
    return this.handleInngestRequest(req, res, "GET");
  }

  @Post()
  async handleWebhook(@Req() req: any, @Res({ passthrough: false }) res: any) {
    return this.handleInngestRequest(req, res, "POST");
  }

  @Put()
  async handlePutWebhook(
    @Req() req: any,
    @Res({ passthrough: false }) res: any
  ) {
    return this.handleInngestRequest(req, res, "PUT");
  }

  private async handleInngestRequest(req: any, res: any, method: string) {
    try {
      // Use the controller-specific handler for Express
      const controllerHandler =
        await this.inngestService.createControllerHandler("express");
      return controllerHandler(req, res);
    } catch (error) {
      this.logger.error("Error in Inngest controller:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
}
```

**Fastify Controller Example:**

```typescript
// fastify-inngest.controller.ts
import { Controller, Post, Put, Get, Req, Res, Logger } from "@nestjs/common";
import { InngestService } from "nestjs-inngest";
import type { FastifyRequest, FastifyReply } from "fastify";

@Controller("api/inngest")
export class FastifyInngestController {
  private readonly logger = new Logger(FastifyInngestController.name);

  constructor(private readonly inngestService: InngestService) {}

  @Get()
  async handleIntrospection(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) res: FastifyReply
  ) {
    return this.handleInngestRequest(req, res, "GET");
  }

  @Post()
  async handleWebhook(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) res: FastifyReply
  ) {
    return this.handleInngestRequest(req, res, "POST");
  }

  @Put()
  async handlePutWebhook(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) res: FastifyReply
  ) {
    return this.handleInngestRequest(req, res, "PUT");
  }

  private async handleInngestRequest(
    req: FastifyRequest,
    res: FastifyReply,
    method: string
  ) {
    try {
      // Use the controller-specific handler for Fastify
      const controllerHandler =
        await this.inngestService.createControllerHandler("fastify");
      return await controllerHandler(req, res);
    } catch (error) {
      this.logger.error("Error in Fastify Inngest controller:", error);
      return res.status(500).send({
        error: "Internal Server Error",
        message: error.message,
      });
    }
  }
}
```

**Main Application (Fastify with Controller):**

```typescript
// main.ts
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

async function bootstrap() {
  // Create Fastify application
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );

  await app.listen(3000, "0.0.0.0");
  console.log(
    "🚀 Fastify app with Inngest controller running on http://localhost:3000"
  );
  console.log("🎯 Inngest webhook: http://localhost:3000/api/inngest");
}
bootstrap();
```

**Don't forget to add the controller to your module:**

```typescript
// app.module.ts
import { Module } from "@nestjs/common";
import { InngestModule } from "nestjs-inngest";
import { FastifyInngestController } from "./fastify-inngest.controller";

@Module({
  imports: [
    InngestModule.forRoot({
      appId: "my-fastify-app",
      signingKey: process.env.INNGEST_SIGNING_KEY,
      eventKey: process.env.INNGEST_EVENT_KEY,
    }),
  ],
  controllers: [FastifyInngestController],
})
export class AppModule {}
```

#### Integration Method Comparison

| Feature                | Automatic Integration           | Controller Integration                |
| ---------------------- | ------------------------------- | ------------------------------------- |
| **Setup Complexity**   | ✅ Simple                       | 🟡 Medium                             |
| **Control Level**      | 🟡 Standard                     | ✅ Full Control                       |
| **Custom Logic**       | ❌ Limited                      | ✅ Full Support                       |
| **Error Handling**     | 🟡 Basic                        | ✅ Custom                             |
| **Middleware Support** | ✅ Built-in                     | ✅ NestJS Decorators                  |
| **Best For**           | Quick setup, standard use cases | Custom logic, advanced error handling |

> **Note:** Both `createServe()` and `createControllerHandler()` methods provide a unified API that works with both Express and Fastify platforms!

### 3. Define Event Types (Optional but Recommended)

Create type-safe event definitions:

```typescript
import { EventTypes } from "nestjs-inngest";

export type MyEventTypes = EventTypes<{
  "user.created": { userId: string; email: string; name: string };
  "order.placed": { orderId: string; userId: string; total: number };
  "email.send": { to: string; template: string; data: any };
}>;
```

### 4. Create Inngest Functions

Use the `@InngestFunction` decorator to define serverless functions:

```typescript
import { Injectable } from "@nestjs/common";
import { InngestFunction, InngestFunctionContext } from "nestjs-inngest";

@Injectable()
export class UserService {
  @InngestFunction({
    id: "user-welcome-flow",
    name: "User Welcome Flow",
    triggers: [{ event: "user.created" }],
  })
  async handleUserCreated(
    event: any,
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

    // Step 3: Send event notification
    await step.sendEvent("send-notification", {
      name: "user.notification",
      data: { userId, type: "welcome", email },
    });

    return { success: true, userId, profileId: profile.id };
  }

  private async createUserProfile(userId: string, data: any) {
    // Your implementation
  }

  private async sendEmail(params: any) {
    // Your implementation
  }
}
```

### 5. Send Events

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

### Configuration Options

#### Complete Parameter Reference

```typescript
// Synchronous configuration
InngestModule.forRoot({
  // === REQUIRED PARAMETERS ===
  appId: "my-app", // 🔵 Inngest: Your app identifier

  // === INNGEST CORE PARAMETERS ===
  signingKey: process.env.INNGEST_SIGNING_KEY, // 🔵 Inngest: Webhook signature verification
  eventKey: process.env.INNGEST_EVENT_KEY, // 🔵 Inngest: Event sending authentication
  baseUrl: "https://api.inngest.com", // 🔵 Inngest: API base URL (defaults to Inngest cloud)
  isDev: process.env.NODE_ENV === "development", // 🔵 Inngest: Development mode flag

  // === CONNECTION METHODS ===
  enableConnect: false, // 🟠 Extension: Use connect mode vs serve mode (default: false)

  // === HTTP & ROUTING ===
  endpoint: "/api/inngest", // 🟠 Extension: Webhook endpoint path (default: "/api/inngest")

  // === PERFORMANCE & LIMITS ===
  timeout: 30000, // 🔵 Inngest: Function timeout in ms (default: 30000)
  maxBatchSize: 100, // 🟠 Extension: Max events per batch (default: 100)

  // === DEVELOPMENT & DEBUGGING ===
  logger: true, // 🟠 Extension: Enable detailed logging (default: true)
  env: "development", // 🟠 Extension: Environment setting ("production"|"development"|"test")
  strict: false, // 🟠 Extension: Enhanced validation (default: false)

  // === RETRY CONFIGURATION ===
  retry: {
    maxAttempts: 3, // 🟠 Extension: Maximum retry attempts (default: 3)
    initialDelay: 1000, // 🟠 Extension: Initial delay between retries in ms (default: 1000)
    maxDelay: 30000, // 🟠 Extension: Maximum delay between retries in ms (default: 30000)
    backoff: "exponential", // 🟠 Extension: Backoff strategy ("exponential"|"linear"|"fixed")
    backoffMultiplier: 2, // 🟠 Extension: Backoff multiplier (default: 2)
  },

  // === DEVELOPMENT MODE (Advanced) ===
  development: {
    enabled: true, // 🟠 Extension: Enable development features
    disableSignatureVerification: true, // 🟠 Extension: Skip signature validation
    enableIntrospection: true, // 🟠 Extension: Function debugging tools
  },
});
// Inngest SDK
if (process.env.NODE_ENV === "development" || process.env.INNGEST_DEV === "1") {
  // auto disabled
  signatureVerification = false;
}

// Asynchronous configuration with environment variables
InngestModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    appId: configService.get("INNGEST_APP_ID"),
    signingKey: configService.get("INNGEST_SIGNING_KEY"),
    eventKey: configService.get("INNGEST_EVENT_KEY"),
    isDev: configService.get("NODE_ENV") === "development",
    enableConnect: configService.get("INNGEST_USE_CONNECT") === "true",
    // ... other parameters
  }),
  inject: [ConfigService],
});
```

#### Parameter Categories

**🔵 Inngest Core Parameters** - Native Inngest SDK parameters:

- `appId`, `signingKey`, `eventKey`, `baseUrl`, `isDev`, `timeout`

**🟠 NestJS Extension Parameters** - Our enhancements for better NestJS integration:

- Connection management: `enableConnect`, `endpoint`
- Development tools: `logger`, `env`, `strict`, `development.*`
- Performance: `maxBatchSize`, `retry.*`

#### Quick Examples

**Minimal Setup:**

```typescript
InngestModule.forRoot({
  appId: "my-app",
  // signingKey and eventKey not required in local, but required in Inngest-Cloud or your self-host, you need add NODE_ENV === "development" into .env file
  signingKey: process.env.INNGEST_SIGNING_KEY, // Inngest authenticates to me when calling my functions
  eventKey: process.env.INNGEST_EVENT_KEY, // I authenticate to Inngest when sending events
});
```

**Development Setup:**

```typescript
InngestModule.forRoot({
  appId: "my-dev-app",
  isDev: true,
  development: {
    enabled: true,
    disableSignatureVerification: true,
  },
});
```

**Production Setup:**

```typescript
InngestModule.forRoot({
  appId: "my-prod-app",
  signingKey: process.env.INNGEST_SIGNING_KEY,
  eventKey: process.env.INNGEST_EVENT_KEY,
  env: "production",
  logger: false,
  strict: true,
  retry: { maxAttempts: 5 },
});
```

## Step Functions

Inngest provides step functions for reliable, resumable workflows:

```typescript
@InngestFunction({
  id: 'user-workflow',
  triggers: [{ event: 'user.created' }],
})
async handleUserWorkflow(event: any, { step }: any) {
  // Steps are automatically retried on failure
  const profile = await step.run('create-profile', async () => {
    return this.createUserProfile(event.data);
  });

  // Sleep/delay execution
  await step.sleep('wait-before-email', '1 minute');

  // Send events to trigger other functions
  await step.sendEvent('send-welcome-email', {
    name: 'email.send',
    data: { userId: profile.id, email: event.data.email }
  });

  return { success: true, profileId: profile.id };
}
```

## Type Safety (Optional)

For applications requiring strict type safety, use the typed decorator with your event schema:

```typescript
import { TypedInngestFunction, EventRegistry } from "nestjs-inngest";

// Define your event types
interface MyEventRegistry extends EventRegistry {
  "user.created": { userId: string; email: string; name: string };
  "order.completed": { orderId: string; amount: number; userId: string };
  "email.sent": { to: string; subject: string; success: boolean };
}

@Injectable()
export class UserService {
  @TypedInngestFunction<MyEventRegistry, "user.created">({
    id: "user-welcome-flow",
    triggers: [{ event: "user.created" }],
    config: {
      retries: 3,
      timeout: 30000,
      priority: 1,
    },
  })
  async handleUserCreated({
    event,
    step,
  }: TypedEventContext<MyEventRegistry, "user.created">) {
    // event.data is strictly typed as { userId: string; email: string; name: string }
    const { userId, email, name } = event.data;

    return await step.run("create-profile", async () => {
      return this.createUserProfile({ userId, email, name });
    });
  }
}
```

### Advanced Type Helpers

Create event-specific decorators:

```typescript
import { createEventDecorator, CronFunction } from "nestjs-inngest";

// Create a user-created specific decorator
const UserCreatedFunction = createEventDecorator<MyEventRegistry, 'user.created'>('user.created');

// Use the specific decorator
@UserCreatedFunction({
  id: "send-welcome-email",
  name: "Send Welcome Email"
})
async sendWelcomeEmail({ event }: TypedEventContext<MyEventRegistry, 'user.created'>) {
  // Automatically typed for user.created events
}

// Cron-based functions
@CronFunction({
  id: "daily-cleanup",
  cron: "0 2 * * *", // 2 AM daily
  timezone: "UTC"
})
async dailyCleanup() {
  // Scheduled function
}
```

## Performance Optimization (Optional)

For applications with many functions or high-performance requirements, you can use the optimized decorator:

```typescript
import { OptimizedInngestFunction } from "nestjs-inngest";

@Injectable()
export class UserService {
  @OptimizedInngestFunction({
    id: "user-welcome-flow",
    triggers: [{ event: "user.created" }],
  })
  async handleUserCreated(event: any, { step }: any) {
    // Same functionality as @InngestFunction, but with:
    // - Multi-layer caching for faster metadata processing
    // - Memory optimization with object pooling
    // - Batch validation and lookup capabilities
    // - Performance monitoring and statistics

    return await step.run("process-user", async () => {
      return this.processUser(event.data);
    });
  }
}
```

### Performance Monitoring

Monitor decorator performance in high-load scenarios:

```typescript
import {
  getDecoratorPerformanceStats,
  clearOptimizedCaches,
} from "nestjs-inngest";

// Get performance statistics
const stats = getDecoratorPerformanceStats();
console.log({
  registeredClasses: stats.registeredClasses,
  totalFunctions: stats.totalFunctions,
  cacheHitRate: stats.cacheHitRate,
  memoryUsage: stats.memoryUsage,
});

// Clear caches when needed (e.g., during testing)
clearOptimizedCaches();
```

## Decorator Comparison

| Feature              | `@InngestFunction` | `@TypedInngestFunction`  | `@OptimizedInngestFunction` | `@CronFunction`          |
| -------------------- | ------------------ | ------------------------ | --------------------------- | ------------------------ |
| **Type Safety**      | ❌ Basic (`any`)   | ✅ **Strict TypeScript** | ❌ Basic (`any`)            | ✅ **Typed Config**      |
| **Performance**      | 🟢 **Standard**    | 🟢 Standard              | ✅ **Optimized**            | 🟢 Standard              |
| **Event Validation** | 🟡 Runtime only    | ✅ **Compile + Runtime** | 🟡 Runtime only             | ✅ **Compile Time**      |
| **Memory Usage**     | 🟢 **Low**         | 🟢 Low                   | 🟡 Higher (caching)         | 🟢 **Low**               |
| **Complexity**       | 🟢 **Simple**      | 🟡 Medium                | 🟡 Medium                   | 🟢 **Simple**            |
| **IDE Support**      | 🟡 Basic           | ✅ **Full IntelliSense** | 🟡 Basic                    | ✅ **Full IntelliSense** |
| **Trigger Types**    | ✅ Event + Cron    | ✅ Event + Cron          | ✅ Event + Cron             | 🎯 **Cron Only**         |
| **Best For**         | General use        | Type-safe apps           | High-performance apps       | **Scheduled tasks**      |

### When to Use Each Decorator

**`@InngestFunction`** (Recommended for most cases)

- ✅ General purpose applications
- ✅ Quick prototyping and development
- ✅ Simple event handling
- ✅ When type safety is not critical

**`@TypedInngestFunction`** (For type-safe applications)

- ✅ Large applications with complex event schemas
- ✅ Teams requiring strict type safety
- ✅ When you want compile-time event validation
- ✅ Better IDE support and IntelliSense

**`@OptimizedInngestFunction`** (For high-performance scenarios)

- ✅ Applications with 50+ Inngest functions
- ✅ High-frequency function registration/discovery
- ✅ Performance-critical environments
- ✅ When you need performance monitoring

**`@CronFunction`** (For scheduled tasks)

- ✅ Pure cron-based scheduled tasks
- ✅ When you want clean, explicit cron syntax
- ✅ Type-safe cron configuration with timezone support
- ✅ Priority and timeout configuration for scheduled jobs
- ✅ Cleaner than manually configuring cron triggers

### CronFunction Examples

```typescript
import { CronFunction } from "nestjs-inngest";

@Injectable()
export class ScheduledTasksService {
  // Daily cleanup at 2 AM UTC
  @CronFunction({
    id: "daily-cleanup",
    name: "Daily Cleanup Task",
    cron: "0 2 * * *",
    timezone: "UTC",
    retries: 2,
    timeout: 300000, // 5 minutes
    priority: 1, // High priority
  })
  async dailyCleanup() {
    // Cleanup logic here
    return { cleaned: true, timestamp: new Date() };
  }

  // Weekly report every Monday at 9 AM
  @CronFunction({
    id: "weekly-report",
    cron: "0 9 * * 1", // Monday 9 AM
    timezone: "America/New_York",
  })
  async weeklyReport() {
    // Generate weekly report
  }

  // High-frequency monitoring every 30 minutes
  @CronFunction({
    id: "health-check",
    cron: "*/30 * * * *", // Every 30 minutes
    timeout: 5000,
    retries: 1,
  })
  async healthCheck() {
    // Health monitoring logic
  }
}
```

## Testing

Mock the `InngestService` for unit testing:

```typescript
const mockInngestService = {
  send: jest.fn(),
  getClient: jest.fn(),
};

// Use in your test modules
providers: [{ provide: InngestService, useValue: mockInngestService }];
```

## Key Concepts

- **`@InngestFunction`**: Standard decorator for general-purpose event handling
- **`@TypedInngestFunction`**: Type-safe decorator with strict TypeScript event validation
- **`@OptimizedInngestFunction`**: Performance-optimized decorator for high-load applications
- **`InngestService`**: Main service for sending events and creating integrations
  - `send()` - Send events to Inngest
  - `getClient()` - Get underlying Inngest client
  - `createServe(platform)` - Create middleware/plugin integration
  - `createControllerHandler(platform)` - Create controller-based integration
- **Step Functions**: Use `step.run()`, `step.sleep()`, `step.sendEvent()` for reliable workflows
- **Events**: Send events with `{ name: string, data: any }` structure

## Troubleshooting

- **Functions not registering**: Ensure services are imported in your module and decorated with `@Injectable()`
- **Webhook errors**: Verify `signingKey` configuration and endpoint URL
- **Debug mode**: Set `logger: true` and `isDev: true` for detailed logging

## Planned for Future Versions

- Performance optimizations (connection pooling, memory management, request optimization)
- Enhanced testing utilities and mocks
- Typed function decorators (`@TypedInngestFunction`)
- Advanced logging and monitoring
- Circuit breakers and resilient error handling
- Event sourcing and audit trails

## License

MIT License - see [CHANGELOG.md](CHANGELOG.md) for version history.
