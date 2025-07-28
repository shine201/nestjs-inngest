/**
 * HTTP Platform Adapters for NestJS Inngest Integration
 *
 * This module provides adapters for different HTTP platforms (Express, Fastify)
 * allowing the Inngest integration to work seamlessly with any NestJS HTTP platform.
 */

export {
  HttpPlatformAdapter,
  HttpRequestAdapter,
  HttpResponseAdapter,
  HttpAdapterOptions,
  HttpPlatformType,
  PlatformDetectionResult,
} from "./http-platform.interface";

export {
  ExpressHttpAdapter,
  ExpressRequestAdapter,
  ExpressResponseAdapter,
} from "./express.adapter";

export {
  FastifyHttpAdapter,
  FastifyRequestAdapter,
  FastifyResponseAdapter,
} from "./fastify.adapter";

export { PlatformDetector, platformDetector } from "./platform-detector";
