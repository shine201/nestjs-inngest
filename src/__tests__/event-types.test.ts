import {
  TypedEventBuilder,
  EventTypeInference,
  EventPatternMatcher,
  EventUtils,
  eventBuilder,
  patternMatcher,
} from "../utils/event-types";
import {
  EventRegistry,
  DefaultEventRegistry,
  RegistryEvent,
  EventValidationSchema,
  InngestEvent,
} from "../interfaces/inngest-event.interface";

// Test event registry
interface TestEventRegistry extends EventRegistry {
  "user.created": {
    userId: string;
    email: string;
    name: string;
  };
  "user.updated": {
    userId: string;
    changes: Record<string, any>;
  };
  "order.completed": {
    orderId: string;
    amount: number;
    currency: string;
  };
  "system.health": {
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: number;
  };
}

describe("TypedEventBuilder", () => {
  let builder: TypedEventBuilder<TestEventRegistry>;

  beforeEach(() => {
    builder = new TypedEventBuilder<TestEventRegistry>();
  });

  describe("registerSchema", () => {
    it("should register event schema successfully", () => {
      const schema: EventValidationSchema<TestEventRegistry["user.created"]> = {
        validate: (data): data is TestEventRegistry["user.created"] => {
          return (
            typeof data === "object" &&
            data !== null &&
            typeof (data as any).userId === "string" &&
            typeof (data as any).email === "string" &&
            typeof (data as any).name === "string"
          );
        },
        description: "User creation event schema",
        version: "1.0.0",
      };

      const result = builder.registerSchema("user.created", schema);
      expect(result).toBe(builder);

      const registeredSchema = builder.getSchema("user.created");
      expect(registeredSchema).toBe(schema);
    });

    it("should register schema with transformer", () => {
      const schema: EventValidationSchema<TestEventRegistry["user.created"]> = {
        validate: (data): data is TestEventRegistry["user.created"] => true,
        transform: (data) => ({
          ...data,
          name: data.name.trim().toLowerCase(),
        }),
      };

      builder.registerSchema("user.created", schema);
      const registeredSchema = builder.getSchema("user.created");
      expect(registeredSchema?.transform).toBeDefined();
    });
  });

  describe("createEvent", () => {
    it("should create typed event successfully", () => {
      const eventData = {
        name: "user.created" as const,
        data: {
          userId: "user-123",
          email: "test@example.com",
          name: "John Doe",
        },
      };

      const event = builder.createEvent(eventData);

      expect(event.name).toBe("user.created");
      expect(event.data).toEqual(eventData.data);
      expect(event.ts).toBeGreaterThan(0);
      expect(event.id).toMatch(/^evt_\d+_[a-z0-9]+$/);
    });

    it("should create event with custom timestamp and id", () => {
      const customTs = 1234567890;
      const customId = "custom-event-id";

      const event = builder.createEvent({
        name: "user.created" as const,
        data: {
          userId: "user-123",
          email: "test@example.com",
          name: "John Doe",
        },
        ts: customTs,
        id: customId,
      });

      expect(event.ts).toBe(customTs);
      expect(event.id).toBe(customId);
    });

    it("should validate event data when schema is registered", () => {
      const schema: EventValidationSchema<TestEventRegistry["user.created"]> = {
        validate: (data): data is TestEventRegistry["user.created"] => {
          return (
            typeof data === "object" &&
            data !== null &&
            typeof (data as any).userId === "string" &&
            typeof (data as any).email === "string" &&
            typeof (data as any).name === "string"
          );
        },
      };

      builder.registerSchema("user.created", schema);

      // Valid data should work
      expect(() => {
        builder.createEvent({
          name: "user.created" as const,
          data: {
            userId: "user-123",
            email: "test@example.com",
            name: "John Doe",
          },
        });
      }).not.toThrow();

      // Invalid data should throw
      expect(() => {
        builder.createEvent({
          name: "user.created" as const,
          data: {
            userId: "user-123",
            // Missing email and name
          } as any,
        });
      }).toThrow('Invalid event data for event "user.created"');
    });

    it("should transform event data when transformer is provided", () => {
      const schema: EventValidationSchema<TestEventRegistry["user.created"]> = {
        validate: (data: unknown): data is TestEventRegistry["user.created"] =>
          true,
        transform: (data) => ({
          ...data,
          name: data.name.toUpperCase(),
        }),
      };

      builder.registerSchema("user.created", schema);

      const event = builder.createEvent({
        name: "user.created" as const,
        data: {
          userId: "user-123",
          email: "test@example.com",
          name: "john doe",
        },
      });

      expect(event.data.name).toBe("JOHN DOE");
    });
  });

  describe("validateEvent", () => {
    it("should validate event successfully", () => {
      const schema: EventValidationSchema<TestEventRegistry["user.created"]> = {
        validate: (data): data is TestEventRegistry["user.created"] => {
          return typeof (data as any).userId === "string";
        },
      };

      builder.registerSchema("user.created", schema);

      const validEvent = builder.createEvent({
        name: "user.created" as const,
        data: {
          userId: "user-123",
          email: "test@example.com",
          name: "John Doe",
        },
      });

      expect(builder.validateEvent(validEvent)).toBe(true);
    });

    it("should return true for events without schema", () => {
      const event = builder.createEvent({
        name: "user.created" as const,
        data: {
          userId: "user-123",
          email: "test@example.com",
          name: "John Doe",
        },
      });

      expect(builder.validateEvent(event)).toBe(true);
    });
  });

  describe("getSchemas", () => {
    it("should return all registered schemas", () => {
      const schema1: EventValidationSchema<TestEventRegistry["user.created"]> =
        {
          validate: (
            data: unknown,
          ): data is TestEventRegistry["user.created"] => true,
        };
      const schema2: EventValidationSchema<
        TestEventRegistry["order.completed"]
      > = {
        validate: (
          data: unknown,
        ): data is TestEventRegistry["order.completed"] => true,
      };

      builder.registerSchema("user.created", schema1);
      builder.registerSchema("order.completed", schema2);

      const schemas = builder.getSchemas();
      expect(schemas["user.created"]).toBe(schema1);
      expect(schemas["order.completed"]).toBe(schema2);
    });
  });
});

