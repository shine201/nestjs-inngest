import { Injectable, Logger } from '@nestjs/common';
import { InngestFunction } from 'nestjs-inngest';
import type { InngestFunctionContext } from 'nestjs-inngest';

@Injectable()
export class TestService {
  private readonly logger = new Logger(TestService.name);

  @InngestFunction({
    id: 'test-custom-controller',
    name: 'Test Custom Controller Function',
    triggers: [{ event: 'test.controller' }],
    retries: 2,
    timeout: 10000,
  })
  async handleTestEvent(
    event: any,
    { step, logger }: InngestFunctionContext,
  ) {
    logger.info('🚀 Test function triggered via custom controller!');
    
    const result = await step.run('process-test-data', async () => {
      this.logger.log(`Processing test event: ${JSON.stringify(event.data)}`);
      
      return {
        message: 'Successfully processed via custom controller',
        timestamp: new Date().toISOString(),
        eventData: event.data,
        controllerType: 'custom-controller',
      };
    });

    this.logger.log(`✅ Test function completed: ${result.message}`);
    return result;
  }
}