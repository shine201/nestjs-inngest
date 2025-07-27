import { Controller, Get, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  @Get(':productId')
  @ApiOperation({ summary: 'Check stock for product' })
  @ApiResponse({ status: 200, description: 'Stock information' })
  async checkStock(@Param('productId') productId: string) {
    return {
      productId,
      quantity: 100,
      available: 95,
      reserved: 5,
      lowStock: false,
    };
  }
}