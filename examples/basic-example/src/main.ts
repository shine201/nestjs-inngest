import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { NestExpressApplication } from "@nestjs/platform-express";
import {
  NestFastifyApplication,
  FastifyAdapter,
} from "@nestjs/platform-fastify";
import { InngestService } from "nestjs-inngest";
import "dotenv/config";
/**
 * Bootstrap the NestJS application
 *
 * This bootstrap function:
 * - Creates the NestJS application
 * - Configures global validation pipes
 * - Sets up error handling
 * - Configures CORS for development
 * - Starts the HTTP server
 */
async function bootstrap() {
  const logger = new Logger("Bootstrap");

  try {
    // Platform switch - change this to 'fastify' to use Fastify
    const USE_FASTIFY = true; // Set to true for Fastify, false for Express

    const platform = USE_FASTIFY ? "fastify" : "express";
    logger.log(`🚀 Starting with ${platform.toUpperCase()} platform`);

    let app: NestExpressApplication | NestFastifyApplication;

    if (USE_FASTIFY) {
      // Create Fastify application
      app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter(),
        { logger: ["log", "error", "warn", "debug", "verbose"] }
      );

      // Setup Inngest Fastify plugin using createServe
      const inngestService = app.get(InngestService);
      const { plugin, options } = await inngestService.createServe("fastify");
      await app.register(plugin, options);
      logger.log("✅ Inngest Fastify plugin registered");
    } else {
      // Create Express application
      app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bodyParser: false,
        logger: ["log", "error", "warn", "debug", "verbose"],
      });

      // Configure Express body parser
      app.useBodyParser("json", { limit: "10mb" });

      // Setup Inngest Express middleware using createServe
      const inngestService = app.get(InngestService);
      const serveMiddleware = await inngestService.createServe("express");
      app.use("/api/inngest", serveMiddleware);
      logger.log("✅ Inngest Express middleware registered");
    }

    // Common configuration
    const configService = app.get(ConfigService);
    const port = configService.get("PORT", process.env.PORT || 5100);
    const nodeEnv = configService.get("NODE_ENV", "development");

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      })
    );

    // CORS for development
    if (nodeEnv === "development") {
      if (USE_FASTIFY) {
        // Fastify CORS would need @fastify/cors package
        logger.log("CORS: Configure manually for Fastify if needed");
      } else {
        app.enableCors({
          origin: [
            "http://localhost:3000",
            "http://localhost:3001",
            `http://localhost:${port}`,
          ],
          methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
          allowedHeaders: ["Content-Type", "Authorization"],
          credentials: true,
        });
        logger.log("CORS enabled for development");
      }
    }

    // Start server
    if (USE_FASTIFY) {
      await app.listen(port, "0.0.0.0");
    } else {
      await app.listen(port);
    }
    // Log startup information
    logger.log(`🚀 Application is running on: http://localhost:${port}`);
    logger.log(`🌐 Web Dashboard: http://localhost:${port}`);
    logger.log(`📊 Environment: ${nodeEnv}`);
    logger.log(
      `🔗 Inngest webhook endpoint: http://localhost:${port}/api/inngest`
    );

    // Log helpful endpoints
    logger.log("\n📋 Available endpoints:");
    logger.log(
      `   GET  http://localhost:${port}/                   - Web Dashboard (Test all APIs)`
    );
    logger.log(
      `   GET  http://localhost:${port}/users              - List all users`
    );
    logger.log(
      `   POST http://localhost:${port}/users              - Create a new user`
    );
    logger.log(
      `   GET  http://localhost:${port}/users/:id          - Get user by ID`
    );
    logger.log(
      `   POST http://localhost:${port}/users/verify       - Verify user email`
    );
    logger.log(
      `   GET  http://localhost:${port}/users/health/status - System health check`
    );
    logger.log(
      `   GET  http://localhost:${port}/users/inngest/status - Inngest integration status`
    );
    logger.log(
      `   GET  http://localhost:${port}/users/inngest/test - Test Inngest webhook connectivity`
    );
    logger.log(
      `   PUT  http://localhost:${port}/api/inngest        - Inngest function introspection`
    );
    logger.log(
      `   POST http://localhost:${port}/api/inngest        - Inngest webhook endpoint`
    );

    // Log configuration information
    const inngestAppId = configService.get("INNGEST_APP_ID");
    const hasSigningKey = !!configService.get("INNGEST_SIGNING_KEY");
    const hasEventKey = !!configService.get("INNGEST_EVENT_KEY");

    logger.log("\n⚙️  Configuration:");
    logger.log(`   Inngest App ID: ${inngestAppId || "NOT SET"}`);
    logger.log(`   Signing Key: ${hasSigningKey ? "SET" : "NOT SET"}`);
    logger.log(`   Event Key: ${hasEventKey ? "SET" : "NOT SET"}`);

    if (!inngestAppId || !hasSigningKey || !hasEventKey) {
      logger.warn("\n⚠️  Warning: Missing Inngest configuration!");
      logger.warn(
        "   Please ensure you have set the required environment variables:"
      );
      logger.warn("   - INNGEST_APP_ID");
      logger.warn("   - INNGEST_SIGNING_KEY");
      logger.warn("   - INNGEST_EVENT_KEY");
      logger.warn(
        "\n   For development, you can create a .env file with these values."
      );
    }

    // Example curl commands
    if (nodeEnv === "development") {
      logger.log("\n🛠️  Example API calls:");
      logger.log(`
   # Create a new user
   curl -X POST http://localhost:${port}/users \\
     -H "Content-Type: application/json" \\
     -d '{
       "email": "john.doe@example.com",
       "name": "John Doe",
       "password": "securepassword123",
       "registrationSource": "api"
     }'

   # List all users
   curl http://localhost:${port}/users

   # Check system health
   curl http://localhost:${port}/users/health/status

   # Get analytics summary
   curl http://localhost:${port}/users/analytics/summary

   # Check registered Inngest functions
   curl http://localhost:${port}/api/inngest
      `);
    }
  } catch (error) {
    logger.error("❌ Failed to start application:", error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  const logger = new Logger("UnhandledRejection");
  logger.error("Unhandled Promise Rejection:", reason);
  logger.error("Promise:", promise);
  // In production, you might want to gracefully shutdown
  // process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  const logger = new Logger("UncaughtException");
  logger.error("Uncaught Exception:", error);
  // In production, you should gracefully shutdown
  process.exit(1);
});

// Graceful shutdown handling
process.on("SIGTERM", async () => {
  const logger = new Logger("Shutdown");
  logger.log("Received SIGTERM signal. Starting graceful shutdown...");

  // Perform cleanup here
  // - Close database connections
  // - Finish processing current requests
  // - Close server gracefully

  process.exit(0);
});

process.on("SIGINT", async () => {
  const logger = new Logger("Shutdown");
  logger.log("Received SIGINT signal. Starting graceful shutdown...");

  // Perform cleanup here
  process.exit(0);
});

// Start the application
bootstrap();
