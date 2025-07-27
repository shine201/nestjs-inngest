import { Injectable, Logger } from '@nestjs/common';
import { InngestFunction } from 'nestjs-inngest';

@Injectable()
export class NotificationEventHandlers {
  private readonly logger = new Logger(NotificationEventHandlers.name);

  @InngestFunction({
    id: 'notification-sent-handler',
    triggers: [{ event: 'notification.sent' }],
  })
  async handleNotificationSent(event: any) {
    this.logger.log(`Notification sent: ${JSON.stringify(event.data)}`);
    return { success: true };
  }
}