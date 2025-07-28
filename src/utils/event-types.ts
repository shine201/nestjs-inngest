import {
  EventRegistry,
  DefaultEventRegistry,
  EventNames,
  EventDataType,
  CreateEvent,
  RegistryEvent,
  EventValidationSchema,
  EventSchemaRegistry,
  InngestEvent,
} from "../interfaces/inngest-event.interface";

/**
 * Type-safe event builder
 */
export class TypedEventBuilder<
  TRegistry extends EventRegistry = DefaultEventRegistry,
> {
  private schemas: EventSchemaRegistry<TRegistry> = {};

  /**
   * Register an event schema for validation
   */
  registerSchema<TName extends EventNames<TRegistry>>(
    eventName: TName,
    schema: EventValidationSchema<EventDataType<TRegistry, TName>>,
  ): this {
    this.schemas[eventName] = schema;
    return this;
  }

  /**
   * Create a type-safe event
   */
  createEvent<TName extends EventNames<TRegistry>>(
    eventData: CreateEvent<TRegistry, TName>,
  ): RegistryEvent<TRegistry, TName> {
    const { name, data, user, ts, id, v } = eventData;

    // Validate event data if schema is registered
    const schema = this.schemas[name];
    if (schema) {
      if (!schema.validate(data)) {
        throw new Error(`Invalid event data for event "${name}"`);
      }

      // Transform data if transformer is provided
      if (schema.transform) {
        (eventData as any).data = schema.transform(data);
      }
    }

    return {
      name,
      data: eventData.data,
      user,
      ts: ts || Date.now(),
      id: id || this.generateEventId(),
      v,
    } as RegistryEvent<TRegistry, TName>;
  }

  /**
   * Validate an event against its schema
   */
  validateEvent<TName extends EventNames<TRegistry>>(
    event: RegistryEvent<TRegistry, TName>,
  ): boolean {
    const schema = this.schemas[event.name];
    if (!schema) {
      return true; // No schema means no validation
    }

    return schema.validate(event.data);
  }

  /**
   * Get registered schemas
   */
  getSchemas(): EventSchemaRegistry<TRegistry> {
    return { ...this.schemas };
  }

  /**
   * Get schema for specific event
   */
  getSchema<TName extends EventNames<TRegistry>>(
    eventName: TName,
  ): EventValidationSchema<EventDataType<TRegistry, TName>> | undefined {
    return this.schemas[eventName];
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

/**
 * Event type inference utilities
 */
export class EventTypeInference {
  /**
   * Infer event type from event object
   */
  static inferEventType<T extends InngestEvent>(
    event: T,
  ): {
    name: T["name"];
    dataType: T["data"];
  } {
    return {
      name: event.name,
      dataType: event.data,
    };
  }

  /**
   * Check if event matches expected type
   */
  static isEventOfType<
    TRegistry extends EventRegistry,
    TName extends EventNames<TRegistry>,
  >(
    event: InngestEvent,
    expectedName: TName,
  ): event is RegistryEvent<TRegistry, TName> {
    return event.name === expectedName;
  }

  /**
   * Extract event names from a list of events
   */
  static extractEventNames<T extends InngestEvent[]>(
    events: T,
  ): Array<T[number]["name"]> {
    return events.map((event) => event.name);
  }

  /**
   * Group events by name
   */
  static groupEventsByName<T extends InngestEvent>(
    events: T[],
  ): Record<string, T[]> {
    return events.reduce(
      (groups, event) => {
        const name = event.name;
        if (!groups[name]) {
          groups[name] = [];
        }
        groups[name].push(event);
        return groups;
      },
      {} as Record<string, T[]>,
    );
  }
}

/**
 * Type-safe event pattern matching
 */
export class EventPatternMatcher {
  private patterns: Map<string, RegExp> = new Map();

  /**
   * Register an event pattern
   */
  registerPattern(name: string, pattern: string | RegExp): this {
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    this.patterns.set(name, regex);
    return this;
  }

  /**
   * Check if event name matches a pattern
   */
  matchesPattern(eventName: string, patternName: string): boolean {
    const pattern = this.patterns.get(patternName);
    if (!pattern) {
      throw new Error(`Pattern "${patternName}" not found`);
    }
    return pattern.test(eventName);
  }

  /**
   * Find all patterns that match an event name
   */
  findMatchingPatterns(eventName: string): string[] {
    const matches: string[] = [];
    for (const [name, pattern] of this.patterns.entries()) {
      if (pattern.test(eventName)) {
        matches.push(name);
      }
    }
    return matches;
  }

  /**
   * Filter events by pattern
   */
  filterEventsByPattern<T extends InngestEvent>(
    events: T[],
    patternName: string,
  ): T[] {
    const pattern = this.patterns.get(patternName);
    if (!pattern) {
      throw new Error(`Pattern "${patternName}" not found`);
    }
    return events.filter((event) => pattern.test(event.name));
  }
}

/**
 * Default event builder instance
 */
export const eventBuilder = new TypedEventBuilder<DefaultEventRegistry>();

/**
 * Default pattern matcher instance
 */
export const patternMatcher = new EventPatternMatcher();

/**
 * Utility functions for common event operations
 */
export const EventUtils = {
  /**
   * Create a simple event with minimal data
   */
  createSimpleEvent<TName extends string, TData = any>(
    name: TName,
    data: TData,
  ): InngestEvent<TData> & { name: TName } {
    return {
      name,
      data,
      ts: Date.now(),
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    };
  },

  /**
   * Clone an event with optional data override
   */
  cloneEvent<T extends InngestEvent>(event: T, overrides?: Partial<T>): T {
    return {
      ...event,
      ...overrides,
      ts: overrides?.ts || Date.now(),
      id:
        overrides?.id ||
        `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    };
  },

  /**
   * Merge event data
   */
  mergeEventData<T extends InngestEvent>(
    event: T,
    additionalData: Partial<T["data"]>,
  ): T {
    return {
      ...event,
      data: {
        ...event.data,
        ...additionalData,
      },
    };
  },

  /**
   * Validate event structure
   */
  isValidEvent(obj: unknown): obj is InngestEvent {
    return (
      typeof obj === "object" &&
      obj !== null &&
      "name" in obj &&
      "data" in obj &&
      typeof (obj as any).name === "string"
    );
  },
};

/**
 * Type helper for creating event registry
 */
export type CreateEventRegistry<T extends Record<string, any>> = T;

/**
 * Type helper for extending default registry
 */
export type ExtendDefaultRegistry<T extends EventRegistry> =
  DefaultEventRegistry & T;

/**
 * Event types namespace for common event operations
 */
export const EventTypes = {
  /**
   * User events
   */
  USER_CREATED: "user.created" as const,
  USER_UPDATED: "user.updated" as const,
  USER_DELETED: "user.deleted" as const,
  USER_VERIFIED: "user.verified" as const,

  /**
   * Order events
   */
  ORDER_CREATED: "order.created" as const,
  ORDER_UPDATED: "order.updated" as const,
  ORDER_CANCELLED: "order.cancelled" as const,
  ORDER_COMPLETED: "order.completed" as const,

  /**
   * Payment events
   */
  PAYMENT_INITIATED: "payment.initiated" as const,
  PAYMENT_COMPLETED: "payment.completed" as const,
  PAYMENT_FAILED: "payment.failed" as const,

  /**
   * Inventory events
   */
  INVENTORY_UPDATED: "inventory.updated" as const,
  INVENTORY_LOW_STOCK: "inventory.low.stock" as const,

  /**
   * Notification events
   */
  NOTIFICATION_SENT: "notification.sent" as const,
  NOTIFICATION_DELIVERED: "notification.delivered" as const,

  /**
   * Analytics events
   */
  ANALYTICS_TRACKED: "analytics.tracked" as const,
  ANALYTICS_AGGREGATED: "analytics.aggregated" as const,
};

// Re-export types for convenience
export type {
  EventRegistry,
  DefaultEventRegistry,
  EventNames,
  EventDataType,
  CreateEvent,
  RegistryEvent,
  EventValidationSchema,
  EventSchemaRegistry,
} from "../interfaces/inngest-event.interface";
