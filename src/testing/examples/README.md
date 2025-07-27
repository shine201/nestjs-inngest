# Inngest Testing Examples

This directory contains comprehensive examples of how to test Inngest functions and services using the `InngestTestingModule`.

## Overview

The `InngestTestingModule` provides several testing modes:

- **Unit Testing** - Uses mock services for isolated testing
- **Controller Testing** - Tests webhook handling with mocks
- **Integration Testing** - Uses real services with test configuration
- **Service Testing** - Tests services individually with real implementations

## Quick Start

### Basic Unit Test

```typescript
import { Test } from '@nestjs/testing';
import { InngestTestingModule, InngestTestUtils } from '../inngest-testing.module';
import { MockInngestService } from '../mocks';
import { InngestService } from '../../services/inngest.service';

describe('My Inngest Function', () => {
  let module: TestingModule;
  let mockInngestService: MockInngestService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [InngestTestingModule.forUnitTest()],
      providers: [MyService],
    }).compile();

    mockInngestService = module.get<MockInngestService>(InngestService);
  });

  it('should send event', async () => {
    const event = InngestTestUtils.createTestEvent('user.created', {
      userId: '123',
      email: 'test@example.com',
    });

    await mockInngestService.send(event);

    mockInngestService.expectEventSent('user.created');
    expect(mockInngestService.getSentEvents()).toHaveLength(1);
  });
});
```

### Controller Testing

```typescript
import { InngestTestingModule } from '../inngest-testing.module';
import { InngestController } from '../../controllers/inngest.controller';
import { MockSignatureVerificationService } from '../mocks';

describe('InngestController', () => {
  let controller: InngestController;
  let mockSignatureVerification: MockSignatureVerificationService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [InngestTestingModule.forControllerTest()],
    }).compile();

    controller = module.get<InngestController>(InngestController);
    mockSignatureVerification = module.get<MockSignatureVerificationService>(SignatureVerificationService);
  });

  it('should handle webhook requests', async () => {
    // Configure mocks
    mockSignatureVerification.mockVerificationSuccess();

    // Create test data
    const webhookRequest = InngestTestUtils.createTestWebhookRequest('my-function', testEvent);
    const mockRequest = MockSignatureVerificationService.createMockRequestWithSignature(webhookRequest);
    const mockResponse = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    // Execute
    await controller.handlePost(mockRequest, mockResponse, mockRequest.headers, webhookRequest);

    // Assert
    expect(mockResponse.status).toHaveBeenCalledWith(200);
  });
});
```

## Testing Patterns

### 1. Testing Function Execution

```typescript
class MyService {
  @InngestFunction({
    id: 'process-user',
    trigger: { event: 'user.created' },
  })
  async processUser(event: any, { step }: any) {
    const result = await step.run('validate', async () => {
      return { valid: true, userId: event.data.userId };
    });

    await step.sendEvent('send-notification', {
      name: 'notification.send',
      data: { userId: event.data.userId },
    });

    return result;
  }
}

// Test
it('should process user correctly', async () => {
  const service = module.get<MyService>(MyService);
  const context = await mockExecutionContext.createExecutionContext(
    { id: 'process-user', handler: service.processUser },
    testEvent,
    'run_123'
  );

  // Configure step behavior
  context.step.runMock.mockResolvedValue({ valid: true, userId: '123' });

  const result = await service.processUser(testEvent, context);

  // Assert step calls
  expect(context.step.runMock).toHaveBeenCalledWith('validate', expect.any(Function));
  expect(context.step.sendEventMock).toHaveBeenCalledWith('send-notification', {
    name: 'notification.send',
    data: { userId: '123' },
  });

  expect(result).toEqual({ valid: true, userId: '123' });
});
```

### 2. Testing Error Scenarios

