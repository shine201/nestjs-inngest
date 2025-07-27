# Examples

This directory contains example applications demonstrating various use cases and patterns with nestjs-inngest.

## Available Examples

### 1. Basic Example (`basic-example/`)
A simple example showing basic setup and function usage:
- User registration workflow
- Email notifications
- Basic event handling

### 2. E-commerce Example (`ecommerce-example/`)
A comprehensive e-commerce workflow demonstrating:
- Order processing pipeline
- Payment integration
- Inventory management
- Customer notifications
- Error handling and retries

### 3. Task Queue Example (`task-queue-example/`)
Background job processing patterns:
- File processing
- Data imports/exports
- Scheduled maintenance tasks
- Long-running operations

### 4. Event Sourcing Example (`event-sourcing-example/`)
Event sourcing and CQRS patterns:
- Domain events
- Event store integration
- Read model updates
- Saga orchestration

### 5. Multi-Service Example (`multi-service-example/`)
Microservices communication patterns:
- Inter-service communication
- Distributed workflows
- Service orchestration
- Circuit breaker patterns

## Running Examples

Each example includes:
- Complete NestJS application setup
- Docker Compose configuration for dependencies
- Test suites demonstrating functionality
- README with setup instructions

### Prerequisites

```bash
# Install dependencies
npm install

# Start local development environment
docker-compose up -d

# Run the example
npm run start:dev
```

### Testing

```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:e2e

# Run with coverage
npm run test:cov
```

## Learning Path

We recommend exploring the examples in this order:

1. **Start with Basic Example** - Learn fundamental concepts
2. **Explore E-commerce Example** - Understand complex workflows
3. **Study Task Queue Example** - Learn background processing patterns
4. **Review Event Sourcing Example** - Advanced architectural patterns
5. **Examine Multi-Service Example** - Distributed system patterns

Each example builds upon concepts from the previous ones, providing a comprehensive learning experience.