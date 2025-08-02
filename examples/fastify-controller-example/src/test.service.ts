import { Injectable, Logger } from '@nestjs/common';
import { InngestFunction } from 'nestjs-inngest';
import type { InngestFunctionContext } from 'nestjs-inngest';

@Injectable()
export class TestService {
  private readonly logger = new Logger(TestService.name);

  @InngestFunction({
    id: 'fastify-test-controller',
    name: 'Fastify Test Custom Controller Function',
    triggers: [{ event: 'test.fastify.controller' }],
    retries: 2,
    timeout: 10000,
  })
  async handleFastifyTestEvent(
    event: any,
    { step, logger }: InngestFunctionContext,
  ) {
    logger.info('🚀 Fastify test function triggered via custom controller!');
    
    const result = await step.run('process-fastify-test-data', async () => {
      this.logger.log(`Processing Fastify test event: ${JSON.stringify(event.data)}`);
      
      return {
        message: 'Successfully processed via Fastify custom controller',
        timestamp: new Date().toISOString(),
        eventData: event.data,
        platform: 'fastify',
        controllerType: 'custom-controller',
      };
    });

    this.logger.log(`✅ Fastify test function completed: ${result.message}`);
    return result;
  }
}