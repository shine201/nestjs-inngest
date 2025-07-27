import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  environment: process.env.NODE_ENV || 'development',
  
  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD,
  },

  // Email
  email: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT, 10) || 1025,
    user: process.env.SMTP_USER || 'test',
    pass: process.env.SMTP_PASS || 'test',
    from: process.env.SMTP_FROM || 'noreply@ecommerce-example.com',
  },

  // Payment
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },

  // External Services
  services: {
    inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3001',
    shipping: process.env.SHIPPING_SERVICE_URL || 'http://localhost:3002',
    notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003',
  },

  // Circuit Breaker
  circuitBreaker: {
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT, 10) || 30000,
    threshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD, 10) || 5,
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT, 10) || 60000,
  },

  // Rate Limiting
  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL, 10) || 60,
    limit: parseInt(process.env.RATE_LIMIT_LIMIT, 10) || 100,
  },
}));