import { Module } from '@nestjs/common';
import { InngestModule } from 'nestjs-inngest';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExpressInngestController } from './express-inngest.controller';
import { TestController } from './test.controller';
import { TestService } from './test.service';

@Module({
  imports: [
    // Configure Inngest module with minimal settings for testing
    InngestModule.forRoot({
      appId: 'express-controller-example-app',
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
  controllers: [AppController, ExpressInngestController, TestController],
  providers: [AppService, TestService],
})
export class AppModule {}
