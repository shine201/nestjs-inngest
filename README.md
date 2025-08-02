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
- 🌐 **Webhook Support** - Built-in webhook handling with signature verification
- 🔍 **Auto Platform Detection** - Automatically detects Express vs Fastify at runtime
- 🎛️ **Unified API** - Single `createServe()` method works with both platforms

### Developer Experience

- 🔧 **Simplified Configuration** - Streamlined module setup with essential options only
- 📝 **Error Handling** - Comprehensive error reporting with detailed validation messages
- 🐛 **Debug Logging** - Enhanced logging for development and troubleshooting
- 🧪 **Basic Testing** - Simple testing utilities for unit and integration tests

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

### 2. HTTP Platform Setup

This module supports both **Express** and **Fastify** HTTP platforms with a unified API:

```typescript
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { InngestService } from 'nestjs-inngest';
import { AppModule } from './app.module';

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
    const { plugin, options } = await inngestService.createServe('fastify');
    await app.register(plugin, options);
    
    await app.listen(3000, '0.0.0.0');
  } else {
    // Create Express application
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bodyParser: false
    });

    // Configure Express body parser
    app.useBodyParser('json', { limit: '10mb' });

    // Setup Inngest Express middleware
    const inngestService = app.get(InngestService);
    const serveMiddleware = await inngestService.createServe('express');
    app.use('/api/inngest', serveMiddleware);
    
    await app.listen(3000);
  }
}
bootstrap();
```

> **Note:** The `createServe()` method provides a unified API that works with both platforms!

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
import {
  InngestFunction,
  InngestFunctionContext,
} from "nestjs-inngest";

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
      data: { userId, type: "welcome", email }
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

```typescript
InngestModule.forRoot({
  appId: "my-app",
  signingKey: process.env.INNGEST_SIGNING_KEY,
  eventKey: process.env.INNGEST_EVENT_KEY,
  
  // Connection mode (optional, default: false)
  enableConnect: false, // Set to true to use Inngest connect mode instead of serve mode
  
  // Optional settings
  endpoint: "/api/inngest", // Webhook endpoint path
  isDev: process.env.NODE_ENV === "development",
  logger: true, // Enable debug logging
  
  // Basic retry configuration
  retry: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 30000,
  },
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

## Testing

Mock the `InngestService` for unit testing:

```typescript
const mockInngestService = {
  send: jest.fn(),
  getClient: jest.fn(),
};

// Use in your test modules
providers: [
  { provide: InngestService, useValue: mockInngestService }
]
```

## Key Concepts

- **`@InngestFunction`**: Decorator to mark methods as Inngest functions
- **`InngestService`**: Main service for sending events (`send()`, `getClient()`)
- **Step Functions**: Use `step.run()`, `step.sleep()`, `step.sendEvent()` for reliable workflows
- **Events**: Send events with `{ name: string, data: any }` structure

## Troubleshooting

- **Functions not registering**: Ensure services are imported in your module and decorated with `@Injectable()`
- **Webhook errors**: Verify `signingKey` configuration and endpoint URL
- **Debug mode**: Set `logger: true` and `isDev: true` for detailed logging

## Examples

```bash
cd examples/basic-example
npm install
npm run start:dev
```

## Planned for Future Versions

- Performance optimizations (connection pooling, memory management, request optimization)
- Enhanced testing utilities and mocks
- Typed function decorators (`@TypedInngestFunction`)
- Advanced logging and monitoring
- Circuit breakers and resilient error handling
- Event sourcing and audit trails

## License

MIT License - see [CHANGELOG.md](CHANGELOG.md) for version history.
