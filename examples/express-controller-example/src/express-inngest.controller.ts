import {
  Controller,
  Post,
  Put,
  Req,
  Res,
  Headers,
  Logger,
  Get,
} from '@nestjs/common';
import { InngestService } from 'nestjs-inngest';

@Controller('api/inngest')
export class ExpressInngestController {
  private readonly logger = new Logger(ExpressInngestController.name);

  constructor(private readonly inngestService: InngestService) {}

  @Get()
  async handleInngestIntrospection(
    @Req() req: any,
    @Res({ passthrough: false }) res: any,
  ) {
    return this.handleInngestRequest(req, res, 'GET');
  }
  @Post()
  async handleInngestPostWebHook(
    @Req() req: any,
    @Res({ passthrough: false }) res: any,
  ) {
    return this.handleInngestRequest(req, res, req.method);
  }

  @Put()
  async handleInngestPutWebhook(
    @Req() req: any,
    @Res({ passthrough: false }) res: any,
  ) {
    return this.handleInngestRequest(req, res, req.method);
  }

  private async handleInngestRequest(req: any, res: any, method: string) {
    this.logger.log(
      `🎯 Custom Inngest Controller called: ${method} ${req.url}`,
    );

    try {
      // Use the new controller-specific handler for Express
      const controllerHandler = await this.inngestService.createControllerHandler('express');

      this.logger.log(
        '✅ Successfully created Express controller handler, delegating to Inngest...',
      );

      // Delegate to Inngest controller handler
      return controllerHandler(req, res);
    } catch (error) {
      this.logger.error('❌ Error in custom Inngest controller:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
}
