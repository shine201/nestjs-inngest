import { Module } from '@nestjs/common';
import { InngestModule } from 'nestjs-inngest';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FastifyInngestController } from './fastify-inngest.controller';
import { TestController } from './test.controller';
import { TestService } from './test.service';

@Module({
  imports: [
    // Configure Inngest module for Fastify testing
    InngestModule.forRoot({
      appId: 'fastify-controller-example-app',
      isDev: true,
      endpoint: '/api/inngest',
      logger: true,
      development: {
        enabled: true,
        disableSignatureVerification: true,
        enableIntrospection: true,
      },
    }),
  ],
  controllers: [AppController, FastifyInngestController, TestController],
  providers: [AppService, TestService],
})
export class AppModule {}
