/**
 * HTTP Platform Adapter Interface
 * Provides abstraction layer for different HTTP platforms (Express, Fastify)
 */

export interface HttpRequestAdapter {
  body: any;
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  rawBody?: Buffer | string;
}

export interface HttpResponseAdapter {
  status(code: number): HttpResponseAdapter;
  header(name: string, value: string): HttpResponseAdapter;
  send(data: any): void;
  json(data: any): void;
}

export interface HttpPlatformAdapter {
  /**
   * Extract normalized request data from platform-specific request
   */
  extractRequest(req: any): HttpRequestAdapter;

  /**
   * Create response wrapper for platform-specific response
   */
  wrapResponse(res: any): HttpResponseAdapter;

  /**
   * Get raw request body for signature verification
   */
  getRawBody(req: any): Buffer | string;

  /**
   * Get platform name for debugging/logging
   */
  getPlatformName(): string;

  /**
   * Validate if the request object is compatible with this adapter
   */
  isCompatible(req: any): boolean;
}

export interface HttpAdapterOptions {
  enableRawBodyCapture?: boolean;
  rawBodySizeLimit?: number;
}

export type HttpPlatformType = "express" | "fastify" | "auto";

export interface PlatformDetectionResult {
  platform: HttpPlatformType;
  adapter: new (options?: HttpAdapterOptions) => HttpPlatformAdapter;
  available: boolean;
}
