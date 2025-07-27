# Types and Interfaces

Complete reference for all TypeScript types and interfaces in nestjs-inngest.

## Core Interfaces

### InngestModuleConfig

Main configuration interface for the Inngest module.

```typescript
interface InngestModuleConfig {
  /**
   * The unique identifier for your Inngest app
   * @example 'my-nestjs-app'
   */
  appId: string;

  /**
   * Event key for sending events to Inngest
   * Required for sending events, optional for webhook-only usage
   */
  eventKey?: string;

  /**
   * Signing key for webhook signature verification
   * Required for production webhook security
   */
  signingKey?: string;

  /**
   * Base URL for Inngest API
   * @default 'https://api.inngest.com'
   */
  baseUrl?: string;

  /**
   * HTTP endpoint path for receiving webhooks
   * @default '/api/inngest'
   */
  endpoint?: string;

  /**
   * Enable development mode
   * @default false
   */
  isDev?: boolean;

  /**
   * Enable logging
   * @default true
   */
  logger?: boolean;

  /**
   * Environment setting
   * @default 'production'
   */
  env?: InngestEnvironment;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Retry configuration for event sending
   */
  retry?: Partial<RetryConfig>;

  /**
   * Maximum batch size for bulk event sending
   * @default 100
   */
  maxBatchSize?: number;

  /**
   * Enable strict mode for enhanced validation
   * @default false
   */
  strict?: boolean;

  /**
   * Development mode configuration
   */
  development?: DevelopmentModeConfig;
}
```

### InngestModuleAsyncOptions

Configuration options for asynchronous module setup.

```typescript
interface InngestModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  /**
   * Dependencies to inject into the factory function
   */
  inject?: any[];

  /**
   * Factory function to create the configuration
   */
  useFactory?: (
    ...args: any[]
  ) => Promise<InngestModuleConfig> | InngestModuleConfig;

  /**
   * Class to use for configuration
   */
  useClass?: Type<InngestConfigFactory>;

  /**
   * Existing provider to use for configuration
   */
  useExisting?: Type<InngestConfigFactory>;
}
```

### InngestFunctionConfig

Configuration for individual Inngest functions.

```typescript
interface InngestFunctionConfig {
  /**
   * Unique identifier for the function
   * Must be unique across your application
   */
  id: string;

  /**
   * Human-readable name for the function
   * Used in the Inngest dashboard
   */
  name?: string;

  /**
   * Array of triggers that will invoke this function
   * Can include event triggers and cron triggers
   */
  triggers: InngestTrigger[];

  /**
   * Concurrency configuration
   * Controls how many instances can run simultaneously
   */
  concurrency?: number | ConcurrencyConfig;

  /**
   * Rate limiting configuration
   * Controls how frequently the function can be invoked
   */
  rateLimit?: RateLimit;

  /**
   * Number of retries on failure
   * @default 3
   */
  retries?: number;

  /**
   * Timeout in milliseconds
   * @default 30000
   */
  timeout?: number;
}
```

### InngestEvent<T = any>

Interface for Inngest events.

```typescript
interface InngestEvent<T = any> {
  /**
   * Event name/type
   * Should follow a consistent naming convention like 'user.created'
   */
  name: string;

  /**
   * Event payload data
   * Type T allows for type-safe event data
   */
  data: T;

  /**
   * Optional unique event identifier
   * Auto-generated if not provided
   */
  id?: string;

  /**
   * Event timestamp in milliseconds
   * Auto-generated if not provided
   */
  ts?: number;

  /**
   * User context associated with the event
   */
  user?: {
    id: string;
    [key: string]: any;
  };

  /**
   * Event schema version
   * @default '2022-04-21'
   */
  v?: string;
}
```

### InngestFunctionContext<T = any>

Context object passed to Inngest functions during execution.

