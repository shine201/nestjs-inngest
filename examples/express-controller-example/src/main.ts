import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const port = process.env.PORT ?? 5100;

  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(
    `🎯 Custom Inngest Controller: http://localhost:${port}/api/inngest`,
  );
  logger.log(`🧪 Test endpoints:`);
  logger.log(`   GET  http://localhost:${port}/test - API info`);
  logger.log(
    `   POST http://localhost:${port}/test/trigger - Trigger test event`,
  );
  logger.log(`\n📋 Test the custom controller with:`);
  logger.log(
    `   curl -X POST http://localhost:${port}/test/trigger -H "Content-Type: application/json" -d '{"test": "data"}'`,
  );
}

bootstrap();
