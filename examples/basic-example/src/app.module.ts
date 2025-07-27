import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InngestModule } from 'nestjs-inngest';

// Services
import { UserService } from './services/user.service';
import { EmailService } from './services/email.service';
import { AnalyticsService } from './services/analytics.service';

// Controllers
import { UserController } from './controllers/user.controller';

/**
 * Main application module
 * 
 * This module demonstrates:
 * - Environment-based configuration
 * - Inngest module integration
 * - Service and controller registration
 * - Dependency injection setup
 */
@Module({
  imports: [
    // Configuration module for environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Inngest module with async configuration
    InngestModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const config = {
          appId: configService.get('INNGEST_APP_ID', 'basic-example-app'),
          signingKey: configService.get('INNGEST_SIGNING_KEY'),
          eventKey: configService.get('INNGEST_EVENT_KEY'),
          
          // Environment-specific settings
          env: configService.get('NODE_ENV', 'development') as any,
          isDev: configService.get('NODE_ENV') === 'development',
          
          // Webhook configuration
          endpoint: '/api/inngest',
          
          // Logging configuration
          logger: configService.get('NODE_ENV') !== 'production',
          
          // Performance settings
          timeout: parseInt(configService.get('INNGEST_TIMEOUT', '30000')),
          maxBatchSize: parseInt(configService.get('INNGEST_MAX_BATCH_SIZE', '100')),
          
          // Development mode settings
          development: {
            enabled: configService.get('NODE_ENV') === 'development',
            disableSignatureVerification: configService.get('NODE_ENV') === 'development',
          },
          
          // Retry configuration
          retry: {
            maxAttempts: parseInt(configService.get('INNGEST_MAX_RETRIES', '3')),
            backoff: 'exponential' as const,
            initialDelay: 1000,
            maxDelay: 30000,
          },
        };

        return config;
      },
      inject: [ConfigService],
    }),
  ],

  controllers: [
    UserController,
  ],

  providers: [
    UserService,
    EmailService,
    AnalyticsService,
  ],

  exports: [
    UserService,
    EmailService,
    AnalyticsService,
  ],
})
export class AppModule {}

/**
 * Environment Variables Reference:
 * 
 * Required:
 * - INNGEST_APP_ID: Your Inngest app identifier
 * - INNGEST_SIGNING_KEY: Webhook signature verification key
 * - INNGEST_EVENT_KEY: Event sending authentication key
 * 
 * Optional:
 * - NODE_ENV: Application environment (development/production)
 * - PORT: Server port (default: 3000)
 * - INNGEST_TIMEOUT: Function timeout in milliseconds (default: 30000)
 * - INNGEST_MAX_BATCH_SIZE: Maximum batch size for events (default: 100)
 * - INNGEST_MAX_RETRIES: Maximum retry attempts (default: 3)
 * 
 * Email Service (for production):
 * - SMTP_HOST: SMTP server hostname
 * - SMTP_PORT: SMTP server port
 * - SMTP_USER: SMTP username
 * - SMTP_PASS: SMTP password
 * - SMTP_SECURE: Use TLS (true/false)
 * 
 * Database (for production):
 * - DATABASE_URL: Database connection string
 * - DATABASE_HOST: Database hostname
 * - DATABASE_PORT: Database port
 * - DATABASE_NAME: Database name
 * - DATABASE_USER: Database username
 * - DATABASE_PASS: Database password
 * 
 * Analytics (for production):
 * - ANALYTICS_PROVIDER: Analytics provider (amplitude/mixpanel/custom)
 * - ANALYTICS_API_KEY: Analytics API key
 * - ANALYTICS_BATCH_SIZE: Batch size for analytics events
 * 
 * Example .env file:
 * 
 * # Application
 * NODE_ENV=development
 * PORT=3000
 * 
 * # Inngest
 * INNGEST_APP_ID=basic-example-app
 * INNGEST_SIGNING_KEY=your-signing-key
 * INNGEST_EVENT_KEY=your-event-key
 * INNGEST_TIMEOUT=30000
 * INNGEST_MAX_RETRIES=3
 * 
 * # Email (optional for development)
 * SMTP_HOST=localhost
 * SMTP_PORT=587
 * SMTP_USER=dev@example.com
 * SMTP_PASS=dev-password
 * 
 * # Database (optional for this example)
 * DATABASE_URL=postgres://localhost:5432/basic_example
 */