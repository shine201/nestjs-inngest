import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Query,
  HttpCode, 
  HttpStatus, 
  ValidationPipe,
  UsePipes,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { IsEmail, IsString, MinLength, IsOptional, IsIn } from 'class-validator';
import { UserService, User, CreateUserDto } from '../services/user.service';
import { AnalyticsService } from '../services/analytics.service';
import { EmailService } from '../services/email.service';

/**
 * Data Transfer Objects (DTOs) for validation
 */
export class CreateUserRequestDto implements CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsIn(['web', 'mobile', 'api'])
  registrationSource?: 'web' | 'mobile' | 'api';
}

export class VerifyUserDto {
  @IsString()
  token: string;

  @IsString()
  userId: string;
}

/**
 * User controller providing REST API endpoints
 * 
 * This controller demonstrates:
 * - REST API design with NestJS
 * - Input validation with DTOs
 * - Error handling
 * - Integration with Inngest-powered services
 * - API documentation patterns
 */
@Controller('users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(
    private readonly userService: UserService,
    private readonly analyticsService: AnalyticsService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Create a new user
   * 
   * POST /users
   * 
   * This endpoint:
   * 1. Validates the input data
   * 2. Creates a new user
   * 3. Triggers the user registration workflow via Inngest
   * 4. Returns the created user data
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true }))
  async createUser(@Body() createUserDto: CreateUserRequestDto): Promise<{
    success: boolean;
    user: Omit<User, 'password'>;
    message: string;
  }> {
    this.logger.log(`Creating user with email: ${createUserDto.email}`);

    try {
      // Check if user already exists
      const existingUser = await this.userService.getUserByEmail(createUserDto.email);
      if (existingUser) {
        throw new BadRequestException('User with this email already exists');
      }

      // Create the user (this will trigger Inngest functions)
      const user = await this.userService.createUser(createUserDto);

      // Return user data without password
      const { ...userResponse } = user;

      this.logger.log(`Successfully created user ${user.id}`);

      return {
        success: true,
        user: userResponse,
        message: 'User created successfully. Welcome email has been sent.',
      };
    } catch (error) {
      this.logger.error(`Failed to create user: ${error.message}`);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(`Failed to create user: ${error.message}`);
    }
  }

  /**
   * Get user by ID
   * 
   * GET /users/:id
   */
  @Get(':id')
  async getUserById(@Param('id') id: string): Promise<{
    success: boolean;
    user: Omit<User, 'password'>;
  }> {
    this.logger.log(`Fetching user with ID: ${id}`);

    const user = await this.userService.getUserById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const { ...userResponse } = user;

    return {
      success: true,
      user: userResponse,
    };
  }

  /**
   * Get all users
   * 
   * GET /users
   */
  @Get()
  async getAllUsers(): Promise<{
    success: boolean;
    users: Omit<User, 'password'>[];
    count: number;
  }> {
    this.logger.log('Fetching all users');

    const users = await this.userService.getAllUsers();
    
    // Remove password field from all users
    const usersResponse = users.map(user => {
      const { ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    return {
      success: true,
      users: usersResponse,
      count: usersResponse.length,
    };
  }

  /**
   * Verify user email
   * 
   * POST /users/verify
   * 
   * This would typically be called when a user clicks a verification link
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true }))
  async verifyUser(@Body() verifyUserDto: VerifyUserDto): Promise<{
    success: boolean;
    user: Omit<User, 'password'>;
    message: string;
  }> {
    this.logger.log(`Verifying user ${verifyUserDto.userId} with token`);

    try {
      // In a real app, you would validate the token here
      // For demo purposes, we'll just verify the user
      const user = await this.userService.verifyUser(verifyUserDto.userId);

      const { ...userResponse } = user;

      this.logger.log(`Successfully verified user ${user.id}`);

      return {
        success: true,
        user: userResponse,
        message: 'Email verified successfully!',
      };
    } catch (error) {
      this.logger.error(`Failed to verify user: ${error.message}`);
      throw new BadRequestException(`Failed to verify user: ${error.message}`);
    }
  }

  /**
   * Get user analytics
   * 
   * GET /users/:id/analytics
   */
  @Get(':id/analytics')
  async getUserAnalytics(@Param('id') userId: string): Promise<{
    success: boolean;
    analytics: any[];
    summary: any;
  }> {
    this.logger.log(`Fetching analytics for user ${userId}`);

    // Verify user exists
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const analytics = this.analyticsService.getMetricsByUser(userId);
    const summary = {
      totalEvents: analytics.length,
      categories: [...new Set(analytics.map(a => a.category))],
      eventTypes: [...new Set(analytics.map(a => a.eventType))],
      firstEvent: analytics.length > 0 ? analytics[analytics.length - 1].timestamp : null,
      lastEvent: analytics.length > 0 ? analytics[0].timestamp : null,
    };

    return {
      success: true,
      analytics,
      summary,
    };
  }

  /**
   * Get system health status
   * 
   * GET /users/health
   */
  @Get('health/status')
  async getHealthStatus(): Promise<{
    success: boolean;
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: any;
    timestamp: string;
  }> {
    this.logger.log('Checking system health');

    const [userHealth, analyticsHealth, emailHealth] = await Promise.allSettled([
      this.userService.healthCheck(),
      this.analyticsService.healthCheck(),
      this.emailService.healthCheck(),
    ]);

    const services = {
      user: userHealth.status === 'fulfilled' ? userHealth.value : { status: 'unhealthy', error: userHealth.reason },
      analytics: analyticsHealth.status === 'fulfilled' ? analyticsHealth.value : { status: 'unhealthy', error: analyticsHealth.reason },
      email: emailHealth.status === 'fulfilled' ? emailHealth.value : { status: 'unhealthy', error: emailHealth.reason },
    };

    // Determine overall status
    const allHealthy = Object.values(services).every(service => service.status === 'healthy');
    const anyUnhealthy = Object.values(services).some(service => service.status === 'unhealthy');
    
    const overallStatus = allHealthy ? 'healthy' : anyUnhealthy ? 'unhealthy' : 'degraded';

    return {
      success: true,
      status: overallStatus,
      services,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get analytics summary
   * 
   * GET /users/analytics/summary
   */
  @Get('analytics/summary')
  async getAnalyticsSummary(): Promise<{
    success: boolean;
    summary: any;
  }> {
    this.logger.log('Fetching analytics summary');

    const summary = this.analyticsService.getSummary();

    return {
      success: true,
      summary,
    };
  }

  /**
   * Resend verification email
   * 
   * POST /users/:id/resend-verification
   */
  @Post(':id/resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerificationEmail(@Param('id') userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    this.logger.log(`Resending verification email for user ${userId}`);

    try {
      const user = await this.userService.getUserById(userId);
      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      if (user.isVerified) {
        throw new BadRequestException('User is already verified');
      }

      // Generate new verification token and send email
      const verificationToken = Math.random().toString(36).substr(2, 32);
      const verificationUrl = `http://localhost:3000/verify?token=${verificationToken}&userId=${userId}`;
      
      const result = await this.emailService.sendVerificationEmail(user.email, {
        name: user.name,
        verificationToken,
        verificationUrl,
      });

      if (!result.success) {
        throw new BadRequestException(`Failed to send verification email: ${result.error}`);
      }

      this.logger.log(`Verification email resent to user ${userId}`);

      return {
        success: true,
        message: 'Verification email has been resent',
      };
    } catch (error) {
      this.logger.error(`Failed to resend verification email: ${error.message}`);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(`Failed to resend verification email: ${error.message}`);
    }
  }

  /**
   * Trigger a test event (for development/testing)
   * 
   * POST /users/:id/test-event
   */
  @Post(':id/test-event')
  @HttpCode(HttpStatus.OK)
  async triggerTestEvent(
    @Param('id') userId: string,
    @Query('eventType') eventType: string = 'test_event'
  ): Promise<{
    success: boolean;
    message: string;
    eventType: string;
  }> {
    this.logger.log(`Triggering test event '${eventType}' for user ${userId}`);

    try {
      const user = await this.userService.getUserById(userId);
      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Record a test analytics event
      await this.analyticsService.recordEvent(
        eventType,
        'test',
        {
          triggeredBy: 'api',
          timestamp: new Date().toISOString(),
          userEmail: user.email,
          userName: user.name,
        },
        userId
      );

      return {
        success: true,
        message: `Test event '${eventType}' triggered successfully`,
        eventType,
      };
    } catch (error) {
      this.logger.error(`Failed to trigger test event: ${error.message}`);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new BadRequestException(`Failed to trigger test event: ${error.message}`);
    }
  }
}