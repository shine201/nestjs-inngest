import {
  FastifyHttpAdapter,
  FastifyRequestAdapter,
  FastifyResponseAdapter,
} from "../fastify.adapter";

describe("FastifyHttpAdapter", () => {
  let adapter: FastifyHttpAdapter;

  beforeEach(() => {
    adapter = new FastifyHttpAdapter();
  });

  describe("extractRequest", () => {
    it("should extract request data correctly", () => {
      const mockFastifyReq = {
        method: "POST",
        url: "/api/inngest",
        headers: {
          "content-type": "application/json",
          "x-inngest-signature": "test",
        },
        body: { test: "data" },
        rawBody: Buffer.from("raw data"),
        raw: {},
      } as any;

      const adaptedReq = adapter.extractRequest(mockFastifyReq);

      expect(adaptedReq.method).toBe("POST");
      expect(adaptedReq.url).toBe("/api/inngest");
      expect(adaptedReq.headers).toEqual(mockFastifyReq.headers);
      expect(adaptedReq.body).toEqual({ test: "data" });
      expect(adaptedReq.rawBody).toEqual(Buffer.from("raw data"));
    });
  });

  describe("wrapResponse", () => {
    it("should create response wrapper", () => {
      const mockFastifyReply = {
        status: jest.fn().mockReturnThis(),
        header: jest.fn().mockReturnThis(),
        send: jest.fn(),
        code: jest.fn().mockReturnThis(),
      } as any;

      const adaptedRes = adapter.wrapResponse(mockFastifyReply);

      expect(adaptedRes).toBeInstanceOf(FastifyResponseAdapter);
    });
  });

  describe("getRawBody", () => {
    it("should get raw body from request", () => {
      const mockReq = {
        rawBody: Buffer.from("test raw body"),
      } as any;

      const rawBody = adapter.getRawBody(mockReq);
      expect(rawBody).toEqual(Buffer.from("test raw body"));
    });

    it("should get raw body from underlying request", () => {
      const mockReq = {
        raw: {
          rawBody: "test raw body from raw",
        },
      } as any;

      const rawBody = adapter.getRawBody(mockReq);
      expect(rawBody).toBe("test raw body from raw");
    });

    it("should fallback to JSON stringify", () => {
      const mockReq = {
        body: { test: "data" },
      } as any;

      const rawBody = adapter.getRawBody(mockReq);
      expect(rawBody).toBe('{"test":"data"}');
    });

    it("should return empty string if no body", () => {
      const mockReq = {} as any;

      const rawBody = adapter.getRawBody(mockReq);
      expect(rawBody).toBe("");
    });
  });

  describe("getPlatformName", () => {
    it("should return fastify", () => {
      expect(adapter.getPlatformName()).toBe("fastify");
    });
  });

  describe("isCompatible", () => {
    it("should return true for Fastify request", () => {
      const mockFastifyReq = {
        method: "POST",
        url: "/api/inngest",
        headers: {},
        raw: {}, // Fastify-specific property
        // No 'res' property (unlike Express)
      };

      expect(adapter.isCompatible(mockFastifyReq)).toBe(true);
    });

    it("should return false for Express request", () => {
      const mockExpressReq = {
        method: "POST",
        url: "/api/inngest",
        headers: {},
        res: {}, // Express-specific property
      };

      expect(adapter.isCompatible(mockExpressReq)).toBe(false);
    });

    it("should return false for invalid request", () => {
      const mockInvalidReq = {
        method: "POST",
        // missing required properties
      };

      expect(adapter.isCompatible(mockInvalidReq)).toBe(false);
    });

    it("should return false for null/undefined", () => {
      expect(adapter.isCompatible(null)).toBe(false);
      expect(adapter.isCompatible(undefined)).toBe(false);
    });
  });
});

describe("FastifyResponseAdapter", () => {
  let mockFastifyReply: any;
  let adapter: FastifyResponseAdapter;

  beforeEach(() => {
    mockFastifyReply = {
      status: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      send: jest.fn(),
      code: jest.fn().mockReturnThis(),
    };
    adapter = new FastifyResponseAdapter(mockFastifyReply);
  });

  it("should set status code", () => {
    const result = adapter.status(200);

    expect(mockFastifyReply.status).toHaveBeenCalledWith(200);
    expect(result).toBe(adapter);
  });

  it("should set header", () => {
    const result = adapter.header("Content-Type", "application/json");

    expect(mockFastifyReply.header).toHaveBeenCalledWith(
      "Content-Type",
      "application/json",
    );
    expect(result).toBe(adapter);
  });

  it("should send data", () => {
    adapter.send("test data");

    expect(mockFastifyReply.send).toHaveBeenCalledWith("test data");
  });

  it("should send json (automatically serialized)", () => {
    const testData = { test: "data" };
    adapter.json(testData);

    // Fastify automatically serializes objects to JSON
    expect(mockFastifyReply.send).toHaveBeenCalledWith(testData);
  });
});
