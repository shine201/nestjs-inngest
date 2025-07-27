import { Controller, Get, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('payments')
@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  @Get(':id')
  @ApiOperation({ summary: 'Get payment status' })
  @ApiResponse({ status: 200, description: 'Payment information' })
  async getPayment(@Param('id') id: string) {
    return {
      id,
      status: 'completed',
      amount: 99.99,
      currency: 'USD',
      method: 'card',
      processedAt: new Date().toISOString(),
    };
  }
}