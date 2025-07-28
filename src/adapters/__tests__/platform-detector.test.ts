import { PlatformDetector } from "../platform-detector";
import { ExpressHttpAdapter } from "../express.adapter";
import { FastifyHttpAdapter } from "../fastify.adapter";

describe("PlatformDetector", () => {
  describe("detectPlatform", () => {
    it("should detect available platforms", () => {
      const result = PlatformDetector.detectPlatform();

      expect(result.platform).toBeDefined();
      expect(result.adapter).toBeDefined();
      expect(typeof result.available).toBe("boolean");
    });

    it("should return express adapter by default", () => {
      const result = PlatformDetector.detectPlatform();

      // Should fallback to Express if no specific platform detected
      expect(result.adapter).toBe(ExpressHttpAdapter);
    });
  });

  describe("getPlatformAdapter", () => {
    it("should create Express adapter", () => {
      const adapter = PlatformDetector.getPlatformAdapter("express");
      expect(adapter).toBeInstanceOf(ExpressHttpAdapter);
    });

    it("should create Fastify adapter", () => {
      const adapter = PlatformDetector.getPlatformAdapter("fastify");
      expect(adapter).toBeInstanceOf(FastifyHttpAdapter);
    });

    it("should throw error for unsupported platform", () => {
      expect(() => {
        PlatformDetector.getPlatformAdapter("unknown" as any);
      }).toThrow("Unsupported HTTP platform: unknown");
    });
  });

  describe("detectFromRequest", () => {
    it("should detect Express request", () => {
      const mockExpressReq = {
        method: "POST",
        url: "/api/inngest",
        headers: { "content-type": "application/json" },
        body: {},
        res: {}, // Express-specific property
      };

      const platform = PlatformDetector.detectFromRequest(mockExpressReq);
      expect(platform).toBe("express");
    });

    it("should detect Fastify request", () => {
      const mockFastifyReq = {
        method: "POST",
        url: "/api/inngest",
        headers: { "content-type": "application/json" },
        body: {},
        raw: {}, // Fastify-specific property
        // No 'res' property (Fastify doesn't have this)
      };

      const platform = PlatformDetector.detectFromRequest(mockFastifyReq);
      expect(platform).toBe("fastify");
    });

    it("should default to express for unknown request", () => {
      const mockUnknownReq = {
        method: "POST",
        url: "/api/inngest",
      };

      const platform = PlatformDetector.detectFromRequest(mockUnknownReq);
      expect(platform).toBe("express");
    });
  });

  describe("createAdapterFromRequest", () => {
    it("should create appropriate adapter based on request", () => {
      const mockExpressReq = {
        method: "POST",
        url: "/api/inngest",
        headers: { "content-type": "application/json" },
        body: {},
        res: {},
      };

      const adapter = PlatformDetector.createAdapterFromRequest(mockExpressReq);
      expect(adapter).toBeInstanceOf(ExpressHttpAdapter);
    });
  });

  describe("getAvailablePlatforms", () => {
    it("should return available platforms", () => {
      const platforms = PlatformDetector.getAvailablePlatforms();

      expect(Array.isArray(platforms)).toBe(true);
      expect(platforms.length).toBeGreaterThan(0);

      platforms.forEach((platform) => {
        expect(platform.platform).toBeDefined();
        expect(platform.adapter).toBeDefined();
        expect(typeof platform.available).toBe("boolean");
      });
    });
  });
});
