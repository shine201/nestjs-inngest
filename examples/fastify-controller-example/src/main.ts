import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Create Fastify application
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: ['log', 'error', 'warn', 'debug', 'verbose'] },
  );

  const port = process.env.PORT ?? 5100;

  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Fastify application is running on: http://localhost:${port}`);
  logger.log(
    `🎯 Fastify Custom Inngest Controller: http://localhost:${port}/api/inngest`,
  );
  logger.log(`🧪 Test endpoints:`);
  logger.log(`   GET  http://localhost:${port}/test - API info`);
  logger.log(
    `   POST http://localhost:${port}/test/trigger - Trigger test event`,
  );
  logger.log(`\n📋 Test the Fastify custom controller with:`);
  logger.log(
    `   curl -X POST http://localhost:${port}/test/trigger -H "Content-Type: application/json" -d '{"test": "fastify"}'`,
  );
  logger.log(`\n🔗 Start Inngest Dev Server with:`);
  logger.log(
    `   npx inngest-cli@latest dev -u http://localhost:${port}/api/inngest`,
  );
}

bootstrap();
