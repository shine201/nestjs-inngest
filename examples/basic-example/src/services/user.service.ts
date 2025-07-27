import { Injectable, Logger } from '@nestjs/common';
import { TypedInngestFunction, InngestService } from 'nestjs-inngest';
import { UserEvents, UserEventFactory } from '../events/user.events';
import { EmailService } from './email.service';

export interface User {
  id: string;
  email: string;
  name: string;
  isVerified: boolean;
  registrationSource: 'web' | 'mobile' | 'api';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  email: string;
  name: string;
  password: string;
  registrationSource?: 'web' | 'mobile' | 'api';
}

/**
 * User service handling user management and Inngest functions
 * 
 * This service demonstrates:
 * - User CRUD operations
 * - Event-driven workflows
 * - Type-safe Inngest functions
 * - Error handling and retries
 * - Step functions for reliable processing
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  
  // In-memory storage for demo purposes
  // In a real app, this would be a database
  private users = new Map<string, User>();

  constructor(
    private readonly emailService: EmailService,
    private readonly inngestService: InngestService,
  ) {}

  /**
   * Create a new user and trigger the registration workflow
   */
  async createUser(createUserDto: CreateUserDto): Promise<User> {
    const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const user: User = {
      id: userId,
      email: createUserDto.email,
      name: createUserDto.name,
      isVerified: false,
      registrationSource: createUserDto.registrationSource || 'api',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Save user (in real app, this would be database operation)
    this.users.set(userId, user);
    
    this.logger.log(`Created user ${user.id} (${user.email})`);

    // Trigger user registration event
    const registrationEvent = UserEventFactory.userRegistered({
      userId: user.id,
      email: user.email,
      name: user.name,
      registrationSource: user.registrationSource,
      timestamp: user.createdAt.toISOString(),
      metadata: {
        // In a real app, you might include request metadata
        ipAddress: '127.0.0.1',
        userAgent: 'Demo App',
      },
    });

    await this.inngestService.send(registrationEvent);
    
    return user;
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  /**
   * Get all users
   */
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  /**
   * Verify a user's email
   */
  async verifyUser(userId: string): Promise<User> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    user.isVerified = true;
    user.updatedAt = new Date();
    this.users.set(userId, user);

    this.logger.log(`Verified user ${userId} (${user.email})`);

    // Trigger verification event
    const verificationEvent = UserEventFactory.userVerified({
      userId: user.id,
      email: user.email,
      verificationMethod: 'email_link',
      timestamp: new Date().toISOString(),
    });

    await this.inngestService.send(verificationEvent);

    return user;
  }

  /**
   * Inngest Function: Send welcome email after user registration
   * 
   * This function demonstrates:
   * - Type-safe event handling
   * - Step functions for reliability
   * - Error handling and retries
   * - Event chaining
   */
  @TypedInngestFunction<UserEvents>({
    id: 'send-welcome-email',
    name: 'Send Welcome Email',
    triggers: [{ event: 'user.registered' }],
    retries: 3,
    timeout: 30000, // 30 seconds
  })
  async sendWelcomeEmail(
    event: UserEvents['user.registered'],
    { step, logger }: any
  ) {
    const { userId, email, name, registrationSource } = event.data;

    logger.info(`Starting welcome email workflow for user ${userId}`);

    // Step 1: Fetch user details (in case we need fresh data)
    const user = await step.run('fetch-user-details', async () => {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      return user;
    });

    // Step 2: Send welcome email
    const emailResult = await step.run('send-welcome-email', async () => {
      try {
        const result = await this.emailService.sendWelcomeEmail(email, { name });
        
        if (!result.success) {
          throw new Error(`Failed to send welcome email: ${result.error}`);
        }
        
        return result;
      } catch (error) {
        logger.error(`Welcome email failed for user ${userId}:`, error);
        throw error;
      }
    });

    // Step 3: Track email sent event
    await step.run('track-email-sent', async () => {
      const emailSentEvent = UserEventFactory.emailSent({
        userId,
        emailType: 'welcome',
        emailId: emailResult.messageId,
        recipient: email,
        subject: `Welcome to Our App, ${name}!`,
        timestamp: new Date().toISOString(),
        metadata: {
          templateId: 'welcome-email',
          provider: 'email-service',
        },
      });

      await step.sendEvent(emailSentEvent);
    });

    // Step 4: Send verification email
    await step.run('send-verification-email', async () => {
      const verificationToken = this.generateVerificationToken();
      const verificationUrl = `http://localhost:3000/verify?token=${verificationToken}&userId=${userId}`;
      
      try {
        const result = await this.emailService.sendVerificationEmail(email, {
          name,
          verificationToken,
          verificationUrl,
        });

        if (result.success) {
          const emailSentEvent = UserEventFactory.emailSent({
            userId,
            emailType: 'verification',
            emailId: result.messageId,
            recipient: email,
            subject: 'Please verify your email address',
            timestamp: new Date().toISOString(),
          });

          await step.sendEvent(emailSentEvent);
        } else {
          const emailFailedEvent = UserEventFactory.emailFailed({
            userId,
            emailType: 'verification',
            recipient: email,
            error: result.error || 'Unknown error',
            retryable: true,
            timestamp: new Date().toISOString(),
          });

          await step.sendEvent(emailFailedEvent);
        }
      } catch (error) {
        logger.warn(`Verification email failed for user ${userId}, but continuing:`, error);
        
        const emailFailedEvent = UserEventFactory.emailFailed({
          userId,
          emailType: 'verification',
          recipient: email,
          error: error.message,
          retryable: true,
          timestamp: new Date().toISOString(),
        });

        await step.sendEvent(emailFailedEvent);
      }
    });

    logger.info(`Welcome email workflow completed for user ${userId}`);

    return {
      success: true,
      userId,
      emailId: emailResult.messageId,
      registrationSource,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Inngest Function: Handle email failures with retries
   * 
   * This function demonstrates error recovery patterns
   */
  @TypedInngestFunction<UserEvents>({
    id: 'handle-email-failure',
    name: 'Handle Email Failure',
    triggers: [{ event: 'user.email.failed' }],
    retries: 2,
  })
  async handleEmailFailure(
    event: UserEvents['user.email.failed'],
    { step, logger }: any
  ) {
    const { userId, emailType, recipient, error, retryable } = event.data;

    logger.warn(`Handling email failure for user ${userId}: ${error}`);

    if (!retryable) {
      logger.error(`Non-retryable email failure for user ${userId}, giving up`);
      return { success: false, reason: 'non-retryable' };
    }

    // Step 1: Wait before retry
    await step.sleep('wait-before-retry', '30s');

    // Step 2: Get fresh user data
    const user = await step.run('fetch-user-for-retry', async () => {
      return await this.getUserById(userId);
    });

    if (!user) {
      logger.error(`User ${userId} not found for email retry`);
      return { success: false, reason: 'user-not-found' };
    }

    // Step 3: Retry sending email based on type
    const retryResult = await step.run('retry-send-email', async () => {
      try {
        let result;
        
        switch (emailType) {
          case 'welcome':
            result = await this.emailService.sendWelcomeEmail(recipient, { name: user.name });
            break;
          case 'verification':
            const token = this.generateVerificationToken();
            const url = `http://localhost:3000/verify?token=${token}&userId=${userId}`;
            result = await this.emailService.sendVerificationEmail(recipient, {
              name: user.name,
              verificationToken: token,
              verificationUrl: url,
            });
            break;
          default:
            throw new Error(`Unsupported email type for retry: ${emailType}`);
        }

        return result;
      } catch (error) {
        logger.error(`Email retry failed for user ${userId}:`, error);
        throw error;
      }
    });

    // Step 4: Track retry result
    await step.run('track-retry-result', async () => {
      if (retryResult.success) {
        const emailSentEvent = UserEventFactory.emailSent({
          userId,
          emailType,
          emailId: retryResult.messageId,
          recipient,
          subject: `Retry: ${emailType} email`,
          timestamp: new Date().toISOString(),
          metadata: { retry: true },
        });

        await step.sendEvent(emailSentEvent);
      }
    });

    return {
      success: retryResult.success,
      emailId: retryResult.messageId,
      retryAttempt: true,
    };
  }

  /**
   * Inngest Function: Track user verification
   * 
   * This function demonstrates event-driven state updates
   */
  @TypedInngestFunction<UserEvents>({
    id: 'track-user-verification',
    name: 'Track User Verification',
    triggers: [{ event: 'user.verified' }],
  })
  async trackUserVerification(
    event: UserEvents['user.verified'],
    { step, logger }: any
  ) {
    const { userId, email, verificationMethod } = event.data;

    logger.info(`Tracking verification for user ${userId} via ${verificationMethod}`);

    // Step 1: Update analytics
    await step.run('update-verification-analytics', async () => {
      const analyticsEvent = UserEventFactory.analyticsEvent({
        userId,
        eventType: 'user_verified',
        category: 'user',
        properties: {
          verificationMethod,
          email,
        },
        timestamp: new Date().toISOString(),
      });

      await step.sendEvent(analyticsEvent);
    });

    // Step 2: Send congratulations email (optional)
    await step.run('send-congratulations-email', async () => {
      try {
        const user = await this.getUserById(userId);
        if (user) {
          await this.emailService.sendNotificationEmail(email, {
            name: user.name,
            subject: 'Email Verified Successfully!',
            message: 'Congratulations! Your email has been verified and your account is now fully active.',
            actionUrl: 'http://localhost:3000/dashboard',
            actionText: 'Go to Dashboard',
          });
        }
      } catch (error) {
        logger.warn(`Failed to send congratulations email to ${userId}:`, error);
        // Don't fail the function for this optional step
      }
    });

    return { success: true, userId, verificationMethod };
  }

  /**
   * Generate a verification token (simplified for demo)
   */
  private generateVerificationToken(): string {
    return Math.random().toString(36).substr(2, 32);
  }

  /**
   * Health check for the user service
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; userCount: number }> {
    try {
      const userCount = this.users.size;
      return { status: 'healthy', userCount };
    } catch (error) {
      return { status: 'unhealthy', userCount: 0 };
    }
  }
}