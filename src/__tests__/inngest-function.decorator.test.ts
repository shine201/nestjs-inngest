import "reflect-metadata";
import {
  InngestFunction,
  getInngestFunctionMetadata,
  isInngestFunction,
  getFunctionConfig,
} from "../decorators/inngest-function.decorator";
import { InngestFunctionConfig } from "../interfaces/inngest-function.interface";
import { InngestFunctionError } from "../errors";
import { ERROR_MESSAGES } from "../constants";

describe("@InngestFunction Decorator", () => {
  describe("basic functionality", () => {
    it("should register function metadata correctly", () => {
      const config: InngestFunctionConfig = {
        id: "test-function",
        name: "Test Function",
        triggers: [{ event: "test.event" }],
      };

      class TestService {
        @InngestFunction(config)
        testMethod() {
          return "test";
        }
      }

      const metadata = getInngestFunctionMetadata(TestService.prototype);
      expect(metadata).toHaveLength(1);
      expect(metadata[0].config.id).toBe("test-function");
      expect(metadata[0].config.name).toBe("Test Function");
      expect(metadata[0].propertyKey).toBe("testMethod");
      expect(metadata[0].handler).toBe(TestService.prototype.testMethod);
    });

    it("should normalize configuration with defaults", () => {
      const config: InngestFunctionConfig = {
        id: "test-function",
        triggers: [{ event: "test.event" }],
      };

      class TestService {
        @InngestFunction(config)
        testMethod() {
          return "test";
        }
      }

      const metadata = getInngestFunctionMetadata(TestService.prototype);
      expect(metadata[0].config.name).toBe("test-function"); // Default to ID
      expect(metadata[0].config.retries).toBe(3); // Default retries
      expect(metadata[0].config.timeout).toBe(30000); // Default timeout
    });

    it("should support multiple functions on the same class", () => {
      class TestService {
        @InngestFunction({
          id: "function-1",
          triggers: [{ event: "test.event1" }],
        })
        method1() {
          return "method1";
        }

        @InngestFunction({
          id: "function-2",
          triggers: [{ event: "test.event2" }],
        })
        method2() {
          return "method2";
        }
      }

      const metadata = getInngestFunctionMetadata(TestService.prototype);
      expect(metadata).toHaveLength(2);
      expect(metadata.map((m) => m.config.id)).toEqual([
        "function-1",
        "function-2",
      ]);
    });
  });

  describe("validation", () => {
    describe("function ID validation", () => {
      it("should require function ID", () => {
        expect(() => {
          class TestService {
            @InngestFunction({
              id: "",
              triggers: [{ event: "test.event" }],
            } as any)
            testMethod() {}
          }
        }).toThrow(InngestFunctionError);

        expect(() => {
          class TestService {
            @InngestFunction({
              triggers: [{ event: "test.event" }],
            } as any)
            testMethod() {}
          }
        }).toThrow(ERROR_MESSAGES.INVALID_FUNCTION_ID);
      });

      it("should validate function ID format", () => {
        expect(() => {
          class TestService {
            @InngestFunction({
              id: "InvalidFunctionId", // Should be kebab-case
              triggers: [{ event: "test.event" }],
            })
            testMethod() {}
          }
        }).toThrow(InngestFunctionError);

        expect(() => {
          class TestService {
            @InngestFunction({
              id: "function_with_underscores", // Should be kebab-case
              triggers: [{ event: "test.event" }],
            })
            testMethod() {}
          }
        }).toThrow("must be in kebab-case format");
      });

      it("should accept valid function IDs", () => {
        expect(() => {
          class TestService {
            @InngestFunction({
              id: "valid-function-id",
              triggers: [{ event: "test.event" }],
            })
            testMethod() {}
          }
        }).not.toThrow();

        expect(() => {
          class TestService {
            @InngestFunction({
              id: "function123",
              triggers: [{ event: "test.event" }],
            })
            testMethod() {}
          }
        }).not.toThrow();
      });

      it("should prevent duplicate function IDs on the same class", () => {
        expect(() => {
          class TestService {
            @InngestFunction({
              id: "duplicate-id",
              triggers: [{ event: "test.event1" }],
            })
            method1() {}

            @InngestFunction({
              id: "duplicate-id",
              triggers: [{ event: "test.event2" }],
            })
            method2() {}
          }
        }).toThrow(ERROR_MESSAGES.DUPLICATE_FUNCTION_ID);
      });
    });

    describe("triggers validation", () => {
      it("should require at least one trigger", () => {
        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [],
            })
            testMethod() {}
          }
        }).toThrow(ERROR_MESSAGES.INVALID_TRIGGERS);

        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
            } as any)
            testMethod() {}
          }
        }).toThrow(ERROR_MESSAGES.INVALID_TRIGGERS);
      });

      it("should validate event triggers", () => {
        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [{ event: "" }],
            })
            testMethod() {}
          }
        }).toThrow("must have a valid event name");

        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [{ event: "InvalidEventName" }], // Should be kebab-case with dots
            })
            testMethod() {}
          }
        }).toThrow("must be in kebab-case format with dots");
      });

      it("should validate cron triggers", () => {
        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [{ cron: "" }],
            })
            testMethod() {}
          }
        }).toThrow("must have a valid cron expression");

        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [{ cron: "invalid cron" }],
            })
            testMethod() {}
          }
        }).toThrow("Invalid cron expression");
      });

      it("should accept valid triggers", () => {
        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [
                { event: "user.created" },
                { event: "user.updated", if: "event.data.important === true" },
                { cron: "0 0 * * *" },
                { cron: "0 0 12 * * *" }, // 6-part cron
              ],
            })
            testMethod() {}
          }
        }).not.toThrow();
      });
    });

    describe("optional fields validation", () => {
      it("should validate function name", () => {
        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              name: "", // Empty name
              triggers: [{ event: "test.event" }],
            })
            testMethod() {}
          }
        }).toThrow("Function name must be a non-empty string");
      });

      it("should validate concurrency", () => {
        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [{ event: "test.event" }],
              concurrency: 0, // Invalid
            })
            testMethod() {}
          }
        }).toThrow("Concurrency limit must be between 1 and 1000");

        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [{ event: "test.event" }],
              concurrency: { limit: 0 }, // Invalid
            })
            testMethod() {}
          }
        }).toThrow("Concurrency limit must be between 1 and 1000");
      });

      it("should validate rate limit", () => {
        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [{ event: "test.event" }],
              rateLimit: { limit: 0, period: "1m" }, // Invalid limit
            })
            testMethod() {}
          }
        }).toThrow("Rate limit must have a valid limit greater than 0");

        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [{ event: "test.event" }],
              rateLimit: { limit: 10, period: "" }, // Invalid period
            })
            testMethod() {}
          }
        }).toThrow("Rate limit must have a valid period string");
      });

      it("should validate retries", () => {
        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [{ event: "test.event" }],
              retries: -1, // Invalid
            })
            testMethod() {}
          }
        }).toThrow("Retries must be a number between 0 and 10");

        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [{ event: "test.event" }],
              retries: 15, // Too high
            })
            testMethod() {}
          }
        }).toThrow("Retries must be a number between 0 and 10");
      });

      it("should validate timeout", () => {
        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [{ event: "test.event" }],
              timeout: 500, // Too low
            })
            testMethod() {}
          }
        }).toThrow("Timeout must be a number between 1000ms");

        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [{ event: "test.event" }],
              timeout: 400000, // Too high
            })
            testMethod() {}
          }
        }).toThrow("Timeout must be a number between 1000ms");
      });
    });
  });

  describe("helper functions", () => {
    it("should detect Inngest functions", () => {
      class TestService {
        @InngestFunction({
          id: "test-function",
          triggers: [{ event: "test.event" }],
        })
        inngestMethod() {}

        regularMethod() {}
      }

      expect(isInngestFunction(TestService.prototype, "inngestMethod")).toBe(
        true,
      );
      expect(isInngestFunction(TestService.prototype, "regularMethod")).toBe(
        false,
      );
    });

    it("should get function configuration", () => {
      const config: InngestFunctionConfig = {
        id: "test-function",
        name: "Test Function",
        triggers: [{ event: "test.event" }],
      };

      class TestService {
        @InngestFunction(config)
        testMethod() {}
      }

      const retrievedConfig = getFunctionConfig(
        TestService.prototype,
        "testMethod",
      );
      expect(retrievedConfig).toBeDefined();
      expect(retrievedConfig!.id).toBe("test-function");
      expect(retrievedConfig!.name).toBe("Test Function");
    });

    it("should return undefined for non-Inngest methods", () => {
      class TestService {
        regularMethod() {}
      }

      const config = getFunctionConfig(TestService.prototype, "regularMethod");
      expect(config).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("should wrap unexpected errors", () => {
      // Mock Reflect.defineMetadata to throw an error
      const originalDefineMetadata = Reflect.defineMetadata;
      Reflect.defineMetadata = jest.fn().mockImplementation(() => {
        throw new Error("Unexpected error");
      });

      try {
        expect(() => {
          class TestService {
            @InngestFunction({
              id: "test-function",
              triggers: [{ event: "test.event" }],
            })
            testMethod() {}
          }
        }).toThrow(InngestFunctionError);
      } finally {
        // Restore original function
        Reflect.defineMetadata = originalDefineMetadata;
      }
    });
  });
});
