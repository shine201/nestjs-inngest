import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inventory } from '../entities/inventory.entity';
import { InngestService } from 'nestjs-inngest';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    private readonly inngestService: InngestService,
  ) {}

  async reserveItems(orderId: string, items: Array<{ productId: string; quantity: number }>) {
    this.logger.log(`Reserving inventory for order ${orderId}`);

    const unavailableItems: string[] = [];
    const reservations: any[] = [];

    for (const item of items) {
      const inventory = await this.inventoryRepository.findOne({
        where: { productId: item.productId },
      });

      if (!inventory || inventory.availableQuantity < item.quantity) {
        unavailableItems.push(item.productId);
        continue;
      }

      // Reserve the items
      inventory.reserved += item.quantity;
      await this.inventoryRepository.save(inventory);

      reservations.push({
        productId: item.productId,
        quantity: item.quantity,
        reservedAt: new Date(),
      });
    }

    if (unavailableItems.length > 0) {
      return {
        success: false,
        reason: `Items not available: ${unavailableItems.join(', ')}`,
        unavailableItems,
      };
    }

    await this.inngestService.send({
      name: 'inventory.reserved',
      data: {
        orderId,
        items: reservations,
        reservedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      },
    });

    return { success: true, reservations };
  }

  async releaseReservations(orderId: string, reason: string) {
    this.logger.log(`Releasing reservations for order ${orderId}: ${reason}`);
    
    // In a real implementation, you'd track reservations by order
    // For now, we'll just send the event
    await this.inngestService.send({
      name: 'inventory.released',
      data: {
        orderId,
        reason,
        releasedAt: new Date().toISOString(),
      },
    });

    return { success: true };
  }
}