describe("EventTypeInference", () => {
  describe("inferEventType", () => {
    it("should infer event type correctly", () => {
      const event: InngestEvent<{ userId: string }> = {
        name: "user.created",
        data: { userId: "user-123" },
      };

      const inferred = EventTypeInference.inferEventType(event);
      expect(inferred.name).toBe("user.created");
      expect(inferred.dataType).toEqual({ userId: "user-123" });
    });
  });

  describe("isEventOfType", () => {
    it("should correctly identify event type", () => {
      const event: InngestEvent = {
        name: "user.created",
        data: { userId: "user-123" },
      };

      expect(EventTypeInference.isEventOfType(event, "user.created")).toBe(
        true,
      );
      expect(EventTypeInference.isEventOfType(event, "user.updated")).toBe(
        false,
      );
    });
  });

  describe("extractEventNames", () => {
    it("should extract event names from array", () => {
      const events: InngestEvent[] = [
        { name: "user.created", data: {} },
        { name: "user.updated", data: {} },
        { name: "order.completed", data: {} },
      ];

      const names = EventTypeInference.extractEventNames(events);
      expect(names).toEqual([
        "user.created",
        "user.updated",
        "order.completed",
      ]);
    });
  });

  describe("groupEventsByName", () => {
    it("should group events by name", () => {
      const events: InngestEvent[] = [
        { name: "user.created", data: { id: 1 } },
        { name: "user.updated", data: { id: 2 } },
        { name: "user.created", data: { id: 3 } },
      ];

      const grouped = EventTypeInference.groupEventsByName(events);
      expect(grouped["user.created"]).toHaveLength(2);
      expect(grouped["user.updated"]).toHaveLength(1);
      expect(grouped["user.created"][0].data.id).toBe(1);
      expect(grouped["user.created"][1].data.id).toBe(3);
    });
  });
});

describe("EventPatternMatcher", () => {
  let matcher: EventPatternMatcher;

  beforeEach(() => {
    matcher = new EventPatternMatcher();
  });

  describe("registerPattern", () => {
    it("should register string pattern", () => {
      const result = matcher.registerPattern("user-events", "^user\\.");
      expect(result).toBe(matcher);
    });

    it("should register regex pattern", () => {
      const regex = /^user\./;
      const result = matcher.registerPattern("user-events", regex);
      expect(result).toBe(matcher);
    });
  });

  describe("matchesPattern", () => {
    beforeEach(() => {
      matcher.registerPattern("user-events", "^user\\.");
      matcher.registerPattern("order-events", "^order\\.");
    });

    it("should match pattern correctly", () => {
      expect(matcher.matchesPattern("user.created", "user-events")).toBe(true);
      expect(matcher.matchesPattern("user.updated", "user-events")).toBe(true);
      expect(matcher.matchesPattern("order.completed", "user-events")).toBe(
        false,
      );
      expect(matcher.matchesPattern("order.completed", "order-events")).toBe(
        true,
      );
    });

    it("should throw error for unknown pattern", () => {
      expect(() => {
        matcher.matchesPattern("user.created", "unknown-pattern");
      }).toThrow('Pattern "unknown-pattern" not found');
    });
  });

  describe("findMatchingPatterns", () => {
    beforeEach(() => {
      matcher.registerPattern("user-events", "^user\\.");
      matcher.registerPattern("creation-events", "\\.created$");
      matcher.registerPattern("all-events", ".*");
    });

    it("should find all matching patterns", () => {
      const matches = matcher.findMatchingPatterns("user.created");
      expect(matches).toContain("user-events");
      expect(matches).toContain("creation-events");
      expect(matches).toContain("all-events");
      expect(matches).toHaveLength(3);
    });

    it("should return empty array for no matches", () => {
      matcher.registerPattern("specific", "^exact\\.match$");
      const matches = matcher.findMatchingPatterns("user.created");
      expect(matches).not.toContain("specific");
    });
  });

  describe("filterEventsByPattern", () => {
    beforeEach(() => {
      matcher.registerPattern("user-events", "^user\\.");
    });

    it("should filter events by pattern", () => {
      const events: InngestEvent[] = [
        { name: "user.created", data: {} },
        { name: "user.updated", data: {} },
        { name: "order.completed", data: {} },
        { name: "system.health", data: {} },
      ];

      const filtered = matcher.filterEventsByPattern(events, "user-events");
      expect(filtered).toHaveLength(2);
      expect(filtered[0].name).toBe("user.created");
      expect(filtered[1].name).toBe("user.updated");
    });

    it("should throw error for unknown pattern", () => {
      const events: InngestEvent[] = [];
      expect(() => {
        matcher.filterEventsByPattern(events, "unknown-pattern");
      }).toThrow('Pattern "unknown-pattern" not found');
    });
  });
});

