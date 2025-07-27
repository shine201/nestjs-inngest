import { Injectable, Logger } from '@nestjs/common';
import { InngestFunction } from 'nestjs-inngest';

@Injectable()
export class InventoryEventHandlers {
  private readonly logger = new Logger(InventoryEventHandlers.name);

  @InngestFunction({
    id: 'inventory-reserved-handler',
    triggers: [{ event: 'inventory.reserved' }],
  })
  async handleInventoryReserved(event: any) {
    this.logger.log(`Inventory reserved: ${JSON.stringify(event.data)}`);
    return { success: true };
  }

  @InngestFunction({
    id: 'inventory-released-handler',
    triggers: [{ event: 'inventory.released' }],
  })
  async handleInventoryReleased(event: any) {
    this.logger.log(`Inventory released: ${JSON.stringify(event.data)}`);
    return { success: true };
  }
}