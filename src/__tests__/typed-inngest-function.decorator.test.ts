import "reflect-metadata";
import { Injectable } from "@nestjs/common";
import {
  TypedInngestFunction,
  TypedInngestFunctionConfig,
  TypedFunctionHandler,
  createEventDecorator,
  CronFunction,
} from "../decorators/typed-inngest-function.decorator";
import {
  EventRegistry,
  TypedEventContext,
} from "../interfaces/inngest-event.interface";
import { InngestFunctionError } from "../errors";
import { METADATA_KEYS } from "../constants";

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
}

describe("TypedInngestFunction Decorator", () => {
  describe("basic functionality", () => {
    it("should register function metadata correctly", () => {
      @Injectable()
      class TestService {
        @TypedInngestFunction<TestEventRegistry, "user.created">({
          id: "handle-user-created",
          name: "Handle User Created",
          triggers: [{ event: "user.created" }],
        })
        async handleUserCreated(
          context: TypedEventContext<TestEventRegistry, "user.created">
        ) {
          return `User ${context.event.data.userId} created`;
        }
      }

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.INNGEST_FUNCTION,
        TestService.prototype,
        "handleUserCreated"
      );

      expect(metadata).toBeDefined();
      expect(metadata.id).toBe("handle-user-created");
      expect(metadata.name).toBe("Handle User Created");
      expect(metadata.triggers).toEqual([{ event: "user.created" }]);
      expect(metadata.target).toBe(TestService.prototype);
      expect(metadata.propertyKey).toBe("handleUserCreated");
      expect(typeof metadata.handler).toBe("function");
    });

    it("should work with multiple triggers", () => {
      @Injectable()
      class TestService {
        @TypedInngestFunction<TestEventRegistry>({
          id: "handle-user-events",
          triggers: [{ event: "user.created" }, { event: "user.updated" }],
        })
        async handleUserEvents(context: TypedEventContext<TestEventRegistry>) {
          return `Handled ${context.event.name}`;
        }
      }

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.INNGEST_FUNCTION,
        TestService.prototype,
        "handleUserEvents"
      );

      expect(metadata.triggers).toHaveLength(2);
      expect(metadata.triggers[0].event).toBe("user.created");
      expect(metadata.triggers[1].event).toBe("user.updated");
    });

    it("should work with cron triggers", () => {
      @Injectable()
      class TestService {
        @TypedInngestFunction({
          id: "daily-cleanup",
          triggers: [{ cron: "0 0 * * *", timezone: "UTC" }],
        })
        async dailyCleanup() {
          return "Cleanup completed";
        }
      }

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.INNGEST_FUNCTION,
        TestService.prototype,
        "dailyCleanup"
      );

      expect(metadata.triggers[0].cron).toBe("0 0 * * *");
      expect(metadata.triggers[0].timezone).toBe("UTC");
    });

    it("should work with function configuration options", () => {
      @Injectable()
      class TestService {
        @TypedInngestFunction<TestEventRegistry, "user.created">({
          id: "handle-user-created-with-config",
          triggers: [{ event: "user.created" }],
          config: {
            retries: 3,
            timeout: 30000,
            priority: 1,
            rateLimit: {
              limit: 10,
              period: "1m",
              key: "user.id",
            },
            concurrency: {
              limit: 5,
              key: "user.id",
            },
            batchEvents: {
              maxSize: 100,
              timeout: "5s",
            },
          },
        })
        async handleUserCreated(
          context: TypedEventContext<TestEventRegistry, "user.created">
        ) {
          return "Handled";
        }
      }

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.INNGEST_FUNCTION,
        TestService.prototype,
        "handleUserCreated"
      );

      expect(metadata.config.retries).toBe(3);
      expect(metadata.config.timeout).toBe(30000);
      expect(metadata.config.priority).toBe(1);
      expect(metadata.config.rateLimit.limit).toBe(10);
      expect(metadata.config.concurrency.limit).toBe(5);
      expect(metadata.config.batchEvents.maxSize).toBe(100);
    });
  });

  describe("validation", () => {
    it("should validate function ID format", () => {
      expect(() => {
        @Injectable()
        class TestService {
          @TypedInngestFunction({
            id: "InvalidID", // Should be kebab-case
            triggers: [{ event: "user.created" }],
          })
          async handleEvent() {}
        }
      }).toThrow(InngestFunctionError);
    });

    it("should validate empty function ID", () => {
      expect(() => {
        @Injectable()
        class TestService {
          @TypedInngestFunction({
            id: "", // Empty ID
            triggers: [{ event: "user.created" }],
          })
          async handleEvent() {}
        }
      }).toThrow(InngestFunctionError);
    });

    it("should validate missing triggers", () => {
      expect(() => {
        @Injectable()
        class TestService {
          @TypedInngestFunction({
            id: "test-function",
            triggers: [], // Empty triggers
          })
          async handleEvent() {}
        }
      }).toThrow(InngestFunctionError);
    });

    it("should validate invalid event trigger", () => {
      expect(() => {
        @Injectable()
        class TestService {
          @TypedInngestFunction({
            id: "test-function",
            triggers: [{ event: "" }], // Empty event name
          })
          async handleEvent() {}
        }
      }).toThrow(InngestFunctionError);
    });

    it("should validate invalid cron trigger", () => {
      expect(() => {
        @Injectable()
        class TestService {
          @TypedInngestFunction({
            id: "test-function",
            triggers: [{ cron: "" }], // Empty cron expression
          })
          async handleEvent() {}
        }
      }).toThrow(InngestFunctionError);
    });

    it("should validate configuration options", () => {
      expect(() => {
        @Injectable()
        class TestService {
          @TypedInngestFunction({
            id: "test-function",
            triggers: [{ event: "user.created" }],
            config: {
              retries: -1, // Invalid retries
            },
          })
          async handleEvent() {}
        }
      }).toThrow("Retries must be a non-negative number");

      expect(() => {
        @Injectable()
        class TestService {
          @TypedInngestFunction({
            id: "test-function",
            triggers: [{ event: "user.created" }],
            config: {
              timeout: 0, // Invalid timeout
            },
          })
          async handleEvent() {}
        }
      }).toThrow("Timeout must be a positive number");

      expect(() => {
        @Injectable()
        class TestService {
          @TypedInngestFunction({
            id: "test-function",
            triggers: [{ event: "user.created" }],
            config: {
              priority: 5 as any, // Invalid priority
            },
          })
          async handleEvent() {}
        }
      }).toThrow("Priority must be 1, 2, 3, or 4");
    });

    it("should validate rate limit configuration", () => {
      expect(() => {
        @Injectable()
        class TestService {
          @TypedInngestFunction({
            id: "test-function",
            triggers: [{ event: "user.created" }],
            config: {
              rateLimit: {
                limit: 0, // Invalid limit
                period: "1m",
              },
            },
          })
          async handleEvent() {}
        }
      }).toThrow("Rate limit must be a positive number");

      expect(() => {
        @Injectable()
        class TestService {
          @TypedInngestFunction({
            id: "test-function",
            triggers: [{ event: "user.created" }],
            config: {
              rateLimit: {
                limit: 10,
                period: "", // Invalid period
              },
            },
          })
          async handleEvent() {}
        }
      }).toThrow("Rate limit period must be a non-empty string");
    });

    it("should validate concurrency configuration", () => {
      expect(() => {
        @Injectable()
        class TestService {
          @TypedInngestFunction({
            id: "test-function",
            triggers: [{ event: "user.created" }],
            config: {
              concurrency: {
                limit: 0, // Invalid limit
              },
            },
          })
          async handleEvent() {}
        }
      }).toThrow("Concurrency limit must be a positive number");
    });

    it("should validate batch events configuration", () => {
      expect(() => {
        @Injectable()
        class TestService {
          @TypedInngestFunction({
            id: "test-function",
            triggers: [{ event: "user.created" }],
            config: {
              batchEvents: {
                maxSize: 0, // Invalid max size
                timeout: "5s",
              },
            },
          })
          async handleEvent() {}
        }
      }).toThrow("Batch max size must be a positive number");

      expect(() => {
        @Injectable()
        class TestService {
          @TypedInngestFunction({
            id: "test-function",
            triggers: [{ event: "user.created" }],
            config: {
              batchEvents: {
                maxSize: 100,
                timeout: "", // Invalid timeout
              },
            },
          })
          async handleEvent() {}
        }
      }).toThrow("Batch timeout must be a non-empty string");
    });
  });

  describe("createEventDecorator", () => {
    it("should create event-specific decorator", () => {
      const UserCreatedHandler = createEventDecorator<
        TestEventRegistry,
        "user.created"
      >("user.created");

      @Injectable()
      class TestService {
        @UserCreatedHandler({
          id: "handle-user-created",
          name: "Handle User Created",
        })
        async handleUserCreated(
          context: TypedEventContext<TestEventRegistry, "user.created">
        ) {
          return `User ${context.event.data.userId} created`;
        }
      }

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.INNGEST_FUNCTION,
        TestService.prototype,
        "handleUserCreated"
      );

      expect(metadata.triggers).toEqual([{ event: "user.created" }]);
    });

    it("should allow custom triggers in event-specific decorator", () => {
      const UserEventHandler = createEventDecorator<
        TestEventRegistry,
        "user.created"
      >("user.created");

      @Injectable()
      class TestService {
        @UserEventHandler({
          id: "handle-user-events",
          triggers: [{ event: "user.created" }, { event: "user.updated" }],
        })
        async handleUserEvents(context: TypedEventContext<TestEventRegistry>) {
          return "Handled";
        }
      }

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.INNGEST_FUNCTION,
        TestService.prototype,
        "handleUserEvents"
      );

      expect(metadata.triggers).toHaveLength(2);
    });
  });

  describe("CronFunction", () => {
    it("should create cron-based function", () => {
      @Injectable()
      class TestService {
        @CronFunction({
          id: "daily-cleanup",
          name: "Daily Cleanup",
          cron: "0 0 * * *",
          timezone: "UTC",
        })
        async dailyCleanup() {
          return "Cleanup completed";
        }
      }

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.INNGEST_FUNCTION,
        TestService.prototype,
        "dailyCleanup"
      );

      expect(metadata.id).toBe("daily-cleanup");
      expect(metadata.name).toBe("Daily Cleanup");
      expect(metadata.triggers).toEqual([
        {
          cron: "0 0 * * *",
          timezone: "UTC",
        },
      ]);
    });

    it("should work without timezone", () => {
      @Injectable()
      class TestService {
        @CronFunction({
          id: "hourly-task",
          cron: "0 * * * *",
        })
        async hourlyTask() {
          return "Task completed";
        }
      }

      const metadata = Reflect.getMetadata(
        METADATA_KEYS.INNGEST_FUNCTION,
        TestService.prototype,
        "hourlyTask"
      );

      expect(metadata.triggers[0].cron).toBe("0 * * * *");
      expect(metadata.triggers[0].timezone).toBeUndefined();
    });
  });

  describe("type safety", () => {
    it("should enforce event type constraints", () => {
      // This test verifies TypeScript compilation behavior
      @Injectable()
      class TestService {
        @TypedInngestFunction<TestEventRegistry, "user.created">({
          id: "handle-user-created",
          triggers: [{ event: "user.created" }],
        })
        async handleUserCreated(
          context: TypedEventContext<TestEventRegistry, "user.created">
        ) {
          // TypeScript should enforce that context.event.data has the correct type
          const userId: string = context.event.data.userId;
          const email: string = context.event.data.email;
          const name: string = context.event.data.name;

          return `User ${userId} (${email}) named ${name} was created`;
        }
      }

      const instance = new TestService();
      expect(typeof instance.handleUserCreated).toBe("function");
    });

    it("should work with generic event handlers", () => {
      @Injectable()
      class TestService {
        @TypedInngestFunction<TestEventRegistry>({
          id: "handle-any-event",
          triggers: [
            { event: "user.created" },
            { event: "user.updated" },
            { event: "order.completed" },
          ],
        })
        async handleAnyEvent(context: TypedEventContext<TestEventRegistry>) {
          // When handling multiple event types, the data type is a union
          return `Handled event: ${context.event.name}`;
        }
      }

      const instance = new TestService();
      expect(typeof instance.handleAnyEvent).toBe("function");
    });
  });

  describe("error handling", () => {
    it("should wrap unexpected errors in InngestFunctionError", () => {
      // Mock Reflect.defineMetadata to throw an error
      const originalDefineMetadata = Reflect.defineMetadata;
      Reflect.defineMetadata = jest.fn().mockImplementation(() => {
        throw new Error("Unexpected error");
      });

      expect(() => {
        @Injectable()
        class TestService {
          @TypedInngestFunction({
            id: "test-function",
            triggers: [{ event: "user.created" }],
          })
          async handleEvent() {}
        }
      }).toThrow(InngestFunctionError);

      // Restore original function
      Reflect.defineMetadata = originalDefineMetadata;
    });
  });
});
