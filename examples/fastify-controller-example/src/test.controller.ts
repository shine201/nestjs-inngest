import { Controller, Post, Body, Get } from '@nestjs/common';
import { InngestService } from 'nestjs-inngest';

@Controller('test')
export class TestController {
  constructor(private readonly inngestService: InngestService) {}

  @Get()
  getInfo() {
    return {
      message: 'Fastify Custom Controller Test API',
      platform: 'fastify',
      endpoints: {
        'POST /test/trigger': 'Trigger test event via Fastify custom controller',
        'PUT /api/inngest': 'Inngest webhook endpoint (Fastify custom controller)',
        'POST /api/inngest': 'Inngest webhook endpoint (Fastify custom controller)',
        'GET /api/inngest': 'Inngest introspection endpoint (Fastify custom controller)',
      },
    };
  }

  @Post('trigger')
  async triggerTestEvent(@Body() data: any) {
    try {
      const result = await this.inngestService.send({
        name: 'test.fastify.controller',
        data: {
          message: 'Event sent via Fastify custom controller test',
          timestamp: new Date().toISOString(),
          platform: 'fastify',
          ...data,
        },
      });

      return {
        success: true,
        message: 'Event sent successfully via Fastify custom controller',
        platform: 'fastify',
        eventResult: result,
      };
    } catch (error) {
      return {
        success: false,
        platform: 'fastify',
        error: error.message,
      };
    }
  }
}