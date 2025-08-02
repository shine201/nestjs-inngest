import { Controller, Post, Body, Get } from '@nestjs/common';
import { InngestService } from 'nestjs-inngest';

@Controller('test')
export class TestController {
  constructor(private readonly inngestService: InngestService) {}

  @Get()
  getInfo() {
    return {
      message: 'Custom Controller Test API',
      endpoints: {
        'POST /test/trigger': 'Trigger test event via custom controller',
        'PUT /api/inngest': 'Inngest webhook endpoint (custom controller)',
        'POST /api/inngest': 'Inngest webhook endpoint (custom controller)',
      },
    };
  }

  @Post('trigger')
  async triggerTestEvent(@Body() data: any) {
    try {
      const result = await this.inngestService.send({
        name: 'test.controller',
        data: {
          message: 'Event sent via custom controller test',
          timestamp: new Date().toISOString(),
          ...data,
        },
      });

      return {
        success: true,
        message: 'Event sent successfully via custom controller',
        eventResult: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}