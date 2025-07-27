# Troubleshooting Guide

This guide helps you diagnose and fix common issues when using nestjs-inngest.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Configuration Problems](#configuration-problems)
- [Function Registration Issues](#function-registration-issues)
- [Webhook Problems](#webhook-problems)
- [Event Handling Issues](#event-handling-issues)
- [Type Safety Problems](#type-safety-problems)
- [Performance Issues](#performance-issues)
- [Testing Problems](#testing-problems)
- [Production Debugging](#production-debugging)
- [Common Error Messages](#common-error-messages)

## Installation Issues

### Dependency Conflicts

**Problem**: npm install fails with peer dependency warnings.

**Solution**:
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Install with legacy peer deps
npm install --legacy-peer-deps

# Or use exact versions
npm install nestjs-inngest@^1.0.0 inngest@^3.0.0
```

### TypeScript Version Conflicts

**Problem**: TypeScript compilation errors related to decorator metadata.

**Solution**:
```json
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "target": "ES2020",
    "skipLibCheck": true
  }
}
```

## Configuration Problems

### Missing Environment Variables

**Problem**: Application starts but Inngest functions don't work.

**Symptoms**:
- Functions not registered
- Webhook 401/403 errors
- Events not sending

**Diagnosis**:
```typescript
// Add this to your main.ts to debug configuration
const config = app.get(ConfigService);
console.log('Inngest Config:', {
  appId: config.get('INNGEST_APP_ID'),
  hasSigningKey: !!config.get('INNGEST_SIGNING_KEY'),
  hasEventKey: !!config.get('INNGEST_EVENT_KEY'),
});
```

**Solution**:
```bash
# .env file
INNGEST_APP_ID=your-app-id
INNGEST_SIGNING_KEY=signkey-prod-xxxxx
INNGEST_EVENT_KEY=your-event-key
```

### Invalid Configuration Values

**Problem**: Configuration validation fails.

**Error Messages**:
- "App ID is required"
- "Invalid signing key format"
- "Event key must be provided"

**Solution**:
```typescript
// Validate configuration in app module
@Module({
  imports: [
    InngestModule.forRootAsync({
      useFactory: (config: ConfigService) => {
        const inngestConfig = {
          appId: config.get('INNGEST_APP_ID'),
          signingKey: config.get('INNGEST_SIGNING_KEY'),
          eventKey: config.get('INNGEST_EVENT_KEY'),
        };

        // Validate required fields
        if (!inngestConfig.appId) {
          throw new Error('INNGEST_APP_ID is required');
        }
        if (!inngestConfig.signingKey) {
          console.warn('INNGEST_SIGNING_KEY not set - webhooks will fail in production');
        }
        if (!inngestConfig.eventKey) {
          console.warn('INNGEST_EVENT_KEY not set - event sending will fail');
        }

        return inngestConfig;
      },
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

## Function Registration Issues

### Functions Not Being Discovered

**Problem**: @InngestFunction decorated methods are not registered.

**Symptoms**:
- Function count is 0
- Functions don't appear in Inngest dashboard
- PUT /api/inngest returns empty functions array

**Diagnosis**:
```typescript
// Check function registration in your service
@Injectable()
export class DiagnosticService {
  constructor(private readonly functionRegistry: FunctionRegistry) {}

  @Get('debug/functions')
  getFunctions() {
    return {
      count: this.functionRegistry.getFunctionCount(),
      functions: this.functionRegistry.createInngestFunctions(),
    };
  }
}
```

**Solution**:
```typescript
// 1. Ensure service is properly imported in module
@Module({
  providers: [MyService], // ✅ Service must be in providers array
  exports: [MyService],   // ✅ Export if used in other modules
})
export class MyModule {}

// 2. Ensure service has @Injectable() decorator
@Injectable() // ✅ Required decorator
export class MyService {
  @InngestFunction({...}) // ✅ Function decorator
  async myFunction() {}
}

// 3. Ensure module is imported in app module
@Module({
  imports: [
    InngestModule.forRoot({...}),
    MyModule, // ✅ Import the module containing your service
  ],
})
export class AppModule {}
```

### Duplicate Function IDs

**Problem**: Multiple functions with the same ID.

**Error Message**: "Function ID must be unique: my-function-id"

**Solution**:
```typescript
// Ensure all function IDs are unique across your application
@InngestFunction({
  id: 'user-service-welcome-email', // ✅ Prefixed with service name
  triggers: [{ event: 'user.registered' }],
})
async sendWelcomeEmail() {}

@InngestFunction({
  id: 'order-service-welcome-email', // ✅ Different prefix
  triggers: [{ event: 'order.completed' }],
})
async sendOrderWelcomeEmail() {}
```

### Function Metadata Errors

**Problem**: Function configuration is invalid.

**Common Issues**:
- Missing triggers array
- Invalid trigger format
- Invalid timeout values

**Solution**:
```typescript
// ✅ Correct function configuration
@InngestFunction({
  id: 'my-function',
  name: 'My Function',
  triggers: [{ event: 'my.event' }], // ✅ Array of triggers
  retries: 3,
  timeout: 30000, // ✅ Number in milliseconds
})
async myFunction() {}

// ❌ Common mistakes
@InngestFunction({
  id: 'bad-function',
  trigger: { event: 'my.event' }, // ❌ Should be 'triggers' (plural)
  timeout: '30s', // ❌ Should be number, not string
})
async badFunction() {}
```

## Webhook Problems

### 401/403 Webhook Errors

**Problem**: Webhook requests are being rejected with authentication errors.

**Symptoms**:
- 401 Unauthorized
- 403 Forbidden
- "Invalid signature" errors

**Diagnosis**:
```bash
# Check webhook configuration
curl -X PUT http://localhost:3000/api/inngest

# Check if signature verification is working
curl -X POST http://localhost:3000/api/inngest \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**Solutions**:

1. **Development Mode (Local Testing)**:
```typescript
InngestModule.forRoot({
  // ... other config
  development: {
    enabled: true,
    disableSignatureVerification: true, // ✅ Disable for local dev
  },
})
```

2. **Production Mode (Correct Signing Key)**:
```typescript
InngestModule.forRoot({
  signingKey: process.env.INNGEST_SIGNING_KEY, // ✅ Must match dashboard
  development: {
    enabled: false,
    disableSignatureVerification: false, // ✅ Enable for production
  },
})
```

3. **Verify Signing Key Format**:
```bash
# Signing key should start with 'signkey-'
echo $INNGEST_SIGNING_KEY
# Should output: signkey-prod-xxxxxxxxxx
```

### Webhook Endpoint Not Found

**Problem**: 404 errors when Inngest tries to call your webhook.

**Symptoms**:
- 404 Not Found for POST/PUT /api/inngest
- Functions work locally but not from Inngest dashboard

**Diagnosis**:
```bash
# Check if endpoint exists
curl -X PUT http://localhost:3000/api/inngest
# Should return function definitions

# Check routing
npm run start:dev
# Look for "Mapped {/api/inngest, POST}" in logs
```

**Solution**:
```typescript
// Ensure InngestController is properly registered
@Module({
  imports: [InngestModule.forRoot({...})],
  controllers: [], // ✅ Controller auto-registered by InngestModule
})
export class AppModule {}

// If using custom endpoint path:
InngestModule.forRoot({
  endpoint: '/webhooks/inngest', // ✅ Custom path
})

// Update Inngest dashboard webhook URL to match:
// https://yourdomain.com/webhooks/inngest
```

### CORS Issues

**Problem**: Browser-based requests to webhook endpoint fail.

**Note**: Webhook endpoints should not be called from browsers, but if needed:

**Solution**:
```typescript
// main.ts
app.enableCors({
  origin: ['https://app.inngest.com'],
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

## Event Handling Issues

### Events Not Triggering Functions

**Problem**: Events are sent but functions don't execute.

**Diagnosis**:
```typescript
// Add logging to your event sending
@Injectable()
export class DebugService {
  constructor(private readonly inngestService: InngestService) {}

  async sendTestEvent() {
    console.log('Sending event...');
    
    try {
      const result = await this.inngestService.send({
        name: 'test.event',
        data: { test: true, timestamp: Date.now() },
      });
      
      console.log('Event sent successfully:', result);
    } catch (error) {
      console.error('Event sending failed:', error);
    }
  }
}
```

**Solutions**:

1. **Check Event Name Matching**:
```typescript
// Event name must exactly match trigger
await inngestService.send({
  name: 'user.registered', // ✅ Exact match
  data: { userId: '123' },
});

@InngestFunction({
  triggers: [{ event: 'user.registered' }], // ✅ Must match exactly
})
async handleUserRegistered() {}
```

2. **Check Event Key Configuration**:
```bash
# Ensure INNGEST_EVENT_KEY is set
echo $INNGEST_EVENT_KEY
```

3. **Verify Function is Registered**:
```bash
# Check function list
curl -X PUT http://localhost:3000/api/inngest | jq '.functions[].id'
```

### Event Data Type Mismatches

**Problem**: Runtime errors due to unexpected event data structure.

**Error Messages**:
- "Cannot read property 'userId' of undefined"
- "Expected string but got number"

**Solution**:
```typescript
// Use type-safe event definitions
type MyEvents = EventTypes<{
  'user.registered': {
    userId: string;
    email: string;
    timestamp: string;
  };
}>;

@TypedInngestFunction<MyEvents>({
  id: 'handle-user-registered',
  triggers: [{ event: 'user.registered' }],
})
async handleUser(
  event: MyEvents['user.registered'], // ✅ Type-safe
  context: InngestFunctionContext
) {
  // event.data is now properly typed
  const { userId, email } = event.data;
}

// Validate event data before sending
const eventData = {
  userId: user.id,
  email: user.email,
  timestamp: new Date().toISOString(),
};

// Runtime validation (optional)
if (!eventData.userId || !eventData.email) {
  throw new Error('Invalid event data');
}

await inngestService.send({
  name: 'user.registered',
  data: eventData,
});
```

## Type Safety Problems

### TypeScript Compilation Errors

**Problem**: Type errors when using typed functions.

**Common Errors**:
- "Type 'X' is not assignable to type 'Y'"
- "Property 'data' does not exist on type"

**Solution**:
```typescript
// 1. Ensure proper event type definition
type UserEvents = EventTypes<{
  'user.created': { userId: string; email: string };
}>;

// 2. Use correct function signature
@TypedInngestFunction<UserEvents>({
  id: 'handle-user-created',
  triggers: [{ event: 'user.created' }],
})
async handleUserCreated(
  event: UserEvents['user.created'], // ✅ Correct typing
  context: InngestFunctionContext     // ✅ Correct context type
) {
  // TypeScript now knows event.data structure
  const { userId, email } = event.data;
}

// 3. Send events with correct data structure
const userEvent: UserEvents['user.created'] = {
  name: 'user.created',
  data: {
    userId: '123',
    email: 'user@example.com',
  },
};

await inngestService.send(userEvent);
```

### Event Factory Type Issues

**Problem**: Type errors when using event factories.

**Solution**:
```typescript
// Create strongly-typed event factory
export class UserEventFactory {
  static userCreated(data: {
    userId: string;
    email: string;
  }): UserEvents['user.created'] {
    return {
      name: 'user.created',
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
      id: `user-created-${data.userId}-${Date.now()}`,
    };
  }
}

// Usage
const event = UserEventFactory.userCreated({
  userId: user.id,
  email: user.email,
});

await inngestService.send(event);
```

## Performance Issues

### Function Timeout Errors

**Problem**: Functions timing out during execution.

**Error Messages**:
- "Function timed out after 30000ms"
- "Context deadline exceeded"

**Diagnosis**:
```typescript
@InngestFunction({
  id: 'debug-timing',
  triggers: [{ event: 'debug.timing' }],
  timeout: 60000, // 60 seconds
})
async debugTiming(event: any, { step, logger }: any) {
  const startTime = Date.now();
  
  const result = await step.run('long-operation', async () => {
    const operationStart = Date.now();
    
    // Your long-running operation
    await this.longRunningOperation();
    
    const duration = Date.now() - operationStart;
    logger.info(`Operation took ${duration}ms`);
    
    return { duration };
  });
  
  const totalDuration = Date.now() - startTime;
  logger.info(`Total function time: ${totalDuration}ms`);
  
  return result;
}
```

**Solutions**:

1. **Increase Timeout**:
```typescript
@InngestFunction({
  id: 'long-running-function',
  triggers: [{ event: 'process.large.data' }],
  timeout: 300000, // 5 minutes
})
async processLargeData() {}
```

2. **Break Down Long Operations**:
```typescript
@InngestFunction({
  id: 'process-in-chunks',
  triggers: [{ event: 'process.data' }],
})
async processInChunks(event: any, { step }: any) {
  const { items } = event.data;
  const chunkSize = 100;
  
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    
    await step.run(`process-chunk-${i}`, async () => {
      return this.processChunk(chunk);
    });
    
    // Optional: Add delay between chunks
    if (i + chunkSize < items.length) {
      await step.sleep('chunk-delay', '1s');
    }
  }
}
```

3. **Use Streaming for Large Data**:
```typescript
async processLargeFile(fileId: string, step: any) {
  const stream = await step.run('create-stream', async () => {
    return this.fileService.createReadStream(fileId);
  });
  
  let chunkCount = 0;
  
  return new Promise((resolve, reject) => {
    stream.on('data', async (chunk) => {
      await step.run(`process-chunk-${chunkCount++}`, async () => {
        return this.processChunk(chunk);
      });
    });
    
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}
```

### Memory Issues

**Problem**: Functions running out of memory.

**Symptoms**:
- "JavaScript heap out of memory"
- Functions failing with large datasets

**Solution**:
```typescript
@InngestFunction({
  id: 'memory-efficient-processing',
  triggers: [{ event: 'process.large.dataset' }],
})
async processLargeDataset(event: any, { step }: any) {
  const { datasetId } = event.data;
  
  // Process in small batches to manage memory
  let offset = 0;
  const batchSize = 1000;
  let hasMore = true;
  
  while (hasMore) {
    const batch = await step.run(`fetch-batch-${offset}`, async () => {
      return this.dataService.getBatch(datasetId, offset, batchSize);
    });
    
    if (batch.length === 0) {
      hasMore = false;
      break;
    }
    
    await step.run(`process-batch-${offset}`, async () => {
      // Process batch and immediately free memory
      const results = this.processBatch(batch);
      
      // Clear references to allow garbage collection
      batch.length = 0;
      
      return results;
    });
    
    offset += batchSize;
  }
}
```

### Concurrency Issues

**Problem**: Too many concurrent executions causing resource exhaustion.

**Solution**:
```typescript
@InngestFunction({
  id: 'rate-limited-function',
  triggers: [{ event: 'high.volume.event' }],
  concurrency: { limit: 10 }, // ✅ Limit concurrent executions
  rateLimit: { 
    limit: 100, 
    period: '1m' 
  }, // ✅ Rate limiting
})
async handleHighVolumeEvent() {}
```

## Testing Problems

### Mock Services Not Working

**Problem**: Tests fail because real services are being called.

**Solution**:
```typescript
describe('MyService', () => {
  let service: MyService;
  
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        InngestTestingModule.forTest({
          useRealServices: false, // ✅ Use mocks
          mockConfig: {
            appId: 'test-app',
            signingKey: 'test-key',
          },
        }),
      ],
      providers: [
        MyService,
        {
          provide: ExternalService,
          useValue: {
            // ✅ Mock external service
            doSomething: jest.fn().mockResolvedValue('mocked result'),
          },
        },
      ],
    }).compile();
    
    service = module.get<MyService>(MyService);
  });
});
```

### Step Function Mocking Issues

**Problem**: Step functions not being mocked properly in tests.

**Solution**:
```typescript
it('should handle function with steps', async () => {
  const event = InngestTestUtils.createTestEvent('test.event', {
    data: 'test',
  });
  
  const mockContext = InngestTestUtils.createMockExecutionContext(
    'my-function',
    'run-123',
    event
  );
  
  // ✅ Mock step function responses in order
  mockContext.step.run
    .mockResolvedValueOnce('step-1-result')
    .mockResolvedValueOnce('step-2-result')
    .mockResolvedValueOnce('step-3-result');
  
  mockContext.step.sendEvent.mockResolvedValue(undefined);
  
  const result = await service.myFunction(event, mockContext);
  
  // ✅ Verify step calls
  expect(mockContext.step.run).toHaveBeenCalledTimes(3);
  expect(mockContext.step.run).toHaveBeenNthCalledWith(
    1,
    'step-1',
    expect.any(Function)
  );
});
```

## Production Debugging

### Enable Debug Logging

```typescript
// Development logging
InngestModule.forRoot({
  logger: true,
  development: {
    enabled: process.env.NODE_ENV === 'development',
  },
})

// Custom logger
import { Logger } from '@nestjs/common';

const logger = new Logger('InngestDebug');

// Log function executions
@InngestFunction({...})
async myFunction(event: any, { step, logger: inngestLogger }: any) {
  logger.log(`Function started with event: ${event.name}`);
  inngestLogger.info('Inngest function started', { eventId: event.id });
  
  try {
    const result = await step.run('main-operation', async () => {
      return this.doSomething();
    });
    
    logger.log(`Function completed successfully`);
    return result;
  } catch (error) {
    logger.error(`Function failed: ${error.message}`, error.stack);
    throw error;
  }
}
```

### Health Check Debugging

```typescript
@Controller('debug')
export class DebugController {
  constructor(
    private readonly functionRegistry: FunctionRegistry,
    private readonly inngestService: InngestService,
  ) {}
  
  @Get('inngest/status')
  getInngestStatus() {
    return {
      functionsRegistered: this.functionRegistry.getFunctionCount(),
      functions: this.functionRegistry.createInngestFunctions().map(f => ({
        id: f.id,
        name: f.name,
        triggers: f.triggers,
      })),
      timestamp: new Date().toISOString(),
    };
  }
  
  @Post('inngest/test-event')
  async sendTestEvent() {
    try {
      const result = await this.inngestService.send({
        name: 'debug.test',
        data: { timestamp: Date.now() },
      });
      
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
```

## Common Error Messages

### "Function not found: function-id"

**Cause**: Function with the specified ID is not registered.

**Solution**:
1. Check function is decorated with `@InngestFunction`
2. Verify service is in module providers
3. Ensure module is imported in app module
4. Check function ID matches exactly

### "Invalid signature"

**Cause**: Webhook signature verification failed.

**Solution**:
1. Check signing key in environment variables
2. Verify signing key format (starts with 'signkey-')
3. Enable development mode for local testing
4. Check webhook URL in Inngest dashboard

### "App ID is required"

**Cause**: INNGEST_APP_ID environment variable not set.

**Solution**:
```bash
# Add to .env file
INNGEST_APP_ID=your-app-id
```

### "Cannot read property 'run' of undefined"

**Cause**: Step tools not properly passed to function.

**Solution**:
```typescript
// ✅ Correct function signature
async myFunction(event: any, { step }: InngestFunctionContext) {
  await step.run('my-step', async () => {
    return this.doSomething();
  });
}

// ❌ Incorrect - missing destructuring
async myFunction(event: any, context: InngestFunctionContext) {
  await context.step.run('my-step', async () => { // ✅ This works too
    return this.doSomething();
  });
}
```

### "Circular dependency detected"

**Cause**: Services have circular dependencies when using dependency injection.

**Solution**:
```typescript
// Use forwardRef to resolve circular dependencies
@Injectable()
export class UserService {
  constructor(
    @Inject(forwardRef(() => EmailService))
    private emailService: EmailService,
  ) {}
}

@Injectable()
export class EmailService {
  constructor(
    @Inject(forwardRef(() => UserService))
    private userService: UserService,
  ) {}
}
```

## Getting Help

If you're still experiencing issues:

1. **Check Documentation**: Review the [API Reference](api-reference.md) and [Usage Guide](usage-guide.md)
2. **Search Issues**: Look through [GitHub Issues](https://github.com/shine201/nestjs-inngest/issues)
3. **Enable Debug Logging**: Add verbose logging to identify the problem
4. **Create Minimal Reproduction**: Create a simple example that reproduces the issue
5. **File an Issue**: Include error messages, configuration, and reproduction steps

### Issue Template

When filing an issue, include:

```
**Environment:**
- nestjs-inngest version: 
- NestJS version: 
- Node.js version: 
- Operating System: 

**Configuration:**
```typescript
// Your InngestModule configuration (remove secrets)
```

**Code:**
```typescript
// Minimal code that reproduces the issue
```

**Error Message:**
```
// Full error message and stack trace
```

**Expected Behavior:**
// What you expected to happen

**Actual Behavior:**
// What actually happened
```

This will help maintainers quickly identify and fix the issue.