import { ExpressHttpAdapter } from "../../adapters/express.adapter";
import { PlatformDetector } from "../../adapters/platform-detector";

describe("ExpressHttpAdapter", () => {
  let adapter: ExpressHttpAdapter;

  beforeEach(() => {
    adapter = new ExpressHttpAdapter();
  });

  describe("Platform Detection", () => {
    it("should correctly identify Express requests", () => {
      const mockExpressRequest = {
        method: "POST",
        url: "/api/inngest",
        headers: { "content-type": "application/json" },
        res: { status: jest.fn() },
        app: { get: jest.fn() },
        body: { test: "data" },
      };

      expect(adapter.isCompatible(mockExpressRequest)).toBe(true);
    });

    it("should reject Fastify requests", () => {
      const mockFastifyRequest = {
        method: "POST",
        url: "/api/inngest",
        headers: { "content-type": "application/json" },
        raw: { method: "POST" },
        server: { address: "127.0.0.1" },
        body: { test: "data" },
        // Note: no 'res' property
      };

      expect(adapter.isCompatible(mockFastifyRequest)).toBe(false);
    });

    it("should be detected by PlatformDetector", () => {
      const mockExpressRequest = {
        res: { status: jest.fn() },
        app: { get: jest.fn() },
      };

      const detectedPlatform =
        PlatformDetector.detectFromRequest(mockExpressRequest);
      expect(detectedPlatform).toBe("express");
    });
  });

  describe("Request Extraction", () => {
    it("should extract request correctly", () => {
      const mockExpressRequest = {
        body: { message: "test" },
        headers: { "content-type": "application/json" },
        method: "POST",
        url: "/api/inngest",
        rawBody: '{"message":"test"}',
      } as any;

      const extracted = adapter.extractRequest(mockExpressRequest);

      expect(extracted.body).toEqual({ message: "test" });
      expect(extracted.headers).toEqual({ "content-type": "application/json" });
      expect(extracted.method).toBe("POST");
      expect(extracted.url).toBe("/api/inngest");
      expect(extracted.rawBody).toBe('{"message":"test"}');
    });
  });

  describe("Response Wrapping", () => {
    it("should wrap Express response correctly", () => {
      const mockExpressResponse = {
        status: jest.fn().mockReturnThis(),
        header: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      } as any;

      const wrapped = adapter.wrapResponse(mockExpressResponse);

      wrapped.status(200);
      expect(mockExpressResponse.status).toHaveBeenCalledWith(200);

      wrapped.header("Content-Type", "application/json");
      expect(mockExpressResponse.header).toHaveBeenCalledWith(
        "Content-Type",
        "application/json",
      );

      wrapped.send({ status: "ok" });
      expect(mockExpressResponse.send).toHaveBeenCalledWith({ status: "ok" });

      wrapped.json({ data: "test" });
      expect(mockExpressResponse.json).toHaveBeenCalledWith({ data: "test" });
    });
  });

  describe("Raw Body Extraction", () => {
    it("should extract raw body from rawBody property", () => {
      const mockRequest = {
        rawBody: '{"test":"data"}',
        body: { test: "data" },
      } as any;

      const rawBody = adapter.getRawBody(mockRequest);
      expect(rawBody).toBe('{"test":"data"}');
    });

    it("should extract raw body from Buffer rawBody", () => {
      const mockRequest = {
        rawBody: Buffer.from('{"test":"data"}'),
        body: { test: "data" },
      } as any;

      const rawBody = adapter.getRawBody(mockRequest);
      expect(rawBody).toEqual(Buffer.from('{"test":"data"}'));
    });

    it("should fallback to JSON stringify when no raw body", () => {
      const mockRequest = {
        body: { test: "data" },
      } as any;

      const rawBody = adapter.getRawBody(mockRequest);
      expect(rawBody).toBe('{"test":"data"}');
    });

    it("should handle empty body", () => {
      const mockRequest = {
        body: undefined,
      } as any;

      const rawBody = adapter.getRawBody(mockRequest);
      expect(rawBody).toBe("");
    });

    it("should handle null body", () => {
      const mockRequest = {
        body: null,
      } as any;

      const rawBody = adapter.getRawBody(mockRequest);
      expect(rawBody).toBe("");
    });
  });

  describe("Platform Name", () => {
    it("should return correct platform name", () => {
      expect(adapter.getPlatformName()).toBe("express");
    });
  });

  describe("Compatibility with Express-specific features", () => {
    it("should handle Express request with res property", () => {
      const mockExpressRequest = {
        method: "GET",
        url: "/test",
        headers: {},
        res: {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        },
        app: {
          get: jest.fn(),
        },
      };

      expect(adapter.isCompatible(mockExpressRequest)).toBe(true);
    });

    it("should handle Express request with app property", () => {
      const mockExpressRequest = {
        method: "GET",
        url: "/test",
        headers: {},
        res: { status: jest.fn() },
        app: {
          locals: {},
          mountpath: "/",
        },
      };

      expect(adapter.isCompatible(mockExpressRequest)).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should reject requests without res property", () => {
      const mockRequest = {
        method: "GET",
        url: "/test",
        headers: {},
        app: { get: jest.fn() },
        // No res property
      };

      expect(adapter.isCompatible(mockRequest)).toBe(false);
    });

    it("should accept requests with res property even without app property", () => {
      const mockRequest = {
        method: "GET",
        url: "/test",
        headers: {},
        res: { status: jest.fn() },
        // No app property - but that's OK for Express, res is the key identifier
      };

      expect(adapter.isCompatible(mockRequest)).toBe(true);
    });

    it("should handle malformed request objects gracefully", () => {
      const malformedRequest = null;

      expect(adapter.isCompatible(malformedRequest)).toBe(false);
    });

    it("should handle request with both string and Buffer rawBody", () => {
      const stringRawBodyRequest = {
        rawBody: '{"string":"body"}',
        body: { string: "body" },
      } as any;

      const bufferRawBodyRequest = {
        rawBody: Buffer.from('{"buffer":"body"}'),
        body: { buffer: "body" },
      } as any;

      expect(adapter.getRawBody(stringRawBodyRequest)).toBe(
        '{"string":"body"}',
      );
      expect(adapter.getRawBody(bufferRawBodyRequest)).toEqual(
        Buffer.from('{"buffer":"body"}'),
      );
    });
  });
});
