import { FastifyHttpAdapter } from "../../adapters/fastify.adapter";
import { PlatformDetector } from "../../adapters/platform-detector";

describe("FastifyHttpAdapter", () => {
  let adapter: FastifyHttpAdapter;

  beforeEach(() => {
    adapter = new FastifyHttpAdapter();
  });

  describe("Platform Detection", () => {
    it("should correctly identify Fastify requests", () => {
      const mockFastifyRequest = {
        method: "POST",
        url: "/api/inngest",
        headers: { "content-type": "application/json" },
        raw: { method: "POST", url: "/api/inngest" },
        server: { address: "127.0.0.1" },
        body: { test: "data" },
        // Note: no 'res' property - this is what makes it Fastify
      };

      expect(adapter.isCompatible(mockFastifyRequest)).toBe(true);
    });

    it("should reject Express requests", () => {
      const mockExpressRequest = {
        res: { status: jest.fn() },
        app: { get: jest.fn() },
        body: { test: "data" },
        headers: { "content-type": "application/json" },
      };

      expect(adapter.isCompatible(mockExpressRequest)).toBe(false);
    });

    it("should be detected by PlatformDetector", () => {
      const mockFastifyRequest = {
        raw: { method: "POST" },
        server: { address: "127.0.0.1" },
      };

      const detectedPlatform =
        PlatformDetector.detectFromRequest(mockFastifyRequest);
      expect(detectedPlatform).toBe("fastify");
    });
  });

  describe("Request Extraction", () => {
    it("should extract request correctly", () => {
      const mockFastifyRequest = {
        body: { message: "test" },
        headers: { "content-type": "application/json" },
        method: "POST",
        url: "/api/inngest",
        raw: { method: "POST", url: "/api/inngest" },
        rawBody: Buffer.from('{"message":"test"}'),
      } as any;

      const extracted = adapter.extractRequest(mockFastifyRequest);

      expect(extracted.body).toEqual({ message: "test" });
      expect(extracted.headers).toEqual({ "content-type": "application/json" });
      expect(extracted.method).toBe("POST");
      expect(extracted.url).toBe("/api/inngest");
      expect(extracted.rawBody).toEqual(Buffer.from('{"message":"test"}'));
    });
  });

  describe("Response Wrapping", () => {
    it("should wrap Fastify response correctly", () => {
      const mockFastifyResponse = {
        status: jest.fn().mockReturnThis(),
        code: jest.fn().mockReturnThis(),
        header: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      const wrapped = adapter.wrapResponse(mockFastifyResponse);

      wrapped.status(200);
      expect(mockFastifyResponse.status).toHaveBeenCalledWith(200);

      wrapped.header("Content-Type", "application/json");
      expect(mockFastifyResponse.header).toHaveBeenCalledWith(
        "Content-Type",
        "application/json",
      );

      wrapped.send({ status: "ok" });
      expect(mockFastifyResponse.send).toHaveBeenCalledWith({ status: "ok" });
    });
  });

  describe("Raw Body Extraction", () => {
    it("should extract raw body from rawBody property", () => {
      const mockRequest = {
        rawBody: Buffer.from('{"test":"data"}'),
        body: { test: "data" },
        headers: {},
        method: "POST",
        url: "/api/inngest",
        raw: {},
      } as any;

      const rawBody = adapter.getRawBody(mockRequest);
      expect(rawBody).toEqual(Buffer.from('{"test":"data"}'));
    });

    it("should extract raw body from raw.rawBody property", () => {
      const mockRequest = {
        raw: {
          rawBody: Buffer.from('{"test":"data"}'),
        },
        body: { test: "data" },
        headers: {},
        method: "POST",
        url: "/api/inngest",
      } as any;

      const rawBody = adapter.getRawBody(mockRequest);
      expect(rawBody).toEqual(Buffer.from('{"test":"data"}'));
    });

    it("should fallback to JSON stringify when no raw body", () => {
      const mockRequest = {
        body: { test: "data" },
        headers: {},
        method: "POST",
        url: "/api/inngest",
        raw: {},
      } as any;

      const rawBody = adapter.getRawBody(mockRequest);
      expect(rawBody).toBe('{"test":"data"}');
    });

    it("should handle empty body", () => {
      const mockRequest = {
        body: undefined,
        headers: {},
        method: "POST",
        url: "/api/inngest",
        raw: {},
      } as any;

      const rawBody = adapter.getRawBody(mockRequest);
      expect(rawBody).toBe("");
    });
  });

  describe("Platform Name", () => {
    it("should return correct platform name", () => {
      expect(adapter.getPlatformName()).toBe("fastify");
    });
  });
});
