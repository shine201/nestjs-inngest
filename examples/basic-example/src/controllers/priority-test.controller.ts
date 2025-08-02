import { Controller, Get, Post, Body } from '@nestjs/common';
import { InngestService } from 'nestjs-inngest';

@Controller('priority-test')
export class PriorityTestController {
  constructor(private readonly inngestService: InngestService) {}

  @Get('/simple')
  async testSimplePriority() {
    // Test simple priority (1-4)
    await this.inngestService.send({
      name: 'test.priority.simple',
      data: { message: 'Testing simple priority 1 (highest)' }
    });

    return { 
      success: true, 
      message: 'Triggered simple priority test functions' 
    };
  }

  @Get('/complex')
  async testComplexPriority() {
    // Test complex priority with different user tiers
    await this.inngestService.send({
      name: 'test.priority.complex',
      data: { 
        message: 'Testing complex priority',
        user: { tier: 'enterprise', accountId: 'acc_123' }
      }
    });

    await this.inngestService.send({
      name: 'test.priority.complex',
      data: { 
        message: 'Testing complex priority',
        user: { tier: 'basic', accountId: 'acc_456' }
      }
    });

    return { 
      success: true, 
      message: 'Triggered complex priority test functions with different user tiers' 
    };
  }

  @Post('/custom')
  async testCustomPriority(@Body() data: any) {
    // Test custom priority data
    await this.inngestService.send({
      name: 'test.priority.custom',
      data: data
    });

    return { 
      success: true, 
      message: 'Triggered custom priority test function with provided data' 
    };
  }
}