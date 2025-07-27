import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { InngestModule } from 'nestjs-inngest';

// Controllers
import { OrderController } from './controllers/order.controller';
import { InventoryController } from './controllers/inventory.controller';
import { PaymentController } from './controllers/payment.controller';
import { AnalyticsController } from './controllers/analytics.controller';

// Services
import { OrderService } from './services/order.service';
import { InventoryService } from './services/inventory.service';
import { PaymentService } from './services/payment.service';
import { NotificationService } from './services/notification.service';
import { ShippingService } from './services/shipping.service';
import { EventStoreService } from './services/event-store.service';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { AnalyticsService } from './services/analytics.service';

// Event Handlers
import { OrderEventHandlers } from './events/order.events';
import { InventoryEventHandlers } from './events/inventory.events';
import { PaymentEventHandlers } from './events/payment.events';
import { NotificationEventHandlers } from './events/notification.events';
import { ShippingEventHandlers } from './events/shipping.events';
import { AnalyticsEventHandlers } from './events/analytics.events';

// Entities
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from './entities/product.entity';
import { Inventory } from './entities/inventory.entity';
import { Payment } from './entities/payment.entity';
import { Customer } from './entities/customer.entity';
import { EventStore } from './entities/event-store.entity';
import { Notification } from './entities/notification.entity';
import { Shipment } from './entities/shipment.entity';

// Configuration
import databaseConfig from './config/database.config';
import inngestConfig from './config/inngest.config';
import appConfig from './config/app.config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, inngestConfig, appConfig],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useExisting: ConfigService,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.name'),
        entities: [
          Order,
          OrderItem,
          Product,
          Inventory,
          Payment,
          Customer,
          EventStore,
          Notification,
          Shipment,
        ],
        synchronize: configService.get('NODE_ENV') !== 'production',
        logging: configService.get('NODE_ENV') === 'development',
      }),
    }),

    // TypeORM entities
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Product,
      Inventory,
      Payment,
      Customer,
      EventStore,
      Notification,
      Shipment,
    ]),

    // Inngest
    InngestModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        appId: configService.get('inngest.appId'),
        signingKey: configService.get('inngest.signingKey'),
        eventKey: configService.get('inngest.eventKey'),
        devServerUrl: configService.get('inngest.devServerUrl'),
      }),
    }),

    // Scheduling
    ScheduleModule.forRoot(),
  ],
  controllers: [
    OrderController,
    InventoryController,
    PaymentController,
    AnalyticsController,
  ],
  providers: [
    // Services
    OrderService,
    InventoryService,
    PaymentService,
    NotificationService,
    ShippingService,
    EventStoreService,
    CircuitBreakerService,
    AnalyticsService,

    // Event Handlers
    OrderEventHandlers,
    InventoryEventHandlers,
    PaymentEventHandlers,
    NotificationEventHandlers,
    ShippingEventHandlers,
    AnalyticsEventHandlers,
  ],
})
export class AppModule {}