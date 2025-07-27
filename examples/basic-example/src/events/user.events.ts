import { EventTypes } from 'nestjs-inngest';

/**
 * Type-safe event definitions for user-related events
 * 
 * This demonstrates the type-safe event pattern where you define
 * all your events in one place with their exact data structure.
 */
export type UserEvents = EventTypes<{
  /**
   * Triggered when a new user registers
   */
  'user.registered': {
    userId: string;
    email: string;
    name: string;
    registrationSource: 'web' | 'mobile' | 'api';
    timestamp: string;
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
      referrer?: string;
    };
  };

  /**
   * Triggered when a user's email address is verified
   */
  'user.verified': {
    userId: string;
    email: string;
    verificationMethod: 'email_link' | 'email_code' | 'manual';
    timestamp: string;
  };

  /**
   * Triggered when an email is sent to a user
   */
  'user.email.sent': {
    userId: string;
    emailType: 'welcome' | 'verification' | 'password_reset' | 'notification';
    emailId: string;
    recipient: string;
    subject: string;
    timestamp: string;
    metadata?: {
      templateId?: string;
      provider?: string;
    };
  };

  /**
   * Triggered when an email delivery fails
   */
  'user.email.failed': {
    userId: string;
    emailType: 'welcome' | 'verification' | 'password_reset' | 'notification';
    recipient: string;
    error: string;
    retryable: boolean;
    timestamp: string;
  };

  /**
   * Triggered for analytics tracking
   */
  'analytics.event': {
    userId?: string;
    eventType: string;
    category: 'user' | 'email' | 'system';
    properties: Record<string, any>;
    timestamp: string;
    sessionId?: string;
  };
}>;

/**
 * Helper type to extract event data from a specific event
 * 
 * Usage: EventData<UserEvents['user.registered']>
 */
export type EventData<T> = T extends { data: infer U } ? U : never;

/**
 * Helper to create properly typed events
 */
export class UserEventFactory {
  static userRegistered(data: EventData<UserEvents['user.registered']>): UserEvents['user.registered'] {
    return {
      name: 'user.registered',
      data: {
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      },
      id: `user-registered-${data.userId}-${Date.now()}`,
      user: { id: data.userId },
    };
  }

  static userVerified(data: EventData<UserEvents['user.verified']>): UserEvents['user.verified'] {
    return {
      name: 'user.verified',
      data: {
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      },
      id: `user-verified-${data.userId}-${Date.now()}`,
      user: { id: data.userId },
    };
  }

  static emailSent(data: EventData<UserEvents['user.email.sent']>): UserEvents['user.email.sent'] {
    return {
      name: 'user.email.sent',
      data: {
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      },
      id: `email-sent-${data.emailId}`,
      user: { id: data.userId },
    };
  }

  static emailFailed(data: EventData<UserEvents['user.email.failed']>): UserEvents['user.email.failed'] {
    return {
      name: 'user.email.failed',
      data: {
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      },
      id: `email-failed-${data.userId}-${Date.now()}`,
      user: { id: data.userId },
    };
  }

  static analyticsEvent(data: EventData<UserEvents['analytics.event']>): UserEvents['analytics.event'] {
    return {
      name: 'analytics.event',
      data: {
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      },
      id: `analytics-${data.eventType}-${Date.now()}`,
      user: data.userId ? { id: data.userId } : undefined,
    };
  }
}