```typescript
interface InngestFunctionContext<T = any> {
  /**
   * The event that triggered this function
   */
  event: InngestEvent<T>;

  /**
   * Step tools for orchestrating function execution
   */
  step: StepTools;

  /**
   * Logger instance for the function
   */
  logger: {
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
  };

  /**
   * Unique function run ID
   */
  runId: string;

  /**
   * Current execution attempt number (starts at 1)
   */
  attempt: number;
}
```

### StepTools

Interface for step execution tools within functions.

```typescript
interface StepTools {
  /**
   * Run a step with automatic retries and error handling
   * Steps are memoized and will not re-run on retries
   */
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>;

  /**
   * Sleep for a specified duration
   * @param duration - Duration string (e.g., '5m', '1h') or milliseconds
   */
  sleep(duration: string | number): Promise<void>;

  /**
   * Wait for an external event
   * @param event - Event name to wait for
   * @param options - Wait options including timeout and conditions
   */
  waitForEvent(
    event: string,
    options?: { 
      timeout?: string | number; 
      if?: string;
    }
  ): Promise<InngestEvent>;

  /**
   * Send an event from within a function
   * @param event - Single event or array of events to send
   */
  sendEvent(event: InngestEvent | InngestEvent[]): Promise<void>;

  /**
   * Invoke another function
   * @param functionId - ID of the function to invoke
   * @param data - Data to pass to the function
   */
  invoke<T>(functionId: string, data?: any): Promise<T>;
}
```

## Configuration Interfaces

### RetryConfig

Configuration for retry behavior.

```typescript
interface RetryConfig {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts: number;

  /**
   * Initial delay between retries in milliseconds
   * @default 1000
   */
  initialDelay: number;

  /**
   * Maximum delay between retries in milliseconds
   * @default 30000
   */
  maxDelay?: number;

  /**
   * Backoff strategy for retry delays
   * @default 'exponential'
   */
  backoff?: 'exponential' | 'linear' | 'fixed';

  /**
   * Backoff multiplier for exponential backoff
   * @default 2
   */
  backoffMultiplier?: number;
}
```

### ConcurrencyConfig

Configuration for function concurrency limits.

```typescript
interface ConcurrencyConfig {
  /**
   * Maximum number of concurrent executions
   */
  limit: number;

  /**
   * Optional key for concurrency limiting
   * Defaults to function ID if not specified
   */
  key?: string;
}
```

### RateLimit

Configuration for rate limiting function executions.

```typescript
interface RateLimit {
  /**
   * Maximum number of function executions per period
   */
  limit: number;

  /**
   * Time period for rate limiting
   * Examples: '1m', '5m', '1h', '1d'
   */
  period: string;

  /**
   * Optional key for rate limiting
   * Defaults to function ID if not specified
   */
  key?: string;
}
```

### DevelopmentModeConfig

Configuration for development mode features.

```typescript
interface DevelopmentModeConfig {
  /**
   * Enable development mode
   */
  enabled: boolean;

  /**
   * Disable webhook signature verification
   * Should only be true in development environments
   * @default false
   */
  disableSignatureVerification?: boolean;
}
```

## Trigger Interfaces

### EventTrigger

Configuration for event-based triggers.

```typescript
interface EventTrigger {
  /**
   * Event name to trigger on
   * Supports exact matches and patterns
   */
  event: string;

  /**
   * Optional condition expression
   * Uses CEL (Common Expression Language) syntax
   * @example "event.data.userId == '123'"
   */
  if?: string;
}
```

### CronTrigger

Configuration for cron-based triggers.

```typescript
interface CronTrigger {
  /**
   * Cron expression for scheduling
   * Supports standard cron syntax
   * @example "0 9 * * *" // Daily at 9 AM
   */
  cron: string;
}
```

## Type Definitions

### InngestEnvironment

Supported environment types.

```typescript
type InngestEnvironment = 'production' | 'development' | 'test';
```

### InngestTrigger

Union type for all trigger types.

```typescript
type InngestTrigger = EventTrigger | CronTrigger;
```

