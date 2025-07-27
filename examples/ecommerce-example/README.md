# E-commerce NestJS Inngest Example

This example demonstrates a comprehensive e-commerce workflow using nestjs-inngest, showcasing advanced patterns like saga orchestration, error handling, and multi-service coordination.

## Features Demonstrated

- 🛒 **Order Processing Pipeline** - Complete order lifecycle management
- 💳 **Payment Integration** - Simulated payment processing with retries
- 📦 **Inventory Management** - Stock checking and reservation
- 📧 **Customer Notifications** - Multi-channel communication
- 🔄 **Saga Pattern** - Distributed transaction management
- ⚡ **Circuit Breaker** - External service failure handling
- 📊 **Event Sourcing** - Complete audit trail
- 🧪 **Comprehensive Testing** - Unit and integration tests

## Architecture Overview

```
Order Creation Flow:
1. Customer places order → order.created event
2. Inventory check → inventory.check event
3. Payment processing → payment.process event
4. Order confirmation → order.confirmed event
5. Shipping preparation → shipping.prepare event
6. Customer notifications → Various notification events

Error Handling:
- Payment failures trigger compensation
- Inventory shortages trigger backorder workflows
- Service timeouts trigger circuit breaker
- All failures logged and monitored
```

## Services

### OrderService
- Order lifecycle management
- Saga orchestration
- Status tracking

### InventoryService
- Stock management
- Reservation system
- Backorder handling

### PaymentService
- Payment processing
- Fraud detection
- Refund handling

### NotificationService
- Email notifications
- SMS alerts
- Push notifications

### ShippingService
- Shipping preparation
- Carrier integration
- Tracking updates

## Event Schema

```typescript
type EcommerceEvents = EventTypes<{
  'order.created': OrderCreatedData;
  'order.confirmed': OrderConfirmedData;
  'order.cancelled': OrderCancelledData;
  'inventory.checked': InventoryCheckedData;
  'inventory.reserved': InventoryReservedData;
  'inventory.released': InventoryReleasedData;
  'payment.processed': PaymentProcessedData;
  'payment.failed': PaymentFailedData;
  'payment.refunded': PaymentRefundedData;
  'shipping.prepared': ShippingPreparedData;
  'shipping.dispatched': ShippingDispatchedData;
  'notification.sent': NotificationSentData;
}>;
```

## Key Patterns

### 1. Saga Orchestration
Long-running transactions with compensation logic:

```typescript
@InngestFunction({
  id: 'order-processing-saga',
  triggers: [{ event: 'order.created' }],
})
async processOrderSaga(event, { step }) {
  try {
    // Check inventory
    await step.run('check-inventory', async () => {
      return this.inventoryService.checkStock(event.data.items);
    });

    // Process payment
    await step.run('process-payment', async () => {
      return this.paymentService.processPayment(event.data.payment);
    });

    // Confirm order
    await step.run('confirm-order', async () => {
      return this.orderService.confirmOrder(event.data.orderId);
    });
  } catch (error) {
    // Compensation logic
    await this.compensateOrder(event.data.orderId, error);
    throw error;
  }
}
```

### 2. Circuit Breaker Pattern
Protecting against external service failures:

```typescript
@Injectable()
export class PaymentGateway {
  private circuitBreaker = new CircuitBreaker();

  async processPayment(payment: Payment) {
    return this.circuitBreaker.execute(async () => {
      return this.externalPaymentAPI.charge(payment);
    });
  }
}
```

### 3. Event Sourcing
Complete audit trail of all state changes:

```typescript
@InngestFunction({
  id: 'event-store-handler',
  triggers: [{ event: '*' }], // Listen to all events
})
async storeEvent(event, { step }) {
  await step.run('append-to-event-store', async () => {
    return this.eventStore.append({
      streamId: event.data.orderId || event.data.userId,
      eventType: event.name,
      eventData: event.data,
      timestamp: new Date(),
    });
  });
}
```

