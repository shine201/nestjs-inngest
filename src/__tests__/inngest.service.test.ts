import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { InngestService } from "../services/inngest.service";
import { MergedInngestConfig } from "../utils/config-validation";
import { InngestEventError } from "../errors";
import { INNGEST_CONFIG, ERROR_MESSAGES } from "../constants";
import { InngestEvent } from "../interfaces/inngest-event.interface";

// Mock the Inngest client
jest.mock("inngest", () => ({
  Inngest: jest.fn().mockImplementation((config) => ({
    send: jest.fn(),
    config,
  })),
}));

describe("InngestService", () => {
  let service: InngestService;
  let mockConfig: MergedInngestConfig;
  let mockInngestClient: any;

  beforeEach(async () => {
    mockConfig = {
      appId: "test-app",
      eventKey: "test-event-key",
      signingKey: "test-signing-key",
      baseUrl: undefined,
      endpoint: "/api/inngest",
      isDev: false,
      logger: true,
      env: "test",
      timeout: 30000,
      maxBatchSize: 100,
      strict: false,
      retry: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
      },
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
    mockInngestClient = service.getClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("initialization", () => {
    it("should be defined", () => {
      expect(service).toBeDefined();
    });

    it("should create Inngest client with correct config", () => {
      const { Inngest } = require("inngest");
      expect(Inngest).toHaveBeenCalledWith({
        id: "test-app",
        isDev: false,
        eventKey: "test-event-key",
      });
    });

    it("should handle missing event key in client config", async () => {
      const configWithoutEventKey = { ...mockConfig, eventKey: undefined };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          InngestService,
          {
            provide: INNGEST_CONFIG,
            useValue: configWithoutEventKey,
          },
        ],
      }).compile();

      const serviceWithoutEventKey = module.get<InngestService>(InngestService);
      expect(serviceWithoutEventKey).toBeDefined();
    });
  });

  describe("getClient", () => {
    it("should return the Inngest client instance", () => {
      const client = service.getClient();
      expect(client).toBeDefined();
      expect((client as any).config.id).toBe("test-app");
    });
  });

  describe("send - single event", () => {
    const validEvent: InngestEvent = {
      name: "test.event",
      data: { message: "Hello World" },
    };

    it("should send a single event successfully", async () => {
      mockInngestClient.send.mockResolvedValue(undefined);

      await service.send(validEvent);

      expect(mockInngestClient.send).toHaveBeenCalledWith([validEvent]);
    });

    it("should throw error when event key is missing", async () => {
      const configWithoutEventKey = { ...mockConfig, eventKey: undefined };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          InngestService,
          {
            provide: INNGEST_CONFIG,
            useValue: configWithoutEventKey,
          },
        ],
      }).compile();

      const serviceWithoutEventKey = module.get<InngestService>(InngestService);

      await expect(serviceWithoutEventKey.send(validEvent)).rejects.toThrow(
        InngestEventError,
      );
      await expect(serviceWithoutEventKey.send(validEvent)).rejects.toThrow(
        "Event key is required for sending events",
      );
    });

    it("should validate event name", async () => {
      const invalidEvent = { ...validEvent, name: "" };

      await expect(service.send(invalidEvent)).rejects.toThrow(
        InngestEventError,
      );
      await expect(service.send(invalidEvent)).rejects.toThrow(
        /event\.name.*non-empty string/,
      );
    });

    it("should validate event data", async () => {
      const invalidEvent = { ...validEvent, data: null };

      await expect(service.send(invalidEvent)).rejects.toThrow(
        InngestEventError,
      );
      await expect(service.send(invalidEvent)).rejects.toThrow(
        /event\.data.*required/i,
      );
    });

    it("should validate user object if present", async () => {
      const invalidEvent = { ...validEvent, user: { id: "" } };

      await expect(service.send(invalidEvent)).rejects.toThrow(
        InngestEventError,
      );
      await expect(service.send(invalidEvent)).rejects.toThrow(
        /user\.id.*non-empty string/,
      );
    });

    it("should validate timestamp if present", async () => {
      const invalidEvent = { ...validEvent, ts: -1 };

      await expect(service.send(invalidEvent)).rejects.toThrow(
        InngestEventError,
      );
      await expect(service.send(invalidEvent)).rejects.toThrow(
        /event\.ts.*range/,
      );
    });

    it("should handle Inngest client errors", async () => {
      const clientError = new Error("Inngest API error");
      mockInngestClient.send.mockRejectedValue(clientError);

      await expect(service.send(validEvent)).rejects.toThrow(InngestEventError);
      await expect(service.send(validEvent)).rejects.toThrow(
        ERROR_MESSAGES.EVENT_SEND_FAILED,
      );
    });
  });

  describe("send - multiple events", () => {
    const validEvents: InngestEvent[] = [
      { name: "test.event1", data: { message: "Hello" } },
      { name: "test.event2", data: { message: "World" } },
    ];

    it("should send multiple events successfully", async () => {
      mockInngestClient.send.mockResolvedValue(undefined);

      await service.send(validEvents);

      expect(mockInngestClient.send).toHaveBeenCalledWith(validEvents);
    });

    it("should validate batch size", async () => {
      const tooManyEvents = Array(101).fill(validEvents[0]);

      await expect(service.send(tooManyEvents)).rejects.toThrow(
        InngestEventError,
      );
      await expect(service.send(tooManyEvents)).rejects.toThrow(
        "Batch size exceeds maximum allowed",
      );
    });

    it("should validate empty batch", async () => {
      await expect(service.send([])).rejects.toThrow(InngestEventError);
      await expect(service.send([])).rejects.toThrow(
        "At least one event must be provided",
      );
    });

    it("should validate each event in batch", async () => {
      const invalidBatch = [
        validEvents[0],
        { ...validEvents[1], name: "" }, // Invalid event
      ];

      await expect(service.send(invalidBatch)).rejects.toThrow(
        InngestEventError,
      );
      await expect(service.send(invalidBatch)).rejects.toThrow(
        /validation error/,
      );
    });
  });

  describe("strict mode validation", () => {
    beforeEach(async () => {
      const strictConfig = { ...mockConfig, strict: true };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          InngestService,
          {
            provide: INNGEST_CONFIG,
            useValue: strictConfig,
          },
        ],
      }).compile();

      service = module.get<InngestService>(InngestService);
      mockInngestClient = service.getClient();
    });

    it("should validate event name format in strict mode", async () => {
      const invalidEvent: InngestEvent = {
        name: "InvalidEventName", // Should be kebab-case
        data: { message: "test" },
      };

      await expect(service.send(invalidEvent)).rejects.toThrow(
        InngestEventError,
      );
      await expect(service.send(invalidEvent)).rejects.toThrow(
        "must be in kebab-case format",
      );
    });

    it("should accept valid event names in strict mode", async () => {
      const validEvent: InngestEvent = {
        name: "user.created",
        data: { userId: "123" },
      };

      mockInngestClient.send.mockResolvedValue(undefined);
      await expect(service.send(validEvent)).resolves.not.toThrow();
    });

    it("should validate data serializability in strict mode", async () => {
      const circularData: any = {};
      circularData.self = circularData;

      const invalidEvent: InngestEvent = {
        name: "test.event",
        data: circularData,
      };

      await expect(service.send(invalidEvent)).rejects.toThrow(
        InngestEventError,
      );
      await expect(service.send(invalidEvent)).rejects.toThrow(/serializable/);
    });
  });

  describe("retry mechanism", () => {
    it("should retry on retryable errors", async () => {
      const validEvent: InngestEvent = {
        name: "test.event",
        data: { message: "Hello World" },
      };

      // Mock a retryable error (network error)
      const networkError = new Error("ECONNRESET");
      mockInngestClient.send
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(undefined);

      await service.send(validEvent);

      // Should have been called 3 times (initial + 2 retries)
      expect(mockInngestClient.send).toHaveBeenCalledTimes(3);
    });

    it("should not retry on non-retryable errors", async () => {
      const validEvent: InngestEvent = {
        name: "test.event",
        data: { message: "Hello World" },
      };

      // Mock a non-retryable error (4xx client error)
      const clientError = new Error("Bad Request") as any;
      clientError.status = 400;
      mockInngestClient.send.mockRejectedValue(clientError);

      await expect(service.send(validEvent)).rejects.toThrow(InngestEventError);

      // Should have been called only once (no retries)
      expect(mockInngestClient.send).toHaveBeenCalledTimes(1);
    });

    it("should exhaust retries and throw error", async () => {
      const validEvent: InngestEvent = {
        name: "test.event",
        data: { message: "Hello World" },
      };

      // Mock persistent retryable error
      const networkError = new Error("ECONNRESET");
      mockInngestClient.send.mockRejectedValue(networkError);

      await expect(service.send(validEvent)).rejects.toThrow(InngestEventError);

      // Should have been called maxAttempts times
      expect(mockInngestClient.send).toHaveBeenCalledTimes(3);
    });
  });

  describe("batch sending", () => {
    const createEvents = (count: number): InngestEvent[] => {
      return Array.from({ length: count }, (_, i) => ({
        name: `test.event${i + 1}`,
        data: { index: i + 1 },
      }));
    };

    it("should send batch of events successfully", async () => {
      const events = createEvents(5);
      mockInngestClient.send.mockResolvedValue(undefined);

      await service.sendBatch(events);

      expect(mockInngestClient.send).toHaveBeenCalledWith(events);
    });

    it("should split large batches", async () => {
      // Create more events than the batch size
      const events = createEvents(150); // Exceeds default maxBatchSize of 100
      mockInngestClient.send.mockResolvedValue(undefined);

      await service.sendBatch(events);

      // Should have been called twice (100 + 50)
      expect(mockInngestClient.send).toHaveBeenCalledTimes(2);
      expect(mockInngestClient.send).toHaveBeenNthCalledWith(
        1,
        events.slice(0, 100),
      );
      expect(mockInngestClient.send).toHaveBeenNthCalledWith(
        2,
        events.slice(100, 150),
      );
    });

    it("should validate all events before sending", async () => {
      const events = [
        { name: "test.event1", data: { message: "valid" } },
        { name: "", data: { message: "invalid" } }, // Invalid event
      ];

      await expect(service.sendBatch(events)).rejects.toThrow(
        InngestEventError,
      );
      expect(mockInngestClient.send).not.toHaveBeenCalled();
    });

    it("should require event key for batch sending", async () => {
      const configWithoutEventKey = { ...mockConfig, eventKey: undefined };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          InngestService,
          {
            provide: INNGEST_CONFIG,
            useValue: configWithoutEventKey,
          },
        ],
      }).compile();

      const serviceWithoutEventKey = module.get<InngestService>(InngestService);
      const events = createEvents(5);

      await expect(serviceWithoutEventKey.sendBatch(events)).rejects.toThrow(
        InngestEventError,
      );
      await expect(serviceWithoutEventKey.sendBatch(events)).rejects.toThrow(
        "Event key is required for sending events",
      );
    });
  });

  describe("utility methods", () => {
    it("should return config", () => {
      const config = service.getConfig();
      expect(config).toEqual(mockConfig);
      expect(config).not.toBe(mockConfig); // Should be a copy
    });

    it("should check if can send events", () => {
      expect(service.canSendEvents()).toBe(true);
    });

    it("should return health status", () => {
      const health = service.getHealthStatus();
      expect(health).toEqual({
        status: "healthy",
        appId: "test-app",
        canSendEvents: true,
        isDev: false,
      });
    });
  });
});