### InngestFunctionHandler

Type for function handler methods.

```typescript
type InngestFunctionHandler<T = any> = (
  context: InngestFunctionContext<T>
) => Promise<any>;
```

### EventTypes<T>

Utility type for defining type-safe event schemas.

```typescript
type EventTypes<T extends Record<string, any>> = {
  [K in keyof T]: InngestEvent<T[K]>;
};
```

**Usage Example:**
```typescript
type MyAppEvents = EventTypes<{
  'user.created': { userId: string; email: string; name: string };
  'order.placed': { orderId: string; userId: string; total: number };
  'email.sent': { emailId: string; recipient: string; template: string };
}>;

// Now you can use:
// MyAppEvents['user.created'] for type-safe user creation events
// MyAppEvents['order.placed'] for type-safe order events
```

## Metadata Interfaces

### InngestFunctionMetadata

Internal metadata for registered functions.

```typescript
interface InngestFunctionMetadata {
  /**
   * The target class instance
   */
  target: any;

  /**
   * The method name decorated with @InngestFunction
   */
  propertyKey: string;

  /**
   * Function configuration
   */
  config: InngestFunctionConfig;

  /**
   * The actual handler function
   */
  handler: InngestFunctionHandler;
}
```

### ExecutionContext

Context for function execution within the NestJS environment.

```typescript
interface ExecutionContext {
  /**
   * Unique execution ID
   */
  executionId: string;

  /**
   * Function metadata
   */
  functionMetadata: InngestFunctionMetadata;

  /**
   * Inngest function context
   */
  inngestContext: InngestFunctionContext;

  /**
   * NestJS context ID for scoped providers
   */
  contextId: any;

  /**
   * Start time of execution
   */
  startTime: Date;

  /**
   * Execution attempt number
   */
  attempt: number;
}
```

## Testing Interfaces

### InngestTestingConfig

Configuration for testing modules.

```typescript
interface InngestTestingConfig {
  /**
   * Whether to use real Inngest services or mocks
   * @default false
   */
  useRealServices?: boolean;

  /**
   * Mock configuration overrides
   */
  mockConfig?: Partial<MergedInngestConfig>;

  /**
   * Custom mock providers
   */
  customMocks?: Provider[];

  /**
   * Whether to include the webhook controller in tests
   * @default true
   */
  includeController?: boolean;

  /**
   * Event registry for type-safe testing
   */
  eventRegistry?: Record<string, any>;
}
```

### MockExecutionContext

Mock execution context for testing.

```typescript
interface MockExecutionContext {
  functionId: string;
  runId: string;
  event: any;
  attempt: number;
  step: {
    run: jest.Mock;
    sleep: jest.Mock;
    sleepUntil: jest.Mock;
    waitForEvent: jest.Mock;
    invoke: jest.Mock;
    sendEvent: jest.Mock;
  };
  env: NodeJS.ProcessEnv;
}
```

## Factory Interfaces

### InngestConfigFactory

Factory interface for creating Inngest configuration.

```typescript
interface InngestConfigFactory {
  createInngestConfig(): Promise<InngestModuleConfig> | InngestModuleConfig;
}
```

### InngestModuleConfigFactory

Alternative factory interface for module configuration.

```typescript
interface InngestModuleConfigFactory {
  createInngestConfig(): Promise<InngestModuleConfig> | InngestModuleConfig;
}
```

## Validation Interfaces

### ConfigValidationResult

Result of configuration validation.

```typescript
interface ConfigValidationResult {
  /**
   * Whether the configuration is valid
   */
  isValid: boolean;

  /**
   * Validation errors (if any)
   */
  errors: Error[];

  /**
   * Configuration warnings (if any)
   */
  warnings: string[];
}
```

### MergedInngestConfig

Fully validated and merged configuration.

```typescript
interface MergedInngestConfig extends Required<InngestModuleConfig> {
  // All properties are required after validation and merging with defaults
}
```

