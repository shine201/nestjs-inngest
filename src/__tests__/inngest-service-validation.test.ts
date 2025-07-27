import { Test, TestingModule } from "@nestjs/testing";
import { InngestService } from "../services/inngest.service";
import { INNGEST_CONFIG } from "../constants";
import { MergedInngestConfig } from "../utils/config-validation";
import { InngestEventError } from "../errors";
import {
  InngestEvent,
  EventValidationSchema,
  DefaultEventRegistry,
} from "../interfaces/inngest-event.interface";
import { ValidationResult } from "../utils/validation-error-reporter";

// Mock Inngest client
jest.mock("inngest", () => ({
  Inngest: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
}));

describe("InngestService - Enhanced Validation", () => {
  let service: InngestService;
  let mockConfig: MergedInngestConfig;

  beforeEach(async () => {
    mockConfig = {
      appId: "test-app",
      eventKey: "test-event-key",
      signingKey: "test-signing-key",
      isDev: false,
      baseUrl: "https://api.inngest.com",
      endpoint: "/api/inngest",
      strict: true,
      maxBatchSize: 100,
      retry: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
      },
      timeout: 30000,
      logger: true,
      env: "production" as const,
      development: {
        enabled: false,
        disableSignatureVerification: false,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InngestService,
        {
          provide: INNGEST_CONFIG,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<InngestService>(InngestService);
  });

  describe("validateEventWithDetails", () => {
    it("should return valid result for correct event", () => {
      const event: InngestEvent = {
        name: "user.created",
        data: {
          userId: "user-123",
          email: "test@example.com",
        },
        user: { id: "admin-123" },
        ts: Date.now(),
      };

      const result = service.validateEventWithDetails(event);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary).toBeUndefined();
    });

    it("should return detailed errors for invalid event", () => {
      const event = {
        name: "", // invalid name
        data: null, // invalid data
        user: { email: "test@example.com" }, // missing user.id
        ts: -1, // invalid timestamp
      } as any;

      const result = service.validateEventWithDetails(event);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.summary).toBeDefined();

      const errorCodes = result.errors.map((e) => e.code);
      expect(errorCodes).toContain("REQUIRED_FIELD");
      expect(errorCodes).toContain("INVALID_FORMAT");
      expect(errorCodes).toContain("OUT_OF_RANGE");
    });

    it("should validate event name format in strict mode", () => {
      const event: InngestEvent = {
        name: "Invalid.Name.Format", // uppercase not allowed in strict mode
        data: { test: true },
      };

      const result = service.validateEventWithDetails(event);
      expect(result.isValid).toBe(false);
      
      const formatError = result.errors.find(
        (e) => e.code === "INVALID_FORMAT" && e.path === "event.name"
      );
      expect(formatError).toBeDefined();
    });

    it("should detect oversized event data", () => {
      const event: InngestEvent = {
        name: "test.event",
        data: {
          largeField: "x".repeat(1024 * 1024 + 1), // > 1MB
        },
      };

      const result = service.validateEventWithDetails(event);
      expect(result.isValid).toBe(false);
      
      const sizeError = result.errors.find((e) => e.code === "DATA_TOO_LARGE");
      expect(sizeError).toBeDefined();
    });

    it("should detect non-serializable data", () => {
      const circularObj: any = { name: "test" };
      circularObj.self = circularObj;

      const event: InngestEvent = {
        name: "test.event",
        data: circularObj,
      };

      const result = service.validateEventWithDetails(event);
      expect(result.isValid).toBe(false);
      
      const serializationError = result.errors.find(
        (e) => e.code === "NOT_SERIALIZABLE"
      );
      expect(serializationError).toBeDefined();
    });
  });

  describe("schema registration and validation", () => {
    beforeEach(() => {
      // Register test schema
      const userCreatedSchema: EventValidationSchema<{
        userId: string;
        email: string;
        name?: string;
      }> = {
        validate: (data): data is { userId: string; email: string; name?: string } => {
          return (
            typeof data === "object" &&
            data !== null &&
            typeof (data as any).userId === "string" &&
            typeof (data as any).email === "string" &&
            ((data as any).name === undefined || typeof (data as any).name === "string")
          );
        },
        description: "User creation event",
        version: "1.0.0",
      };

      service.registerEventSchema("user.created" as string & keyof DefaultEventRegistry, userCreatedSchema);
    });

    it("should register event schema successfully", () => {
      expect(service.hasEventSchema("user.created")).toBe(true);
      
      const schemas = service.getEventSchemas();
      expect(schemas["user.created"]).toBeDefined();
    });

    it("should validate event against registered schema", () => {
      const validEvent: InngestEvent = {
        name: "user.created",
        data: {
          userId: "user-123",
          email: "test@example.com",
          name: "John Doe",
        },
      };

      const result = service.validateEventWithDetails(validEvent);
      expect(result.isValid).toBe(true);
    });

    it("should detect schema validation failures", () => {
      const invalidEvent: InngestEvent = {
        name: "user.created",
        data: {
          userId: "user-123",
          // missing email
          invalidField: "should not be here",
        } as any,
      };

      const result = service.validateEventWithDetails(invalidEvent);
      expect(result.isValid).toBe(false);
      
      const schemaError = result.errors.find(
        (e) => e.code === "SCHEMA_VALIDATION_FAILED"
      );
      expect(schemaError).toBeDefined();
    });

    it("should register multiple schemas", () => {
      const schemas = {
        "order.completed": {
          validate: (data: any) => 
            typeof data === "object" && 
            typeof data.orderId === "string" && 
            typeof data.amount === "number",
          description: "Order completion event",
        },
        "system.health": {
          validate: (data: any) => 
            typeof data === "object" && 
            ["healthy", "degraded", "unhealthy"].includes(data.status),
          description: "System health check event",
        },
      } as any;

      service.registerEventSchemas(schemas);

      expect(service.hasEventSchema("order.completed")).toBe(true);
      expect(service.hasEventSchema("system.health")).toBe(true);
    });
  });

  describe("integration with send methods", () => {
    beforeEach(() => {
      // Mock the Inngest client send method
      const mockSend = jest.fn().mockResolvedValue(undefined);
      (service as any).inngestClient.send = mockSend;
    });

    it("should validate event before sending", async () => {
      const validEvent: InngestEvent = {
        name: "test.event",
        data: { message: "hello" },
      };

      await expect(service.send(validEvent)).resolves.not.toThrow();
    });

    it("should throw validation error on invalid event", async () => {
      const invalidEvent = {
        name: "", // invalid name
        data: null, // invalid data
      } as any;

      await expect(service.send(invalidEvent)).rejects.toThrow(InngestEventError);
    });

    it("should provide detailed error information", async () => {
      const invalidEvent = {
        name: "Invalid Name Format",
        data: { test: true },
        user: {}, // missing user.id
      } as any;

      try {
        await service.send(invalidEvent);
        fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(InngestEventError);
        const inngestError = error as InngestEventError;
        
        // Check that validation details are included
        expect(inngestError.context?.validationErrors).toBeDefined();
        expect(inngestError.context?.detailedReport).toBeDefined();
        expect(inngestError.context?.detailedReport).toContain("Validation failed");
      }
    });

    it("should validate batch events", async () => {
      const events = [
        {
          name: "valid.event",
          data: { message: "hello" },
        },
        {
          name: "", // invalid name
          data: null, // invalid data
        },
      ] as InngestEvent[];

      await expect(service.send(events)).rejects.toThrow(InngestEventError);
    });
  });

  describe("schema-based validation in batch operations", () => {
    beforeEach(() => {
      // Register schema for testing
      const testSchema: EventValidationSchema<{ message: string }> = {
        validate: (data): data is { message: string } => {
          return typeof data === "object" && typeof (data as any).message === "string";
        },
      };

      service.registerEventSchema("test.event" as string & keyof DefaultEventRegistry, testSchema);
      
      // Mock the Inngest client
      (service as any).inngestClient.send = jest.fn().mockResolvedValue(undefined);
    });

    it("should validate all events against schemas in batch", async () => {
      const events = [
        {
          name: "test.event",
          data: { message: "valid message" },
        },
        {
          name: "test.event",
          data: { message: 123 }, // invalid: message should be string
        },
      ] as InngestEvent[];

      await expect(service.sendBatch(events)).rejects.toThrow(InngestEventError);
    });

    it("should pass batch validation when all events are valid", async () => {
      const events = [
        {
          name: "test.event",
          data: { message: "first message" },
        },
        {
          name: "test.event",
          data: { message: "second message" },
        },
      ] as InngestEvent[];

      await expect(service.sendBatch(events)).resolves.not.toThrow();
    });
  });

  describe("strict mode validation", () => {
    it("should enforce strict event name format", () => {
      const event: InngestEvent = {
        name: "User.Created", // uppercase not allowed in strict mode
        data: { test: true },
      };

      const result = service.validateEventWithDetails(event);
      expect(result.isValid).toBe(false);
      
      const nameError = result.errors.find(
        (e) => e.path === "event.name" && e.code === "INVALID_FORMAT"
      );
      expect(nameError).toBeDefined();
      expect(nameError?.message).toContain("kebab-case");
    });

    it("should allow more flexible names in non-strict mode", async () => {
      // Create service with non-strict config
      const nonStrictConfig = { ...mockConfig, strict: false };
      
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          InngestService,
          {
            provide: INNGEST_CONFIG,
            useValue: nonStrictConfig,
          },
        ],
      }).compile();

      const nonStrictService = module.get<InngestService>(InngestService);
      
      const event: InngestEvent = {
        name: "User_Created", // underscore allowed in non-strict mode
        data: { test: true },
      };

      const result = nonStrictService.validateEventWithDetails(event);
      expect(result.isValid).toBe(true);
    });
  });

  describe("error context and reporting", () => {
    it("should provide path-specific error information", () => {
      const event = {
        name: "test.event",
        data: { test: true },
        user: {
          email: "test@example.com", // missing id
        },
        ts: "invalid-timestamp", // wrong type
      } as any;

      const result = service.validateEventWithDetails(event);
      expect(result.isValid).toBe(false);

      // Check specific error paths
      const userIdError = result.errors.find((e) => e.path === "event.user.id");
      const timestampError = result.errors.find((e) => e.path === "event.ts");

      expect(userIdError).toBeDefined();
      expect(timestampError).toBeDefined();
      expect(userIdError?.code).toBe("REQUIRED_FIELD");
      expect(timestampError?.code).toBe("TYPE_MISMATCH");
    });

    it("should generate helpful error summaries", () => {
      const event = {
        name: "",
        data: null,
        user: {},
      } as any;

      const result = service.validateEventWithDetails(event);
      expect(result.summary).toContain("validation error");
      expect(result.summary).toContain("event.name");
    });
  });
});