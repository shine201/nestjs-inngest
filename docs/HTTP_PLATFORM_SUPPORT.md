# HTTP Platform Support

The NestJS Inngest integration now supports multiple HTTP platforms including **Express** and **Fastify**. This allows you to use the same Inngest integration regardless of which HTTP platform your NestJS application uses.

## Supported Platforms

- **Express** (default) - `@nestjs/platform-express`
- **Fastify** - `@nestjs/platform-fastify`
- **Auto-detection** - Automatically detects and uses the appropriate adapter

## Quick Start

### Express (Default)

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();

// app.module.ts
import { Module } from '@nestjs/common';
import { InngestModule } from 'nestjs-inngest';

@Module({
  imports: [
    InngestModule.forRoot({
      appId: 'my-app',
      signingKey: process.env.INNGEST_SIGNING_KEY,
      eventKey: process.env.INNGEST_EVENT_KEY,
      // httpPlatform: 'express' // Optional, auto-detected
    }),
  ],
})
export class AppModule {}
```

### Fastify

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );
  await app.listen(3000);
}
bootstrap();

// app.module.ts
import { Module } from '@nestjs/common';
import { InngestModule } from 'nestjs-inngest';

@Module({
  imports: [
    InngestModule.forRoot({
      appId: 'my-app',
      signingKey: process.env.INNGEST_SIGNING_KEY,
      eventKey: process.env.INNGEST_EVENT_KEY,
      httpPlatform: 'fastify', // Optional, auto-detected
    }),
  ],
})
export class AppModule {}
```

## Configuration Options

### httpPlatform

You can explicitly specify which HTTP platform to use:

```typescript
InngestModule.forRoot({
  appId: 'my-app',
  // ... other config
  httpPlatform: 'express' | 'fastify' | 'auto', // Default: 'auto'
})
```

- `'express'` - Force Express adapter
- `'fastify'` - Force Fastify adapter  
- `'auto'` - Auto-detect platform (default)

## Raw Body Middleware

For proper webhook signature verification, you need to configure raw body middleware:

### Express

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Raw body middleware for webhook signature verification
  app.use('/api/inngest', json({ 
    limit: '1mb',
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  }));
  
  await app.listen(3000);
}
bootstrap();
```

### Fastify

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );

  // Register raw body parser for Inngest webhooks
  await app.register(async function (fastify) {
    fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, 
      function (req, body, done) {
        req.rawBody = body;
        try {
          const json = JSON.parse(body.toString());
          done(null, json);
        } catch (err) {
          done(err);
        }
      }
    );
  });

  await app.listen(3000);
}
bootstrap();
```

## Advanced Usage

### Manual Platform Detection

```typescript
import { PlatformDetector } from 'nestjs-inngest';

// Detect current platform
const detection = PlatformDetector.detectPlatform();
console.log(`Using ${detection.platform} platform`);

// Get available platforms
const platforms = PlatformDetector.getAvailablePlatforms();
platforms.forEach(p => {
  console.log(`${p.platform}: ${p.available ? 'available' : 'not available'}`);
});
```

### Custom Adapter

You can create custom adapters by implementing the `HttpPlatformAdapter` interface:

```typescript
import { HttpPlatformAdapter, HttpRequestAdapter, HttpResponseAdapter } from 'nestjs-inngest';

export class CustomHttpAdapter implements HttpPlatformAdapter {
  extractRequest(req: any): HttpRequestAdapter {
    return {
      body: req.body,
      headers: req.headers,
      method: req.method,
      url: req.url,
      rawBody: req.rawBody
    };
  }

  wrapResponse(res: any): HttpResponseAdapter {
    return {
      status: (code: number) => { res.statusCode = code; return this; },
      header: (name: string, value: string) => { res.setHeader(name, value); return this; },
      send: (data: any) => res.end(data),
      json: (data: any) => res.end(JSON.stringify(data))
    };
  }

  getRawBody(req: any): Buffer | string {
    return req.rawBody || JSON.stringify(req.body);
  }

  getPlatformName(): string {
    return 'custom';
  }

  isCompatible(req: any): boolean {
    return req && typeof req.method === 'string';
  }
}
```

## Migration Guide

### From Express-only to Multi-platform

If you're upgrading from a previous version that only supported Express:

1. **No breaking changes** - Your existing Express code will continue to work
2. **Auto-detection** - The module will automatically detect Express
3. **Optional explicit config** - You can optionally specify `httpPlatform: 'express'`

### Function Signatures

Your Inngest functions remain unchanged:

```typescript
import { Injectable } from '@nestjs/common';
import { InngestFunction } from 'nestjs-inngest';

@Injectable()
export class MyService {
  @InngestFunction({
    id: 'my-function',
    triggers: [{ event: 'my.event' }],
  })
  async handleEvent(event: any, { step }: any) {
    // Your function logic remains the same regardless of HTTP platform
    return await step.run('process', () => {
      return { message: 'Hello from ' + event.data.name };
    });
  }
}
```

## Troubleshooting

### Raw Body Issues

If you see warnings about raw body not being available:

```
Raw body not available for [platform], using JSON.stringify as fallback. 
Consider configuring raw body middleware for better security.
```

This means you need to set up raw body middleware as shown in the examples above.

### Platform Detection Issues

If the wrong platform is detected, you can force a specific platform:

```typescript
InngestModule.forRoot({
  appId: 'my-app',
  httpPlatform: 'fastify', // Force Fastify instead of auto-detection
  // ... other config
})
```

### Performance Considerations

- **Fastify** generally provides better performance than Express
- **Auto-detection** adds minimal overhead during module initialization
- **Raw body parsing** is required for proper webhook signature verification

## Examples

See the `/examples` directory for complete working examples:

- `examples/express-app/` - Express application with Inngest
- `examples/fastify-app/` - Fastify application with Inngest
- `examples/mixed-platform/` - Application that can run on either platform

## API Reference

### Types

```typescript
type HttpPlatformType = 'express' | 'fastify' | 'auto';

interface HttpPlatformAdapter {
  extractRequest(req: any): HttpRequestAdapter;
  wrapResponse(res: any): HttpResponseAdapter;
  getRawBody(req: any): Buffer | string;
  getPlatformName(): string;
  isCompatible(req: any): boolean;
}

interface PlatformDetectionResult {
  platform: HttpPlatformType;
  adapter: new (options?: HttpAdapterOptions) => HttpPlatformAdapter;
  available: boolean;
}
```

### Classes

- `ExpressHttpAdapter` - Express platform adapter
- `FastifyHttpAdapter` - Fastify platform adapter  
- `PlatformDetector` - Platform detection utility