## Status Interfaces

### VerificationStatus

Status of webhook signature verification.

```typescript
interface VerificationStatus {
  /**
   * Whether verification is enabled
   */
  enabled: boolean;

  /**
   * Whether a signing key is configured
   */
  hasSigningKey: boolean;

  /**
   * Signature algorithm being used
   */
  algorithm: string;

  /**
   * Tolerance in seconds for timestamp validation
   */
  toleranceSeconds: number;
}
```

### HealthStatus

Health status of the Inngest integration.

```typescript
interface HealthStatus {
  /**
   * Overall health status
   */
  status: 'healthy' | 'degraded' | 'unhealthy';

  /**
   * Webhook endpoint path
   */
  endpoint: string;

  /**
   * Number of registered functions
   */
  registeredFunctions: number;

  /**
   * Signature verification status
   */
  signatureVerification: VerificationStatus;
}
```

## Utility Types

### DeepPartial<T>

Makes all properties of T optional recursively.

```typescript
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
```

### EventData<T>

Extracts the data type from an event type.

```typescript
type EventData<T> = T extends InngestEvent<infer U> ? U : never;
```

### FunctionResult<T>

Type for function return values.

```typescript
type FunctionResult<T = any> = Promise<T> | T;
```

## Usage Examples

### Defining Type-Safe Events

```typescript
// Define your event schema
type UserEvents = EventTypes<{
  'user.registered': {
    userId: string;
    email: string;
    name: string;
    plan: 'free' | 'pro' | 'enterprise';
  };
  'user.upgraded': {
    userId: string;
    fromPlan: string;
    toPlan: string;
    upgradeDate: string;
  };
}>;

// Use in function definitions
@TypedInngestFunction<UserEvents>({
  id: 'handle-user-registration',
  triggers: [{ event: 'user.registered' }],
})
async handleUserRegistration(
  event: UserEvents['user.registered'],
  context: InngestFunctionContext
) {
  // event.data is now typed with full IntelliSense support
  const { userId, email, name, plan } = event.data;
  // TypeScript will ensure these properties exist and have correct types
}
```

### Complex Configuration

```typescript
const complexConfig: InngestModuleConfig = {
  appId: 'my-complex-app',
  signingKey: process.env.INNGEST_SIGNING_KEY,
  eventKey: process.env.INNGEST_EVENT_KEY,
  
  // Advanced retry configuration
  retry: {
    maxAttempts: 5,
    backoff: 'exponential',
    initialDelay: 500,
    maxDelay: 60000,
    backoffMultiplier: 2.5,
  },
  
  // Performance tuning
  timeout: 45000,
  maxBatchSize: 50,
  
  // Environment-specific settings
  env: process.env.NODE_ENV as InngestEnvironment,
  development: {
    enabled: process.env.NODE_ENV === 'development',
    disableSignatureVerification: process.env.NODE_ENV !== 'production',
  },
  
  // Enhanced logging
  logger: true,
  strict: process.env.NODE_ENV === 'production',
};
```

### Testing with Types

```typescript
describe('User Service', () => {
  let service: UserService;
  
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        InngestTestingModule.forTest({
          useRealServices: false,
          mockConfig: {
            appId: 'test-app',
            signingKey: 'test-key',
          } as Partial<MergedInngestConfig>,
        }),
      ],
      providers: [UserService],
    }).compile();
    
    service = module.get<UserService>(UserService);
  });
  
  it('should handle typed events', async () => {
    const event: UserEvents['user.registered'] = {
      name: 'user.registered',
      data: {
        userId: '123',
        email: 'test@example.com',
        name: 'Test User',
        plan: 'free',
      },
    };
    
    const context = InngestTestUtils.createMockExecutionContext(
      'handle-user-registration',
      'run-123',
      event
    );
    
    const result = await service.handleUserRegistration(event, context);
    expect(result).toBeDefined();
  });
});
```