## Setup and Running

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- Inngest account and keys

### Installation
```bash
cd examples/ecommerce-example
npm install
```

### Configuration
Copy `.env.example` to `.env` and configure:
```bash
INNGEST_APP_ID=ecommerce-example
INNGEST_SIGNING_KEY=your-signing-key
INNGEST_EVENT_KEY=your-event-key
```

### Start Dependencies
```bash
docker-compose up -d postgres redis mailhog
```

### Run Application
```bash
npm run start:dev
```

## API Endpoints

### Orders
- `POST /orders` - Create new order
- `GET /orders/:id` - Get order details
- `POST /orders/:id/cancel` - Cancel order
- `GET /orders` - List orders

### Inventory
- `GET /inventory/:productId` - Check stock
- `POST /inventory/:productId/reserve` - Reserve stock
- `POST /inventory/:productId/release` - Release reservation

### Payments
- `POST /payments` - Process payment
- `POST /payments/:id/refund` - Refund payment
- `GET /payments/:id` - Get payment status

## Testing

### Unit Tests
```bash
npm run test
```

### Integration Tests
```bash
npm run test:e2e
```

### Load Testing
```bash
npm run test:load
```

## Example Workflows

### 1. Successful Order
```bash
# Create order
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust-123",
    "items": [
      { "productId": "prod-1", "quantity": 2, "price": 29.99 }
    ],
    "payment": {
      "method": "card",
      "cardToken": "tok_visa",
      "amount": 59.98
    },
    "shipping": {
      "address": "123 Main St, City, State 12345",
      "method": "standard"
    }
  }'
```

### 2. Order with Inventory Issue
```bash
# Create order with insufficient stock
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust-123",
    "items": [
      { "productId": "out-of-stock", "quantity": 10, "price": 99.99 }
    ]
  }'
```

### 3. Payment Failure Scenario
```bash
# Create order with failing payment
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust-123",
    "items": [
      { "productId": "prod-1", "quantity": 1, "price": 29.99 }
    ],
    "payment": {
      "method": "card",
      "cardToken": "tok_chargeDeclined",
      "amount": 29.99
    }
  }'
```

## Monitoring and Observability

### Health Checks
- `GET /health` - Application health
- `GET /health/detailed` - Detailed service health

### Metrics
- `GET /metrics` - Prometheus metrics
- `GET /analytics` - Business metrics

### Event Tracking
- All events stored in event store
- Real-time dashboards available
- Error tracking and alerting

## Advanced Features

### 1. Retry Strategies
Different retry patterns for different failure types:
- Exponential backoff for network errors
- Fixed delay for rate limiting
- No retry for permanent failures

### 2. Bulk Operations
Efficient processing of large orders:
- Batch inventory checks
- Bulk payment processing
- Parallel notification sending

### 3. Multi-tenant Support
Support for multiple merchants:
- Tenant-specific configuration
- Isolated data processing
- Custom business rules

### 4. A/B Testing
Built-in experimentation framework:
- Feature flags
- Conversion tracking
- Statistical analysis

## Production Considerations

### Scaling
- Horizontal scaling with load balancers
- Database read replicas
- Event streaming with Kafka

### Security
- API rate limiting
- Data encryption
- PCI compliance for payments

### Monitoring
- Application performance monitoring
- Business metrics tracking
- Error alerting and escalation

## Next Steps

1. **Extend Payment Methods** - Add more payment providers
2. **Advanced Inventory** - Multi-warehouse support
3. **Recommendation Engine** - ML-powered suggestions
4. **Mobile App Support** - Push notifications and offline sync
5. **International Support** - Multi-currency and localization

## Resources

- [Saga Pattern Documentation](docs/saga-pattern.md)
- [Circuit Breaker Guide](docs/circuit-breaker.md)
- [Event Sourcing Best Practices](docs/event-sourcing.md)
- [Performance Tuning Guide](docs/performance.md)