import { Provider } from "@nestjs/common";
import {
  HttpPlatformAdapter,
  HttpPlatformType,
} from "../adapters/http-platform.interface";
import { PlatformDetector } from "../adapters/platform-detector";

/**
 * Creates a mock HTTP platform adapter for testing
 */
export function createMockHttpPlatformAdapter(
  platform: HttpPlatformType = "express",
): Provider {
  return {
    provide: "HTTP_PLATFORM_ADAPTER",
    useValue: {
      extractRequest: (req: any) => {
        const adapter = PlatformDetector.getPlatformAdapter(platform);
        return adapter.extractRequest(req);
      },
      wrapResponse: (res: any) => {
        const adapter = PlatformDetector.getPlatformAdapter(platform);
        return adapter.wrapResponse(res);
      },
      getRawBody: (req: any) => {
        const adapter = PlatformDetector.getPlatformAdapter(platform);
        return adapter.getRawBody(req);
      },
      getPlatformName: () => platform,
      isCompatible: (req: any) => {
        const adapter = PlatformDetector.getPlatformAdapter(platform);
        return adapter.isCompatible(req);
      },
    },
  };
}

/**
 * Creates a simple mock HTTP platform adapter that just returns the request/response as-is
 * Useful for unit tests that don't need full platform logic
 */
export function createSimpleMockHttpAdapter(): Provider {
  return {
    provide: "HTTP_PLATFORM_ADAPTER",
    useValue: {
      extractRequest: (req: any) => ({
        body: req.body || {},
        headers: req.headers || {},
        method: req.method || "POST",
        url: req.url || "/api/inngest",
        rawBody: req.rawBody || JSON.stringify(req.body || {}),
      }),
      wrapResponse: (res: any) => {
        // For testing, we return the original response object but also call our adapter methods
        const wrapper = {
          status: (code: number) => {
            if (res.status) res.status(code);
            res.statusCode = code;
            return wrapper;
          },
          header: (name: string, value: string) => {
            if (res.header) res.header(name, value);
            res.headers = res.headers || {};
            res.headers[name] = value;
            return wrapper;
          },
          send: (data: any) => {
            if (res.send) res.send(data);
            res.body = data;
          },
          json: (data: any) => {
            if (res.json) res.json(data);
            res.body = data;
          },
        };
        return wrapper;
      },
      getRawBody: (req: any) => {
        if (req.rawBody) return req.rawBody;
        if (Buffer.isBuffer(req.body)) return req.body;
        return JSON.stringify(req.body || {});
      },
      getPlatformName: () => "express",
      isCompatible: () => true,
    },
  };
}