describe("EventUtils", () => {
  describe("createSimpleEvent", () => {
    it("should create simple event", () => {
      const event = EventUtils.createSimpleEvent("test.event", {
        message: "hello",
      });

      expect(event.name).toBe("test.event");
      expect(event.data).toEqual({ message: "hello" });
      expect(event.ts).toBeGreaterThan(0);
      expect(event.id).toMatch(/^evt_\d+_[a-z0-9]+$/);
    });
  });

  describe("cloneEvent", () => {
    it("should clone event without overrides", () => {
      const original: InngestEvent = {
        name: "test.event",
        data: { message: "hello" },
        ts: 1234567890,
        id: "original-id",
      };

      const cloned = EventUtils.cloneEvent(original);

      expect(cloned.name).toBe(original.name);
      expect(cloned.data).toEqual(original.data);
      expect(cloned.ts).toBeGreaterThan(original.ts!);
      expect(cloned.id).not.toBe(original.id);
    });

    it("should clone event with overrides", () => {
      const original: InngestEvent = {
        name: "test.event",
        data: { message: "hello" },
      };

      const cloned = EventUtils.cloneEvent(original, {
        data: { message: "world" },
        user: { id: "user-123" },
      });

      expect(cloned.name).toBe(original.name);
      expect(cloned.data).toEqual({ message: "world" });
      expect(cloned.user).toEqual({ id: "user-123" });
    });
  });

  describe("mergeEventData", () => {
    it("should merge event data", () => {
      const event: InngestEvent<{ name: string; age?: number }> = {
        name: "test.event",
        data: { name: "John" },
      };

      const merged = EventUtils.mergeEventData(event, { age: 30 });

      expect(merged.data).toEqual({ name: "John", age: 30 });
    });
  });

  describe("isValidEvent", () => {
    it("should validate correct event structure", () => {
      const validEvent = {
        name: "test.event",
        data: { message: "hello" },
      };

      expect(EventUtils.isValidEvent(validEvent)).toBe(true);
    });

    it("should reject invalid event structures", () => {
      expect(EventUtils.isValidEvent(null)).toBe(false);
      expect(EventUtils.isValidEvent(undefined)).toBe(false);
      expect(EventUtils.isValidEvent("string")).toBe(false);
      expect(EventUtils.isValidEvent({})).toBe(false);
      expect(EventUtils.isValidEvent({ name: "test" })).toBe(false);
      expect(EventUtils.isValidEvent({ data: {} })).toBe(false);
      expect(EventUtils.isValidEvent({ name: 123, data: {} })).toBe(false);
    });
  });
});

describe("Default instances", () => {
  it("should provide default event builder", () => {
    expect(eventBuilder).toBeInstanceOf(TypedEventBuilder);
  });

  it("should provide default pattern matcher", () => {
    expect(patternMatcher).toBeInstanceOf(EventPatternMatcher);
  });
});

describe("Type safety", () => {
  it("should enforce type constraints at compile time", () => {
    // This test verifies TypeScript compilation, not runtime behavior
    const builder = new TypedEventBuilder<TestEventRegistry>();

    // This should compile without errors
    const validEvent = builder.createEvent({
      name: "user.created",
      data: {
        userId: "user-123",
        email: "test@example.com",
        name: "John Doe",
      },
    });

    expect(validEvent.name).toBe("user.created");
    expect(validEvent.data.userId).toBe("user-123");

    // TypeScript should prevent invalid event names and data structures
    // These would cause compilation errors:
    // builder.createEvent({
    //   name: 'invalid.event', // Not in TestEventRegistry
    //   data: { userId: 'user-123' }
    // });
    //
    // builder.createEvent({
    //   name: 'user.created',
    //   data: { invalidField: 'value' } // Wrong data structure
    // });
  });
});
