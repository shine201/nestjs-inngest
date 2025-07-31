# Fastify Integration

This NestJS Inngest module now supports both Express and Fastify HTTP platforms through an automatic platform detection system.

## Features

- ✅ **Automatic Platform Detection**: Runtime detection of Express vs Fastify requests
- ✅ **Platform-Specific Adapters**: Optimized request/response handling for each platform
- ✅ **Raw Body Handling**: Proper signature verification support for both platforms
- ✅ **Backward Compatibility**: Existing Express applications continue to work unchanged
- ✅ **Type Safety**: Full TypeScript support for both platforms

## Installation

To use with Fastify, install the required dependencies:

```bash
npm install @nestjs/platform-fastify fastify
```

## Usage

### Express (Default)

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

### Fastify

```typescript
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );
  
  // Optional: Configure raw body parsing for webhook signature verification
  await app.register(require('fastify-raw-body'), {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true,
    routes: ['/api/inngest'], // Your Inngest endpoint
  });
  
  await app.listen(3000, '0.0.0.0');
}
bootstrap();
```

### Module Configuration

The Inngest module configuration remains the same for both platforms:

```typescript
import { Module } from '@nestjs/common';
import { InngestModule } from 'nestjs-inngest';

@Module({
  imports: [
    InngestModule.forRoot({
      appId: 'my-app',
      signingKey: process.env.INNGEST_SIGNING_KEY,
      endpoint: '/api/inngest',
      // Platform is automatically detected at runtime
    }),
  ],
})
export class AppModule {}
```

## Platform Detection

The module automatically detects the HTTP platform at runtime by examining request object characteristics:

- **Express**: Has `res` and `app` properties
- **Fastify**: Has `raw` and `server` properties, no `res` property

This detection happens transparently and requires no configuration changes.

## Raw Body Handling

For webhook signature verification to work properly:

### Express
Raw body is typically handled by middleware like `express.raw()` or custom middleware.

### Fastify
Install and configure the `fastify-raw-body` plugin as shown in the example above.

## Adapter Architecture

The integration uses a platform adapter pattern:

- `ExpressHttpAdapter`: Handles Express-specific request/response operations
- `FastifyHttpAdapter`: Handles Fastify-specific request/response operations
- `PlatformDetector`: Automatically determines the platform and provides the correct adapter

## Testing

Both Express and Fastify are fully tested:

```bash
# Run all tests including platform-specific tests
npm test

# Run Fastify adapter tests specifically
npm test src/__tests__/adapters/fastify.adapter.test.ts
```

## Performance

Fastify generally provides better performance than Express, especially for high-throughput applications. The adapter system adds minimal overhead while maintaining the performance benefits of your chosen platform.

## Limitations

- Raw body parsing must be configured manually for Fastify (see example above)
- Some advanced Fastify features may require platform-specific handling

## Migration

Existing Express applications can migrate to Fastify without changing their Inngest configuration:

1. Install Fastify dependencies
2. Update your bootstrap code to use FastifyAdapter
3. Configure raw body parsing if using webhook signature verification
4. Test your application

The Inngest functions and decorators remain unchanged.