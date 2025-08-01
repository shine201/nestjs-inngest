import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { InngestModule } from "nestjs-inngest";

// Services
import { UserService } from "./services/user.service";
import { EmailService } from "./services/email.service";
import { AnalyticsService } from "./services/analytics.service";
import { PerformanceTestService } from "./services/performance-test.service";
import { PriorityTestService } from "./services/priority-test.service";

// Controllers
import { UserController } from "./controllers/user.controller";
import { PerformanceTestController } from "./controllers/performance-test.controller";
import { DebugController } from "./controllers/debug.controller";
import { PriorityTestController } from "./controllers/priority-test.controller";

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
      envFilePath: [".env.local", ".env"],
    }),

    // Inngest module with simple configuration
    InngestModule.forRoot({
      appId: "basic-example-app",
      // signingKey: process.env.INNGEST_SIGNING_KEY,
      // eventKey: process.env.INNGEST_EVENT_KEY,
      env: "development",
      isDev: true,
      endpoint: "/api/inngest",
      logger: true,
      timeout: 30000,
      maxBatchSize: 100,
      development: {
        enabled: true,
        disableSignatureVerification: true,
        enableIntrospection: true,
      },
      retry: {
        maxAttempts: 3,
        backoff: "exponential" as const,
        initialDelay: 1000,
        maxDelay: 30000,
      },
    }),

    // Commented out async configuration for testing
    // InngestModule.forRootAsync({
    //   imports: [ConfigModule],
    //   useFactory: async (configService: ConfigService) => {
    //     const config = {
    //       appId: configService.get("INNGEST_APP_ID", "basic-example-app"),
    //       signingKey: configService.get("INNGEST_SIGNING_KEY"),
    //       eventKey: configService.get("INNGEST_EVENT_KEY"),
    //       env: configService.get("NODE_ENV", "development") as any,
    //       isDev: configService.get("NODE_ENV") === "development",
    //       endpoint: "/api/inngest-serve",
    //       logger: configService.get("NODE_ENV") !== "production",
    //       timeout: parseInt(configService.get("INNGEST_TIMEOUT", "30000")),
    //       maxBatchSize: parseInt(
    //         configService.get("INNGEST_MAX_BATCH_SIZE", "100")
    //       ),
    //       development: {
    //         enabled: configService.get("NODE_ENV") === "development",
    //         disableSignatureVerification:
    //           configService.get("NODE_ENV") === "development",
    //       },
    //       retry: {
    //         maxAttempts: parseInt(
    //           configService.get("INNGEST_MAX_RETRIES", "3")
    //         ),
    //         backoff: "exponential" as const,
    //         initialDelay: 1000,
    //         maxDelay: 30000,
    //       },
    //       enableConnect: false,
    //     };

    //     return config;
    //   },
    //   inject: [ConfigService],
    // }),
  ],

  controllers: [UserController, PerformanceTestController, DebugController, PriorityTestController],

  providers: [
    UserService,
    EmailService,
    AnalyticsService,
    PerformanceTestService,
    PriorityTestService,
  ],

  exports: [
    UserService,
    EmailService,
    AnalyticsService,
    PerformanceTestService,
    PriorityTestService,
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
