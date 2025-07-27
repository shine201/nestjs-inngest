import { Test, TestingModule } from '@nestjs/testing';
import { InngestTestingModule, InngestTestUtils, InngestService } from 'nestjs-inngest';
import { UserService } from './user.service';
import { EmailService } from './email.service';

describe('UserService', () => {
  let service: UserService;
  let emailService: EmailService;
  let inngestService: InngestService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        InngestTestingModule.forTest({
          useRealServices: false,
          mockConfig: {
            appId: 'test-app',
            signingKey: 'test-signing-key',
            eventKey: 'test-event-key',
          },
        }),
      ],
      providers: [
        UserService,
        {
          provide: EmailService,
          useValue: {
            sendWelcomeEmail: jest.fn(),
            sendVerificationEmail: jest.fn(),
            healthCheck: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    emailService = module.get<EmailService>(EmailService);
    inngestService = module.get<InngestService>(InngestService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a user and send events', async () => {
      const createUserDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
        registrationSource: 'api' as const,
      };

      const user = await service.createUser(createUserDto);

      expect(user).toBeDefined();
      expect(user.email).toBe(createUserDto.email);
      expect(user.name).toBe(createUserDto.name);
      expect(user.isVerified).toBe(false);
      expect(user.registrationSource).toBe('api');
      expect(user.id).toBeDefined();
      expect(user.createdAt).toBeDefined();
    });

    it('should create user with default registration source', async () => {
      const createUserDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      };

      const user = await service.createUser(createUserDto);

      expect(user.registrationSource).toBe('api');
    });
  });

  describe('getUserById', () => {
    it('should return user if exists', async () => {
      const createUserDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      };

      const createdUser = await service.createUser(createUserDto);
      const foundUser = await service.getUserById(createdUser.id);

      expect(foundUser).toEqual(createdUser);
    });

    it('should return null if user does not exist', async () => {
      const foundUser = await service.getUserById('non-existent-id');
      expect(foundUser).toBeNull();
    });
  });

  describe('getUserByEmail', () => {
    it('should return user if exists', async () => {
      const createUserDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      };

      const createdUser = await service.createUser(createUserDto);
      const foundUser = await service.getUserByEmail(createUserDto.email);

      expect(foundUser).toEqual(createdUser);
    });

    it('should return null if user does not exist', async () => {
      const foundUser = await service.getUserByEmail('non-existent@example.com');
      expect(foundUser).toBeNull();
    });
  });

  describe('verifyUser', () => {
    it('should verify user and update status', async () => {
      const createUserDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      };

      const user = await service.createUser(createUserDto);
      expect(user.isVerified).toBe(false);

      const verifiedUser = await service.verifyUser(user.id);

      expect(verifiedUser.isVerified).toBe(true);
      expect(verifiedUser.updatedAt).not.toEqual(user.updatedAt);
    });

    it('should throw error if user does not exist', async () => {
      await expect(service.verifyUser('non-existent-id')).rejects.toThrow(
        'User non-existent-id not found'
      );
    });
  });

  describe('getAllUsers', () => {
    it('should return empty array initially', async () => {
      const users = await service.getAllUsers();
      expect(users).toEqual([]);
    });

    it('should return all created users', async () => {
      const user1 = await service.createUser({
        email: 'user1@example.com',
        name: 'User 1',
        password: 'password123',
      });

      const user2 = await service.createUser({
        email: 'user2@example.com',
        name: 'User 2',
        password: 'password123',
      });

      const users = await service.getAllUsers();
      expect(users).toHaveLength(2);
      expect(users).toContainEqual(user1);
      expect(users).toContainEqual(user2);
    });
  });

  describe('Inngest Functions', () => {
    describe('sendWelcomeEmail', () => {
      it('should send welcome email successfully', async () => {
        // Create a user first
        const user = await service.createUser({
          email: 'test@example.com',
          name: 'Test User',
          password: 'password123',
        });

        // Create test event
        const event = InngestTestUtils.createTestEvent('user.registered', {
          userId: user.id,
          email: user.email,
          name: user.name,
          registrationSource: 'api',
          timestamp: new Date().toISOString(),
        });

        // Create mock execution context
        const mockContext = InngestTestUtils.createMockExecutionContext(
          'send-welcome-email',
          'run-123',
          event
        );

        // Mock email service responses
        const mockEmailResult = { messageId: 'email-123', success: true };
        const mockVerificationResult = { messageId: 'verification-123', success: true };

        // Setup step function mocks
        mockContext.step.run
          .mockResolvedValueOnce(user) // fetch-user-details
          .mockResolvedValueOnce(mockEmailResult) // send-welcome-email
          .mockResolvedValueOnce(undefined) // track-email-sent
          .mockResolvedValueOnce(mockVerificationResult); // send-verification-email

        mockContext.step.sendEvent.mockResolvedValue(undefined);

        // Mock email service methods
        jest.spyOn(emailService, 'sendWelcomeEmail').mockResolvedValue(mockEmailResult);
        jest.spyOn(emailService, 'sendVerificationEmail').mockResolvedValue(mockVerificationResult);

        // Execute the function
        const result = await service.sendWelcomeEmail(event, mockContext);

        // Assertions
        expect(result.success).toBe(true);
        expect(result.userId).toBe(user.id);
        expect(result.emailId).toBe(mockEmailResult.messageId);

        // Verify steps were called
        expect(mockContext.step.run).toHaveBeenCalledTimes(4);
        expect(mockContext.step.sendEvent).toHaveBeenCalledTimes(2);

        // Verify email service was called
        expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith(user.email, { name: user.name });
        expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
          user.email,
          expect.objectContaining({
            name: user.name,
            verificationToken: expect.any(String),
            verificationUrl: expect.stringContaining(user.id),
          })
        );
      });

      it('should handle user not found error', async () => {
        const event = InngestTestUtils.createTestEvent('user.registered', {
          userId: 'non-existent-user',
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

        // Mock user not found
        mockContext.step.run.mockRejectedValueOnce(new Error('User non-existent-user not found'));

        await expect(service.sendWelcomeEmail(event, mockContext)).rejects.toThrow(
          'User non-existent-user not found'
        );

        expect(mockContext.step.run).toHaveBeenCalledTimes(1);
      });

      it('should handle email sending failure', async () => {
        const user = await service.createUser({
          email: 'test@example.com',
          name: 'Test User',
          password: 'password123',
        });

        const event = InngestTestUtils.createTestEvent('user.registered', {
          userId: user.id,
          email: user.email,
          name: user.name,
          registrationSource: 'api',
          timestamp: new Date().toISOString(),
        });

        const mockContext = InngestTestUtils.createMockExecutionContext(
          'send-welcome-email',
          'run-123',
          event
        );

        // Mock email failure
        const emailError = new Error('Email service unavailable');
        mockContext.step.run
          .mockResolvedValueOnce(user) // fetch-user-details
          .mockRejectedValueOnce(emailError); // send-welcome-email fails

        jest.spyOn(emailService, 'sendWelcomeEmail').mockResolvedValue({
          messageId: '',
          success: false,
          error: 'Email service unavailable',
        });

        await expect(service.sendWelcomeEmail(event, mockContext)).rejects.toThrow(emailError);

        expect(mockContext.step.run).toHaveBeenCalledTimes(2);
      });
    });

    describe('handleEmailFailure', () => {
      it('should retry sending email successfully', async () => {
        const user = await service.createUser({
          email: 'test@example.com',
          name: 'Test User',
          password: 'password123',
        });

        const event = InngestTestUtils.createTestEvent('user.email.failed', {
          userId: user.id,
          emailType: 'welcome',
          recipient: user.email,
          error: 'Temporary network error',
          retryable: true,
          timestamp: new Date().toISOString(),
        });

        const mockContext = InngestTestUtils.createMockExecutionContext(
          'handle-email-failure',
          'run-123',
          event
        );

        const mockRetryResult = { messageId: 'retry-email-123', success: true };

        mockContext.step.sleep.mockResolvedValue(undefined);
        mockContext.step.run
          .mockResolvedValueOnce(user) // fetch-user-for-retry
          .mockResolvedValueOnce(mockRetryResult) // retry-send-email
          .mockResolvedValueOnce(undefined); // track-retry-result

        mockContext.step.sendEvent.mockResolvedValue(undefined);

        jest.spyOn(emailService, 'sendWelcomeEmail').mockResolvedValue(mockRetryResult);

        const result = await service.handleEmailFailure(event, mockContext);

        expect(result.success).toBe(true);
        expect(result.emailId).toBe(mockRetryResult.messageId);
        expect(result.retryAttempt).toBe(true);

        expect(mockContext.step.sleep).toHaveBeenCalledWith('wait-before-retry', '30s');
        expect(mockContext.step.run).toHaveBeenCalledTimes(3);
        expect(mockContext.step.sendEvent).toHaveBeenCalledTimes(1);
      });

      it('should not retry non-retryable errors', async () => {
        const event = InngestTestUtils.createTestEvent('user.email.failed', {
          userId: 'user-123',
          emailType: 'welcome',
          recipient: 'test@example.com',
          error: 'Invalid email address',
          retryable: false,
          timestamp: new Date().toISOString(),
        });

        const mockContext = InngestTestUtils.createMockExecutionContext(
          'handle-email-failure',
          'run-123',
          event
        );

        const result = await service.handleEmailFailure(event, mockContext);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('non-retryable');

        // Should not call any steps for non-retryable errors
        expect(mockContext.step.sleep).not.toHaveBeenCalled();
        expect(mockContext.step.run).not.toHaveBeenCalled();
      });
    });

    describe('trackUserVerification', () => {
      it('should track user verification successfully', async () => {
        const user = await service.createUser({
          email: 'test@example.com',
          name: 'Test User',
          password: 'password123',
        });

        const event = InngestTestUtils.createTestEvent('user.verified', {
          userId: user.id,
          email: user.email,
          verificationMethod: 'email_link',
          timestamp: new Date().toISOString(),
        });

        const mockContext = InngestTestUtils.createMockExecutionContext(
          'track-user-verification',
          'run-123',
          event
        );

        mockContext.step.run
          .mockResolvedValueOnce(undefined) // update-verification-analytics
          .mockResolvedValueOnce(undefined); // send-congratulations-email

        mockContext.step.sendEvent.mockResolvedValue(undefined);

        const result = await service.trackUserVerification(event, mockContext);

        expect(result.success).toBe(true);
        expect(result.userId).toBe(user.id);
        expect(result.verificationMethod).toBe('email_link');

        expect(mockContext.step.run).toHaveBeenCalledTimes(2);
        expect(mockContext.step.sendEvent).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      const health = await service.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.userCount).toBe(0);
    });

    it('should return correct user count', async () => {
      await service.createUser({
        email: 'user1@example.com',
        name: 'User 1',
        password: 'password123',
      });

      await service.createUser({
        email: 'user2@example.com',
        name: 'User 2',
        password: 'password123',
      });

      const health = await service.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.userCount).toBe(2);
    });
  });
});