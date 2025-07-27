import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Logger,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { OrderService } from '../services/order.service';
import { Order } from '../entities/order.entity';

export class CreateOrderDto {
  customerId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  billingAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  notes?: string;
}

export class CancelOrderDto {
  reason: string;
}

@ApiTags('orders')
@Controller('orders')
export class OrderController {
  private readonly logger = new Logger(OrderController.name);

  constructor(private readonly orderService: OrderService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({ status: 201, description: 'Order created successfully', type: Order })
  async createOrder(@Body() createOrderDto: CreateOrderDto): Promise<Order> {
    try {
      this.logger.log(`Creating order for customer ${createOrderDto.customerId}`);
      return await this.orderService.createOrder(createOrderDto);
    } catch (error) {
      this.logger.error(`Failed to create order: ${error.message}`);
      throw new HttpException(
        `Failed to create order: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Order found', type: Order })
  async getOrder(@Param('id') id: string): Promise<Order> {
    try {
      return await this.orderService.getOrder(id);
    } catch (error) {
      this.logger.error(`Failed to get order ${id}: ${error.message}`);
      throw new HttpException(
        `Order not found: ${error.message}`,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get orders by customer' })
  @ApiResponse({ status: 200, description: 'Orders found', type: [Order] })
  async getOrdersByCustomer(@Query('customerId') customerId: string): Promise<Order[]> {
    if (!customerId) {
      throw new HttpException('Customer ID is required', HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.orderService.getOrdersByCustomer(customerId);
    } catch (error) {
      this.logger.error(`Failed to get orders for customer ${customerId}: ${error.message}`);
      throw new HttpException(
        `Failed to get orders: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Order cancelled successfully', type: Order })
  async cancelOrder(
    @Param('id') id: string,
    @Body() cancelOrderDto: CancelOrderDto,
  ): Promise<Order> {
    try {
      this.logger.log(`Cancelling order ${id}: ${cancelOrderDto.reason}`);
      return await this.orderService.cancelOrder(id, cancelOrderDto.reason);
    } catch (error) {
      this.logger.error(`Failed to cancel order ${id}: ${error.message}`);
      throw new HttpException(
        `Failed to cancel order: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}