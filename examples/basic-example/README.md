# Basic NestJS Inngest Example

This example demonstrates the fundamental concepts of using nestjs-inngest in a NestJS application. It includes a simple user registration workflow with email notifications.

## Features Demonstrated

- ✅ Basic module configuration
- ✅ Function registration with decorators
- ✅ Event sending and handling
- ✅ Step functions for reliable workflows
- ✅ Error handling and retries
- ✅ Type-safe events
- ✅ Testing with mock services

## Architecture

```
src/
├── app.module.ts           # Main application module
├── main.ts                 # Application bootstrap
├── events/
│   └── user.events.ts      # Type-safe event definitions
├── services/
│   ├── user.service.ts     # User management service
│   ├── email.service.ts    # Email service
│   └── analytics.service.ts # Analytics tracking
└── controllers/
    └── user.controller.ts  # REST API endpoints
```

## User Registration Workflow

1. **User Registration** (`user.controller.ts`)
   - REST endpoint receives registration request
   - Validates user data
   - Saves user to database
   - Triggers `user.registered` event

2. **Welcome Email** (`user.service.ts`)
   - Listens for `user.registered` event
   - Sends welcome email
   - Tracks email delivery

3. **Analytics Tracking** (`analytics.service.ts`)
   - Listens for `user.registered` event
   - Records user registration metrics
   - Updates analytics dashboard

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (for local development)

## Setup

### 1. Install Dependencies

```bash
cd examples/basic-example
npm install
```

### 2. Environment Configuration

Create a `.env` file:

```bash
# Application
PORT=3000
NODE_ENV=development

# Inngest Configuration
INNGEST_APP_ID=basic-example-app
INNGEST_SIGNING_KEY=your-signing-key-here
INNGEST_EVENT_KEY=your-event-key-here

# Database (optional - using in-memory for this example)
DATABASE_URL=postgres://localhost:5432/basic_example

# Email Service (optional - using console logging for this example)
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
```

### 3. Start the Application

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The application will start on `http://localhost:3000`.

## Usage

### Register a New User

```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "name": "John Doe",
    "password": "securepassword123"
  }'
```

This will:
1. Create a new user
2. Trigger the `user.registered` event
3. Send a welcome email (logged to console)
4. Track registration analytics

### View Inngest Functions

```bash
curl http://localhost:3000/api/inngest
```

This returns the list of registered Inngest functions.

## Code Examples

### Event Definitions

```typescript
// src/events/user.events.ts
import { EventTypes } from 'nestjs-inngest';

export type UserEvents = EventTypes<{
  'user.registered': {
    userId: string;
    email: string;
    name: string;
    registrationSource: 'web' | 'mobile' | 'api';
    timestamp: string;
  };
  
  'user.email.sent': {
    userId: string;
    emailType: 'welcome' | 'verification' | 'notification';
    emailId: string;
    timestamp: string;
  };
}>;
```

### Function Definition

```typescript
// src/services/user.service.ts
import { Injectable } from '@nestjs/common';
import { TypedInngestFunction } from 'nestjs-inngest';
import { UserEvents } from '../events/user.events';

@Injectable()
export class UserService {
  @TypedInngestFunction<UserEvents>({
    id: 'send-welcome-email',
    name: 'Send Welcome Email',
    triggers: [{ event: 'user.registered' }],
    retries: 3,
  })
  async sendWelcomeEmail(
    event: UserEvents['user.registered'],
    { step }: any
  ) {
    const { userId, email, name } = event.data;

    // Send welcome email
    const emailResult = await step.run('send-email', async () => {
      return this.emailService.sendWelcomeEmail(email, { name });
    });

    // Track email sent
    await step.run('track-email', async () => {
      await step.sendEvent({
        name: 'user.email.sent',
        data: {
          userId,
          emailType: 'welcome',
          emailId: emailResult.messageId,
          timestamp: new Date().toISOString(),
        },
      });
    });

    return { success: true, emailId: emailResult.messageId };
  }
}
```

## Testing

### Unit Tests

```bash
npm run test
```

### Integration Tests

```bash
npm run test:e2e
```

### Test a Function Directly

```typescript
// src/services/user.service.spec.ts
import { Test } from '@nestjs/testing';
import { InngestTestingModule, InngestTestUtils } from 'nestjs-inngest';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [InngestTestingModule.forTest()],
      providers: [UserService],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should send welcome email', async () => {
    const event = InngestTestUtils.createTestEvent('user.registered', {
      userId: '123',
      email: 'test@example.com',
      name: 'Test User',
      registrationSource: 'api',
      timestamp: new Date().toISOString(),
    });

    const mockContext = InngestTestUtils.createMockExecutionContext(
      'send-welcome-email',
      'run-123',
      event
    );

    const result = await service.sendWelcomeEmail(event, mockContext);
    
    expect(result.success).toBe(true);
    expect(mockContext.step.run).toHaveBeenCalledTimes(2);
  });
});
```

## Key Concepts Demonstrated

### 1. Type Safety
- Event types are defined once and reused
- TypeScript provides compile-time validation
- IntelliSense support for event data

### 2. Reliable Processing
- Step functions ensure operations are retried on failure
- Events are processed exactly once
- State is preserved across retries

### 3. Decoupled Architecture
- Services communicate through events
- Easy to add new event handlers
- Supports microservices architecture

### 4. Testing
- Mock services for unit testing
- Integration testing with real Inngest
- Test utilities for common scenarios

## Next Steps

1. **Explore the E-commerce Example** - See more complex workflows
2. **Add More Functions** - Try adding user verification, password reset
3. **Add Database Integration** - Replace in-memory storage with real database
4. **Add More Events** - Extend the event schema for more use cases
5. **Deploy to Production** - Use real Inngest keys and configure webhooks

## Troubleshooting

### Functions Not Executing

1. Check that events are being sent:
   ```bash
   curl -X POST http://localhost:3000/users -H "Content-Type: application/json" -d '{"email":"test@example.com","name":"Test"}'
   ```

2. Verify function registration:
   ```bash
   curl http://localhost:3000/api/inngest
   ```

3. Check application logs for errors

### Webhook Issues

1. Ensure Inngest webhook URL points to: `http://localhost:3000/api/inngest`
2. For local development, use ngrok or similar tunneling service
3. Check that signing key matches your Inngest dashboard

### Type Errors

1. Ensure event data matches the defined types
2. Use `TypedInngestFunction` for type safety
3. Check that all required event properties are included

## Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [Inngest Documentation](https://www.inngest.com/docs)
- [nestjs-inngest API Reference](../../docs/api-reference.md)
- [Usage Guide](../../docs/usage-guide.md)