import { Injectable, Logger } from '@nestjs/common';
import {
  InngestFunction,
  TypedInngestFunction,
  OptimizedInngestFunction,
  CronFunction,
  InngestFunctionContext,
} from 'nestjs-inngest';

/**
 * Service to test Priority support across all decorators
 */
@Injectable()
export class PriorityTestService {
  private readonly logger = new Logger(PriorityTestService.name);

  /**
   * Test @InngestFunction with simple priority
   */
  @InngestFunction({
    id: 'basic-priority-test',
    name: 'Basic Priority Test',
    triggers: [{ event: 'test.priority.simple' }],
    priority: 1, // Highest priority
    retries: 2,
    timeout: 10000,
  })
  async handleBasicPriority(
    event: any,
    { step, logger, runId }: InngestFunctionContext,
  ) {
    logger.info(`Basic function with priority 1: ${event.data.message}`);
    
    const result = await step.run('process-high-priority', async () => {
      return {
        message: 'Processed with highest priority (1)',
        priority: 1,
        runId,
        timestamp: new Date().toISOString(),
      };
    });

    this.logger.log(`✅ Basic priority function completed: ${result.message}`);
    return result;
  }

  /**
   * Test @TypedInngestFunction with complex priority (CEL expression)
   */
  @TypedInngestFunction({
    id: 'typed-priority-test',
    name: 'Typed Priority Test with CEL Expression',
    triggers: [{ event: 'test.priority.complex' }],
    config: {
      retries: 3,
      timeout: 15000,
      priority: {
        run: "event.data.user.tier == 'enterprise' ? 120 : (event.data.user.tier == 'premium' ? 60 : -30)"
      }
    }
  })
  async handleTypedPriority({ event }: any) {
    this.logger.log(`Typed function with CEL priority: user tier = ${event.data.user.tier}`);
    
    const priorityValue = event.data.user.tier === 'enterprise' ? 120 
                        : event.data.user.tier === 'premium' ? 60 
                        : -30;

    return {
      message: 'Processed with CEL expression priority',
      userTier: event.data.user.tier,
      calculatedPriority: priorityValue,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Test @OptimizedInngestFunction with medium priority
   */
  @OptimizedInngestFunction({
    id: 'optimized-priority-test',
    name: 'Optimized Priority Test',
    triggers: [{ event: 'test.priority.custom' }],
    priority: 3, // Medium-low priority
    retries: 1,
    timeout: 8000,
  })
  async handleOptimizedPriority(
    event: any,
    { step, logger }: InngestFunctionContext,
  ) {
    logger.info(`Optimized function with priority 3: ${JSON.stringify(event.data)}`);
    
    const result = await step.run('process-medium-priority', async () => {
      return {
        message: 'Processed with medium-low priority (3)',
        priority: 3,
        eventData: event.data,
        optimized: true,
        timestamp: new Date().toISOString(),
      };
    });

    this.logger.log(`✅ Optimized priority function completed`);
    return result;
  }

  /**
   * Test @CronFunction with high priority
   */
  @CronFunction({
    id: 'cron-priority-test',
    name: 'Cron Priority Test',
    cron: '*/5 * * * *', // Every 5 minutes for testing
    timezone: 'UTC',
    retries: 2,
    timeout: 12000,
    priority: 2, // High priority
  })
  async handleCronPriority() {
    this.logger.log('🕒 Cron function with priority 2 executing');
    
    const result = {
      message: 'Cron task executed with high priority (2)',
      priority: 2,
      trigger: 'cron',
      schedule: '*/5 * * * *',
      timestamp: new Date().toISOString(),
    };

    this.logger.log(`✅ Cron priority function completed: ${result.message}`);
    return result;
  }

  /**
   * Test priority with CEL expression based on event data
   */
  @InngestFunction({
    id: 'dynamic-priority-test',
    name: 'Dynamic Priority Test',
    triggers: [{ event: 'test.priority.dynamic' }],
    priority: {
      run: "event.data.urgency == 'critical' ? 200 : (event.data.urgency == 'high' ? 100 : 0)"
    },
    retries: 3,
    timeout: 20000,
  })
  async handleDynamicPriority(
    event: any,
    { step, logger }: InngestFunctionContext,
  ) {
    const urgency = event.data.urgency || 'normal';
    logger.info(`Dynamic priority function with urgency: ${urgency}`);
    
    const result = await step.run('process-dynamic-priority', async () => {
      const priorityValue = urgency === 'critical' ? 200 
                          : urgency === 'high' ? 100 
                          : 0;

      return {
        message: 'Processed with dynamic CEL priority',
        urgency,
        calculatedPriority: priorityValue,
        celExpression: "event.data.urgency == 'critical' ? 200 : (event.data.urgency == 'high' ? 100 : 0)",
        timestamp: new Date().toISOString(),
      };
    });

    this.logger.log(`✅ Dynamic priority function completed for urgency: ${urgency}`);
    return result;
  }
}