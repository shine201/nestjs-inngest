import { Controller, Post, Put, Get, Req, Res, Logger } from '@nestjs/common';
import { InngestService } from 'nestjs-inngest';
import type { FastifyRequest, FastifyReply } from 'fastify';

@Controller('api/inngest')
export class FastifyInngestController {
  private readonly logger = new Logger(FastifyInngestController.name);

  constructor(private readonly inngestService: InngestService) {}

  @Get()
  async handleInngestIntrospection(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    return this.handleInngestRequest(req, res, 'GET');
  }

  @Post()
  async handleInngestPostWebHook(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    return this.handleInngestRequest(req, res, 'POST');
  }

  @Put()
  async handleInngestPutWebhook(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    return this.handleInngestRequest(req, res, 'PUT');
  }

  private async handleInngestRequest(
    req: FastifyRequest,
    res: FastifyReply,
    method: string,
  ) {
    this.logger.log(
      `🚀 Fastify Custom Inngest Controller called: ${method} ${req.url}`,
    );

    try {
      // Use the new controller-specific handler for Fastify
      const controllerHandler = await this.inngestService.createControllerHandler('fastify');
      
      this.logger.log(
        '✅ Successfully created Fastify controller handler, delegating to Inngest...',
      );

      // Call the controller handler directly
      return await controllerHandler(req, res);
    } catch (error) {
      this.logger.error('❌ Error in Fastify custom Inngest controller:', error);
      
      return res.status(500).send({
        error: 'Internal Server Error',
        message: error.message,
        platform: 'fastify',
      });
    }
  }
}