```typescript
it('should handle step failures', async () => {
  context.step.runMock.mockRejectedValue(new Error('Validation failed'));

  await expect(service.processUser(testEvent, context)).rejects.toThrow('Validation failed');
});

it('should handle send failures', async () => {
  mockInngestService.mockSendError(new Error('Network error'));

  await expect(mockInngestService.send(testEvent)).rejects.toThrow('Network error');
  mockInngestService.expectNoEventsSent();
});
```

### 3. Testing Async Operations

```typescript
it('should handle delayed operations', async () => {
  // Configure execution delay
  mockExecutionContext.mockExecutionDelay(100, { processed: true });

  const start = Date.now();
  const result = await mockExecutionContext.executeFunction(context);
  const elapsed = Date.now() - start;

  expect(elapsed).toBeGreaterThanOrEqual(95);
  expect(result).toEqual({ processed: true });
});
```

### 4. Integration Testing

```typescript
describe('Integration Tests', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await createInngestTestingModule({
      useRealServices: true,
      mockConfig: {
        appId: 'test-app',
        signingKey: 'test-key',
        isDev: true,
      },
    });
  });

  it('should work end-to-end', async () => {
    const inngestService = module.get<InngestService>(InngestService);
    // Test with real service but test configuration
    // This won't actually send to Inngest in test mode
  });
});
```

## Testing Utilities

### InngestTestUtils

The `InngestTestUtils` class provides helpful utilities:

```typescript
// Create test events
const event = InngestTestUtils.createTestEvent('user.created', {
  userId: '123',
  email: 'test@example.com',
});

// Create webhook requests
const webhookRequest = InngestTestUtils.createTestWebhookRequest('my-function', event);

// Create function metadata
const metadata = InngestTestUtils.createTestFunctionMetadata('my-func', {
  trigger: { event: 'test.event' },
});

// Wait for async operations
await InngestTestUtils.wait(100);

// Create mock execution context
const context = InngestTestUtils.createMockExecutionContext('func-id', 'run-id', event);
```

### Mock Assertions

Each mock service provides assertion methods:

```typescript
// InngestService assertions
mockInngestService.expectEventSent('user.created');
mockInngestService.expectEventCount(5);
mockInngestService.expectSendCalledTimes(3);

// ExecutionContextService assertions
mockExecutionContext.expectContextCreated('function-id');
mockExecutionContext.expectFunctionExecuted(2);
mockExecutionContext.expectStepCalled('run-id', 'runMock', 'step-id', expect.any(Function));

// SignatureVerificationService assertions
mockSignatureVerification.expectVerificationAttempted();
mockSignatureVerification.expectConfigValidated();
```

## Best Practices

1. **Use appropriate testing mode** - Unit tests for isolated logic, integration tests for full workflows
2. **Reset mocks between tests** - Use `beforeEach` to ensure clean state
3. **Test error scenarios** - Configure mocks to throw errors and test error handling
4. **Use type-safe events** - Leverage TypeScript for better test reliability
5. **Test step interactions** - Verify that steps are called with correct parameters
6. **Mock external dependencies** - Use custom mock providers for external services

## Advanced Scenarios

### Custom Mock Providers

```typescript
const customMockProvider = {
  provide: 'ExternalService',
  useValue: {
    getData: jest.fn().mockResolvedValue({ data: 'test' }),
  },
};

const module = await Test.createTestingModule({
  imports: [InngestTestingModule.forTest({
    customMocks: [customMockProvider],
  })],
}).compile();
```

### Testing with Real Configuration

```typescript
const module = await createInngestTestingModule({
  useRealServices: true,
  mockConfig: {
    appId: process.env.TEST_APP_ID,
    signingKey: process.env.TEST_SIGNING_KEY,
    endpoint: '/test-webhook',
  },
});
```

### Event Registry for Type Safety

```typescript
interface TestEventRegistry {
  'user.created': { userId: string; email: string };
  'user.updated': { userId: string; changes: Record<string, any> };
}

const module = await createInngestTestingModule({
  eventRegistry: {} as TestEventRegistry,
});
```

This testing framework provides comprehensive tools for testing all aspects of your Inngest integration while maintaining type safety and providing clear, readable test code.