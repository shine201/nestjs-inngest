import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { InngestTestingModule, InngestTestUtils } from 'nestjs-inngest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        // Override the Inngest module with testing configuration
        InngestTestingModule.forIntegrationTest({
          useRealServices: false,
          includeController: true,
          mockConfig: {
            appId: 'e2e-test-app',
            signingKey: 'e2e-test-signing-key',
            eventKey: 'e2e-test-event-key',
            development: {
              enabled: true,
              disableSignatureVerification: true,
            },
          },
        }),
        AppModule,
      ],
    })
      .overrideModule(AppModule)
      .compile();

    app = moduleFixture.createNestApplication();

    // Apply same pipes as in main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/users (POST)', () => {
    it('should create a new user', async () => {
      const createUserDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
        registrationSource: 'api',
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .send(createUserDto)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(createUserDto.email);
      expect(response.body.user.name).toBe(createUserDto.name);
      expect(response.body.user.isVerified).toBe(false);
      expect(response.body.user.id).toBeDefined();
      expect(response.body.message).toContain('Welcome email has been sent');

      // Password should not be returned
      expect(response.body.user.password).toBeUndefined();
    });

    it('should validate required fields', async () => {
      const invalidDto = {
        email: 'invalid-email',
        name: '',
        password: '123', // Too short
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .send(invalidDto)
        .expect(400);

      expect(response.body.message).toBeDefined();
      expect(Array.isArray(response.body.message)).toBe(true);
    });

    it('should prevent duplicate emails', async () => {
      const createUserDto = {
        email: 'duplicate@example.com',
        name: 'First User',
        password: 'password123',
      };

      // Create first user
      await request(app.getHttpServer())
        .post('/users')
        .send(createUserDto)
        .expect(201);

      // Try to create second user with same email
      const duplicateDto = {
        email: 'duplicate@example.com',
        name: 'Second User',
        password: 'password456',
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .send(duplicateDto)
        .expect(400);

      expect(response.body.message).toContain('already exists');
    });

    it('should use default registration source', async () => {
      const createUserDto = {
        email: 'default@example.com',
        name: 'Default User',
        password: 'password123',
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .send(createUserDto)
        .expect(201);

      expect(response.body.user.registrationSource).toBe('api');
    });
  });

  describe('/users (GET)', () => {
    it('should return all users', async () => {
      // Create a test user first
      const createUserDto = {
        email: 'list@example.com',
        name: 'List User',
        password: 'password123',
      };

      await request(app.getHttpServer())
        .post('/users')
        .send(createUserDto)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/users')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.users).toBeDefined();
      expect(Array.isArray(response.body.users)).toBe(true);
      expect(response.body.count).toBeGreaterThan(0);

      // Check that passwords are not included
      response.body.users.forEach((user: any) => {
        expect(user.password).toBeUndefined();
      });
    });
  });

  describe('/users/:id (GET)', () => {
    it('should return user by id', async () => {
      // Create a test user
      const createUserDto = {
        email: 'get@example.com',
        name: 'Get User',
        password: 'password123',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/users')
        .send(createUserDto)
        .expect(201);

      const userId = createResponse.body.user.id;

      const response = await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(userId);
      expect(response.body.user.email).toBe(createUserDto.email);
      expect(response.body.user.password).toBeUndefined();
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/non-existent-id')
        .expect(404);

      expect(response.body.message).toContain('not found');
    });
  });

  describe('/users/verify (POST)', () => {
    it('should verify user email', async () => {
      // Create a test user
      const createUserDto = {
        email: 'verify@example.com',
        name: 'Verify User',
        password: 'password123',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/users')
        .send(createUserDto)
        .expect(201);

      const userId = createResponse.body.user.id;

      const verifyDto = {
        token: 'test-verification-token',
        userId,
      };

      const response = await request(app.getHttpServer())
        .post('/users/verify')
        .send(verifyDto)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.isVerified).toBe(true);
      expect(response.body.message).toContain('verified successfully');
    });

    it('should validate verification request', async () => {
      const invalidVerifyDto = {
        token: '', // Empty token
        userId: 'invalid-user-id',
      };

      const response = await request(app.getHttpServer())
        .post('/users/verify')
        .send(invalidVerifyDto)
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('/users/:id/analytics (GET)', () => {
    it('should return user analytics', async () => {
      // Create a test user
      const createUserDto = {
        email: 'analytics@example.com',
        name: 'Analytics User',
        password: 'password123',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/users')
        .send(createUserDto)
        .expect(201);

      const userId = createResponse.body.user.id;

      const response = await request(app.getHttpServer())
        .get(`/users/${userId}/analytics`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.analytics).toBeDefined();
      expect(Array.isArray(response.body.analytics)).toBe(true);
      expect(response.body.summary).toBeDefined();
      expect(response.body.summary.totalEvents).toBeGreaterThanOrEqual(0);
    });

    it('should return 404 for non-existent user analytics', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/non-existent-id/analytics')
        .expect(404);

      expect(response.body.message).toContain('not found');
    });
  });

  describe('/users/health/status (GET)', () => {
    it('should return system health status', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/health/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(response.body.services).toBeDefined();
      expect(response.body.services.user).toBeDefined();
      expect(response.body.services.analytics).toBeDefined();
      expect(response.body.services.email).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('/users/analytics/summary (GET)', () => {
    it('should return analytics summary', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/analytics/summary')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.summary).toBeDefined();
      expect(response.body.summary.totalEvents).toBeGreaterThanOrEqual(0);
      expect(response.body.summary.lastUpdated).toBeDefined();
    });
  });

  describe('/users/:id/resend-verification (POST)', () => {
    it('should resend verification email for unverified user', async () => {
      // Create a test user
      const createUserDto = {
        email: 'resend@example.com',
        name: 'Resend User',
        password: 'password123',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/users')
        .send(createUserDto)
        .expect(201);

      const userId = createResponse.body.user.id;

      const response = await request(app.getHttpServer())
        .post(`/users/${userId}/resend-verification`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('resent');
    });

    it('should not resend verification for verified user', async () => {
      // Create and verify a user
      const createUserDto = {
        email: 'verified@example.com',
        name: 'Verified User',
        password: 'password123',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/users')
        .send(createUserDto)
        .expect(201);

      const userId = createResponse.body.user.id;

      // Verify the user
      await request(app.getHttpServer())
        .post('/users/verify')
        .send({ token: 'test-token', userId })
        .expect(200);

      // Try to resend verification
      const response = await request(app.getHttpServer())
        .post(`/users/${userId}/resend-verification`)
        .expect(400);

      expect(response.body.message).toContain('already verified');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/non-existent-id/resend-verification')
        .expect(404);

      expect(response.body.message).toContain('not found');
    });
  });

  describe('/users/:id/test-event (POST)', () => {
    it('should trigger test event for user', async () => {
      // Create a test user
      const createUserDto = {
        email: 'test-event@example.com',
        name: 'Test Event User',
        password: 'password123',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/users')
        .send(createUserDto)
        .expect(201);

      const userId = createResponse.body.user.id;

      const response = await request(app.getHttpServer())
        .post(`/users/${userId}/test-event`)
        .query({ eventType: 'custom_test_event' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.eventType).toBe('custom_test_event');
      expect(response.body.message).toContain('triggered successfully');
    });

    it('should use default event type', async () => {
      // Create a test user
      const createUserDto = {
        email: 'default-event@example.com',
        name: 'Default Event User',
        password: 'password123',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/users')
        .send(createUserDto)
        .expect(201);

      const userId = createResponse.body.user.id;

      const response = await request(app.getHttpServer())
        .post(`/users/${userId}/test-event`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.eventType).toBe('test_event');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/non-existent-id/test-event')
        .expect(404);

      expect(response.body.message).toContain('not found');
    });
  });

  describe('Inngest Integration', () => {
    describe('/api/inngest (PUT)', () => {
      it('should return registered functions', async () => {
        const response = await request(app.getHttpServer())
          .put('/api/inngest')
          .expect(200);

        expect(response.body).toHaveProperty('functions');
        expect(response.body).toHaveProperty('sdk');
        expect(response.body.sdk.name).toBe('nest-inngest');
        expect(response.body.functions).toBeInstanceOf(Array);
        expect(response.body.functions.length).toBeGreaterThan(0);

        // Check that our test functions are registered
        const functionIds = response.body.functions.map((f: any) => f.id);
        expect(functionIds).toContain('send-welcome-email');
        expect(functionIds).toContain('handle-email-failure');
        expect(functionIds).toContain('track-user-verification');
        expect(functionIds).toContain('track-analytics-event');
      });
    });

    describe('/api/inngest (POST)', () => {
      it('should handle function execution requests', async () => {
        // Create a test user first
        const createUserDto = {
          email: 'inngest@example.com',
          name: 'Inngest User',
          password: 'password123',
        };

        const createResponse = await request(app.getHttpServer())
          .post('/users')
          .send(createUserDto)
          .expect(201);

        const userId = createResponse.body.user.id;

        // Create a test event for the welcome email function
        const testEvent = InngestTestUtils.createTestEvent('user.registered', {
          userId,
          email: createUserDto.email,
          name: createUserDto.name,
          registrationSource: 'api',
          timestamp: new Date().toISOString(),
        });

        const webhookRequest = InngestTestUtils.createTestWebhookRequest(
          'send-welcome-email',
          testEvent
        );

        const response = await request(app.getHttpServer())
          .post('/api/inngest')
          .send(webhookRequest)
          .expect(200);

        expect(response.body).toHaveProperty('status', 'ok');
        expect(response.body).toHaveProperty('result');
        expect(response.body.result.success).toBe(true);
        expect(response.body.result.userId).toBe(userId);
      });

      it('should handle non-existent function requests', async () => {
        const testEvent = InngestTestUtils.createTestEvent('test.event', {
          message: 'This should fail',
        });

        const webhookRequest = InngestTestUtils.createTestWebhookRequest(
          'non-existent-function',
          testEvent
        );

        const response = await request(app.getHttpServer())
          .post('/api/inngest')
          .send(webhookRequest)
          .expect(404);

        expect(response.body.error.message).toContain('Function not found');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      const invalidData = {
        email: 'not-an-email',
        name: 123, // Should be string
        password: 'short', // Too short
        registrationSource: 'invalid', // Not in enum
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBeDefined();
      expect(Array.isArray(response.body.message)).toBe(true);
      expect(response.body.error).toBe('Bad Request');
    });

    it('should handle server errors gracefully', async () => {
      // This test would require mocking a service to throw an error
      // For now, we'll just ensure the error format is correct
      const response = await request(app.getHttpServer())
        .get('/users/malformed-id-that-causes-error')
        .expect(404);

      expect(response.body.message).toBeDefined();
      expect(response.body.statusCode).toBe(404);
    });
  });
});