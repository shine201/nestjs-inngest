# API Reference

This document provides a complete reference for all classes, interfaces, decorators, and services in the nestjs-inngest library.

## Table of Contents

- [Modules](#modules)
- [Decorators](#decorators)
- [Services](#services)
- [Interfaces](#interfaces)
- [Types](#types)
- [Errors](#errors)
- [Testing Utilities](#testing-utilities)

## Modules

### InngestModule

The main module for integrating Inngest with NestJS applications.

#### Static Methods

##### `forRoot(config: InngestModuleConfig): DynamicModule`

Creates a module with synchronous configuration.

**Parameters:**
- `config` - The Inngest module configuration

**Returns:** A configured dynamic module

**Example:**
```typescript
@Module({
  imports: [
    InngestModule.forRoot({
      appId: 'my-app',
      signingKey: process.env.INNGEST_SIGNING_KEY,
      eventKey: process.env.INNGEST_EVENT_KEY,
    }),
  ],
})
export class AppModule {}
```

##### `forRootAsync(options: InngestModuleAsyncOptions): DynamicModule`

Creates a module with asynchronous configuration.

**Parameters:**
- `options` - Async configuration options

**Returns:** A configured dynamic module

**Example:**
```typescript
@Module({
  imports: [
    InngestModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        appId: configService.get('INNGEST_APP_ID'),
        signingKey: configService.get('INNGEST_SIGNING_KEY'),
        eventKey: configService.get('INNGEST_EVENT_KEY'),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

##### `forRootGlobal(config: InngestModuleConfig): DynamicModule`

Creates a global module with synchronous configuration.

## Decorators

### @InngestFunction(config: InngestFunctionConfig)

Marks a method as an Inngest function that will be automatically registered.

**Parameters:**
- `config` - Function configuration object

**Example:**
```typescript
@Injectable()
export class UserService {
  @InngestFunction({
    id: 'user-welcome',
    name: 'User Welcome Flow',
    triggers: [{ event: 'user.created' }],
    retries: 3,
    timeout: 30000,
  })
  async handleUserCreated(event: InngestEvent, context: InngestFunctionContext) {
    // Function implementation
  }
}
```

### @TypedInngestFunction<EventTypes>(config: InngestFunctionConfig)

Type-safe version of `@InngestFunction` with compile-time event type checking.

**Type Parameters:**
- `EventTypes` - Event type definitions

**Parameters:**
- `config` - Function configuration object

**Example:**
```typescript
type MyEvents = EventTypes<{
  'user.created': { userId: string; email: string };
  'order.placed': { orderId: string; total: number };
}>;

@Injectable()
export class UserService {
  @TypedInngestFunction<MyEvents>({
    id: 'typed-user-handler',
    triggers: [{ event: 'user.created' }],
  })
  async handleUserCreated(
    event: MyEvents['user.created'],
    context: InngestFunctionContext
  ) {
    // event.data is now typed as { userId: string; email: string }
  }
}
```

## Services

### InngestService

Main service for interacting with Inngest platform.

#### Constructor

**Parameters:**
- `config: MergedInngestConfig` - Validated configuration object

#### Methods

##### `send(event: InngestEvent): Promise<void>`

Sends a single event to Inngest.

**Parameters:**
- `event` - The event to send

**Returns:** Promise that resolves when event is sent

**Example:**
```typescript
await this.inngestService.send({
  name: 'user.created',
  data: { userId: '123', email: 'user@example.com' },
});
```

##### `send(events: InngestEvent[]): Promise<void>`

Sends multiple events to Inngest in a batch.

**Parameters:**
- `events` - Array of events to send

**Returns:** Promise that resolves when all events are sent

**Example:**
```typescript
await this.inngestService.send([
  { name: 'user.created', data: { userId: '123' } },
  { name: 'user.welcomed', data: { userId: '123' } },
]);
```

##### `getClient(): Inngest`

Gets the underlying Inngest client instance.

**Returns:** The raw Inngest client

### FunctionRegistry

Service for managing function registrations and metadata.

#### Methods

##### `getFunction(id: string): InngestFunctionMetadata | undefined`

Retrieves function metadata by ID.

**Parameters:**
- `id` - Function identifier

**Returns:** Function metadata or undefined if not found

##### `getFunctionCount(): number`

Gets the total number of registered functions.

**Returns:** Number of registered functions

##### `createInngestFunctions(): any[]`

Creates Inngest function definitions for registration.

**Returns:** Array of Inngest function definitions

### ExecutionContextService

Service for managing function execution contexts and dependency injection.

#### Methods

##### `createExecutionContext(functionMetadata: InngestFunctionMetadata, event: InngestEvent, runId: string, attempt: number): Promise<ExecutionContext>`

Creates an execution context for a function.

**Parameters:**
- `functionMetadata` - Function metadata
- `event` - Triggering event
- `runId` - Unique run identifier
- `attempt` - Execution attempt number

**Returns:** Promise resolving to execution context

##### `executeFunction(context: ExecutionContext): Promise<any>`

Executes a function within the provided context.

**Parameters:**
- `context` - Execution context

**Returns:** Promise resolving to function result

### SignatureVerificationService

Service for webhook signature verification.

#### Methods

##### `verifyWebhookSignature(request: Request, options: { signingKey: string; toleranceSeconds?: number }): Promise<void>`

Verifies webhook signature from Inngest.

**Parameters:**
- `request` - HTTP request object
- `options` - Verification options

**Throws:** Error if signature is invalid

##### `validateSignatureConfig(config: { signingKey: string }): void`

Validates signature configuration.

**Parameters:**
- `config` - Configuration to validate

**Throws:** Error if configuration is invalid

##### `getVerificationStatus(signingKey: string): VerificationStatus`

Gets signature verification status.

**Parameters:**
- `signingKey` - Signing key to check

**Returns:** Verification status object

### ScopeManagerService

Service for managing NestJS scoped providers during function execution.

#### Methods

##### `createFunctionScope(contextId: any): Promise<void>`

Creates a new scope for function execution.

**Parameters:**
- `contextId` - NestJS context identifier

##### `cleanupScope(contextId: any): Promise<void>`

Cleans up function execution scope.

**Parameters:**
- `contextId` - NestJS context identifier

### EnhancedLogger

Enhanced logging service with structured output and context.

#### Methods

##### `log(message: string, context?: any): void`

Logs an info message.

##### `error(message: string, context?: any): void`

Logs an error message.

##### `warn(message: string, context?: any): void`

Logs a warning message.

##### `debug(message: string, context?: any): void`

Logs a debug message.

##### `logFunctionStart(functionId: string, runId: string, attempt: number, context?: any): void`

Logs function execution start.

##### `logFunctionSuccess(functionId: string, runId: string, attempt: number, duration: number, result?: any): void`

Logs successful function execution.

##### `logFunctionError(functionId: string, runId: string, attempt: number, duration: number, error: Error, context?: any): void`

Logs function execution error.

##### `logWebhook(method: string, functionId: string, status: string, statusCode?: number, context?: any, error?: Error): void`

Logs webhook processing events.

##### `logPerformance(operation: string, duration: number, functionId?: string, runId?: string): void`

Logs performance metrics.

## Interfaces

### InngestModuleConfig

Configuration interface for the Inngest module.

```typescript
interface InngestModuleConfig {
  appId: string;                    // Required: App identifier
  eventKey?: string;                // Event key for sending events
  signingKey?: string;              // Signing key for webhook verification
  baseUrl?: string;                 // Inngest API base URL
  endpoint?: string;                // Webhook endpoint path
  isDev?: boolean;                  // Development mode flag
  logger?: boolean;                 // Enable logging
  env?: InngestEnvironment;         // Environment setting
  timeout?: number;                 // Function timeout in ms
  retry?: Partial<RetryConfig>;     // Retry configuration
  maxBatchSize?: number;            // Max batch size for events
  strict?: boolean;                 // Strict mode for validation
  development?: DevelopmentModeConfig; // Development settings
}
```

### InngestFunctionConfig

Configuration for individual Inngest functions.

```typescript
interface InngestFunctionConfig {
  id: string;                       // Required: Unique function ID
  name?: string;                    // Human-readable name
  triggers: InngestTrigger[];       // Array of triggers
  concurrency?: number | ConcurrencyConfig; // Concurrency limits
  rateLimit?: RateLimit;            // Rate limiting config
  retries?: number;                 // Number of retries
  timeout?: number;                 // Function timeout in ms
}
```

### InngestEvent<T = any>

Event interface for Inngest events.

```typescript
interface InngestEvent<T = any> {
  name: string;                     // Required: Event name
  data: T;                          // Required: Event data
  id?: string;                      // Optional: Event ID
  ts?: number;                      // Optional: Timestamp
  user?: {                          // Optional: User context
    id: string;
    [key: string]: any;
  };
  v?: string;                       // Optional: Version
}
```

### InngestFunctionContext<T = any>

Context object passed to Inngest functions.

```typescript
interface InngestFunctionContext<T = any> {
  event: InngestEvent<T>;           // Triggering event
  step: StepTools;                  // Step execution tools
  logger: Logger;                   // Logger instance
  runId: string;                    // Function run ID
  attempt: number;                  // Execution attempt number
}
```

### StepTools

Interface for step execution tools within functions.

```typescript
interface StepTools {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>;
  sleep(duration: string | number): Promise<void>;
  waitForEvent(
    event: string,
    options?: { timeout?: string | number; if?: string }
  ): Promise<InngestEvent>;
  sendEvent(event: InngestEvent | InngestEvent[]): Promise<void>;
  invoke<T>(functionId: string, data?: any): Promise<T>;
}
```

### RetryConfig

Configuration for retry behavior.

```typescript
interface RetryConfig {
  maxAttempts: number;              // Maximum retry attempts
  initialDelay: number;             // Initial delay in ms
  maxDelay?: number;                // Maximum delay in ms
  backoff?: 'exponential' | 'linear' | 'fixed'; // Backoff strategy
  backoffMultiplier?: number;       // Multiplier for exponential backoff
}
```

### ConcurrencyConfig

Configuration for function concurrency.

```typescript
interface ConcurrencyConfig {
  limit: number;                    // Maximum concurrent executions
  key?: string;                     // Optional concurrency key
}
```

### RateLimit

Configuration for rate limiting.

```typescript
interface RateLimit {
  limit: number;                    // Maximum executions per period
  period: string;                   // Time period (e.g., "1h", "5m")
  key?: string;                     // Optional rate limit key
}
```

### DevelopmentModeConfig

Configuration for development mode features.

```typescript
interface DevelopmentModeConfig {
  enabled: boolean;                 // Enable development mode
  disableSignatureVerification?: boolean; // Disable webhook signature verification
}
```

## Types

### InngestEnvironment

```typescript
type InngestEnvironment = 'production' | 'development' | 'test';
```

### InngestTrigger

```typescript
type InngestTrigger = EventTrigger | CronTrigger;

interface EventTrigger {
  event: string;                    // Event name to trigger on
  if?: string;                      // Optional condition expression
}

interface CronTrigger {
  cron: string;                     // Cron expression
}
```

### EventTypes<T>

Utility type for defining type-safe event schemas.

```typescript
type EventTypes<T extends Record<string, any>> = {
  [K in keyof T]: InngestEvent<T[K]>;
};
```

### InngestFunctionHandler<T = any>

Type for function handler methods.

```typescript
type InngestFunctionHandler<T = any> = (
  context: InngestFunctionContext<T>
) => Promise<any>;
```

## Errors

### InngestError

Base error class for all Inngest-related errors.

```typescript
class InngestError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly context?: any
  );
}
```

### InngestConfigError

Error thrown for configuration issues.

```typescript
class InngestConfigError extends InngestError {
  constructor(message: string, context?: any);
}
```

### InngestEventError

Error thrown for event-related issues.

```typescript
class InngestEventError extends InngestError {
  constructor(message: string, context?: any);
}
```

### InngestFunctionError

Error thrown for function-related issues.

```typescript
class InngestFunctionError extends InngestError {
  constructor(message: string, functionId?: string, context?: any);
}
```

### InngestWebhookError

Error thrown for webhook-related issues.

```typescript
class InngestWebhookError extends InngestError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: Error
  );
}
```

### InngestRuntimeError

Error thrown during function execution.

```typescript
class InngestRuntimeError extends InngestError {
  constructor(
    message: string,
    public readonly functionId?: string,
    public readonly runId?: string,
    public readonly originalError?: Error
  );
}
```

### InngestTimeoutError

Error thrown when functions timeout.

```typescript
class InngestTimeoutError extends InngestRuntimeError {
  constructor(
    message: string,
    functionId?: string,
    runId?: string,
    public readonly timeoutMs?: number
  );
}
```

### InngestRetryError

Error thrown when retry attempts are exhausted.

```typescript
class InngestRetryError extends InngestRuntimeError {
  constructor(
    message: string,
    functionId?: string,
    runId?: string,
    public readonly attempts?: number,
    public readonly originalError?: Error
  );
}
```

## Testing Utilities

### InngestTestingModule

Testing module for mocking Inngest services.

#### Static Methods

##### `forTest(config?: InngestTestingConfig): DynamicModule`

Creates a testing module with default mock services.

##### `forUnitTest(): DynamicModule`

Creates a minimal testing setup for unit tests.

##### `forIntegrationTest(config?: Partial<InngestTestingConfig>): DynamicModule`

Creates an integration testing setup with real services.

##### `forControllerTest(config?: Partial<InngestTestingConfig>): DynamicModule`

Creates a testing module for controller testing.

##### `createTestingModule(config?: InngestTestingConfig): Promise<TestingModule>`

Creates a testing module with automatic compilation.

### InngestTestUtils

Utility class for creating test data.

#### Static Methods

##### `createTestEvent<T>(name: string, data: T, options?: EventOptions): InngestEvent<T>`

Creates a test event with proper structure.

##### `createTestWebhookRequest(functionId: string, event: InngestEvent, options?: WebhookOptions): WebhookRequest`

Creates a test webhook request.

##### `createTestFunctionMetadata(id: string, options?: FunctionOptions): InngestFunctionMetadata`

Creates test function metadata.

##### `wait(ms: number): Promise<void>`

Utility for waiting in tests.

##### `createMockExecutionContext(functionId: string, runId: string, event: InngestEvent, attempt?: number): MockExecutionContext`

Creates a mock execution context.

##### `expectEventSent(mockSendEvent: jest.Mock, eventName: string, eventData?: any): any`

Assertion helper for checking sent events.

##### `expectFunctionTriggered(mockHandler: jest.Mock, expectedEvent?: any, expectedContext?: any): void`

Assertion helper for checking function triggers.

### Mock Services

#### MockInngestService

Mock implementation of InngestService for testing.

#### MockExecutionContextService

Mock implementation of ExecutionContextService for testing.

#### MockSignatureVerificationService

Mock implementation of SignatureVerificationService for testing.

Each mock service provides:
- All methods of the real service
- Configurable behavior for testing scenarios
- Assertion helpers for verifying interactions
- Reset/cleanup methods for test isolation

## Constants

### INNGEST_CONFIG

Injection token for the Inngest configuration.

```typescript
const INNGEST_CONFIG = Symbol('INNGEST_CONFIG');
```

### METADATA_KEYS

Metadata keys used by decorators.

```typescript
const METADATA_KEYS = {
  INNGEST_FUNCTION: Symbol('inngest:function'),
  INNGEST_HANDLER: Symbol('inngest:handler'),
} as const;
```

### ERROR_MESSAGES

Standard error messages used throughout the library.

```typescript
const ERROR_MESSAGES = {
  APP_ID_REQUIRED: 'App ID is required',
  FUNCTION_NOT_FOUND: 'Function not found',
  INVALID_EVENT_FORMAT: 'Invalid event format',
  // ... more error messages
} as const;
```

## Usage Examples

### Basic Function Registration

```typescript
@Injectable()
export class EmailService {
  @InngestFunction({
    id: 'send-welcome-email',
    name: 'Send Welcome Email',
    triggers: [{ event: 'user.registered' }],
  })
  async sendWelcomeEmail(
    event: InngestEvent<{ userId: string; email: string }>,
    { step }: InngestFunctionContext
  ) {
    const { userId, email } = event.data;
    
    const template = await step.run('load-template', async () => {
      return this.loadEmailTemplate('welcome');
    });
    
    await step.run('send-email', async () => {
      return this.sendEmail(email, template, { userId });
    });
  }
}
```

### Type-Safe Event Handling

```typescript
type AppEvents = EventTypes<{
  'user.registered': { userId: string; email: string; name: string };
  'order.created': { orderId: string; userId: string; items: any[] };
}>;

@Injectable()
export class OrderService {
  @TypedInngestFunction<AppEvents>({
    id: 'process-order',
    triggers: [{ event: 'order.created' }],
  })
  async processOrder(
    event: AppEvents['order.created'],
    { step }: InngestFunctionContext
  ) {
    // event.data is automatically typed
    const { orderId, userId, items } = event.data;
    
    // Implementation...
  }
}
```

### Testing Functions

```typescript
describe('EmailService', () => {
  let service: EmailService;
  let mockInngestService: MockInngestService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [InngestTestingModule.forTest()],
      providers: [EmailService],
    }).compile();

    service = module.get<EmailService>(EmailService);
    mockInngestService = module.get<MockInngestService>(InngestService);
  });

  it('should send welcome email', async () => {
    const event = InngestTestUtils.createTestEvent('user.registered', {
      userId: '123',
      email: 'test@example.com',
    });

    const mockContext = InngestTestUtils.createMockExecutionContext(
      'send-welcome-email',
      'run-123',
      event
    );

    await service.sendWelcomeEmail(event, mockContext);

    expect(mockContext.step.run).toHaveBeenCalledTimes(2);
  });
});
```