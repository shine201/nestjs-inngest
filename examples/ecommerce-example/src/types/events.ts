import { EventTypes } from 'inngest';

// Order Events
export interface OrderCreatedData {
  orderId: string;
  customerId: string;
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
  totalAmount: number;
  payment: {
    method: 'card' | 'paypal' | 'bank_transfer';
    cardToken?: string;
    amount: number;
  };
  shipping: {
    address: string;
    method: 'standard' | 'express' | 'overnight';
  };
  metadata?: Record<string, any>;
}

export interface OrderConfirmedData {
  orderId: string;
  customerId: string;
  confirmedAt: string;
  estimatedDelivery: string;
}

export interface OrderCancelledData {
  orderId: string;
  customerId: string;
  reason: string;
  cancelledAt: string;
  refundAmount?: number;
}

// Inventory Events
export interface InventoryCheckedData {
  orderId: string;
  items: Array<{
    productId: string;
    requestedQuantity: number;
    availableQuantity: number;
    reserved: boolean;
  }>;
  allItemsAvailable: boolean;
}

export interface InventoryReservedData {
  orderId: string;
  items: Array<{
    productId: string;
    quantity: number;
    reservationId: string;
  }>;
  reservedAt: string;
  expiresAt: string;
}

export interface InventoryReleasedData {
  orderId: string;
  items: Array<{
    productId: string;
    quantity: number;
    reservationId: string;
  }>;
  releasedAt: string;
  reason: 'order_cancelled' | 'payment_failed' | 'expired';
}

// Payment Events
export interface PaymentProcessedData {
  orderId: string;
  paymentId: string;
  customerId: string;
  amount: number;
  method: string;
  transactionId: string;
  processedAt: string;
}

export interface PaymentFailedData {
  orderId: string;
  paymentId: string;
  customerId: string;
  amount: number;
  method: string;
  error: string;
  errorCode: string;
  failedAt: string;
  retryable: boolean;
}

export interface PaymentRefundedData {
  orderId: string;
  paymentId: string;
  refundId: string;
  amount: number;
  reason: string;
  refundedAt: string;
}

// Shipping Events
export interface ShippingPreparedData {
  orderId: string;
  shipmentId: string;
  carrier: string;
  method: string;
  estimatedDelivery: string;
  preparedAt: string;
}

export interface ShippingDispatchedData {
  orderId: string;
  shipmentId: string;
  trackingNumber: string;
  carrier: string;
  dispatchedAt: string;
  estimatedDelivery: string;
}

// Notification Events
export interface NotificationSentData {
  orderId: string;
  customerId: string;
  type: 'email' | 'sms' | 'push';
  template: string;
  recipient: string;
  sentAt: string;
  success: boolean;
  error?: string;
}

// Analytics Events
export interface OrderAnalyticsData {
  orderId: string;
  customerId: string;
  event: 'created' | 'confirmed' | 'cancelled' | 'completed';
  value: number;
  metadata: Record<string, any>;
  timestamp: string;
}

export interface InventoryAnalyticsData {
  productId: string;
  event: 'reserved' | 'released' | 'sold' | 'restocked';
  quantity: number;
  previousStock: number;
  newStock: number;
  timestamp: string;
}

// Consolidated Event Types
export type EcommerceEvents = EventTypes<{
  // Order Events
  'order.created': OrderCreatedData;
  'order.confirmed': OrderConfirmedData;
  'order.cancelled': OrderCancelledData;

  // Inventory Events
  'inventory.checked': InventoryCheckedData;
  'inventory.reserved': InventoryReservedData;
  'inventory.released': InventoryReleasedData;

  // Payment Events
  'payment.processed': PaymentProcessedData;
  'payment.failed': PaymentFailedData;
  'payment.refunded': PaymentRefundedData;

  // Shipping Events
  'shipping.prepared': ShippingPreparedData;
  'shipping.dispatched': ShippingDispatchedData;

  // Notification Events
  'notification.sent': NotificationSentData;

  // Analytics Events
  'analytics.order': OrderAnalyticsData;
  'analytics.inventory': InventoryAnalyticsData;
}>;