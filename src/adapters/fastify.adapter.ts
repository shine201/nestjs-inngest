import {
  HttpPlatformAdapter,
  HttpRequestAdapter,
  HttpResponseAdapter,
  HttpAdapterOptions,
} from "./http-platform.interface";

// Fastify types (avoid direct import to maintain optional dependency)
interface FastifyRequest {
  body: any;
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  rawBody?: Buffer;
  raw: any;
}

interface FastifyReply {
  status(code: number): FastifyReply;
  header(name: string, value: string): FastifyReply;
  send(data: any): void;
  code(statusCode: number): FastifyReply;
}

export class FastifyRequestAdapter implements HttpRequestAdapter {
  body: any;
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  rawBody?: Buffer | string;

  constructor(private readonly fastifyRequest: FastifyRequest) {
    this.body = fastifyRequest.body;
    this.headers = fastifyRequest.headers;
    this.method = fastifyRequest.method;
    this.url = fastifyRequest.url;
    this.rawBody = fastifyRequest.rawBody;
  }
}

export class FastifyResponseAdapter implements HttpResponseAdapter {
  constructor(private readonly fastifyReply: FastifyReply) {}

  status(code: number): HttpResponseAdapter {
    this.fastifyReply.status(code);
    return this;
  }

  header(name: string, value: string): HttpResponseAdapter {
    this.fastifyReply.header(name, value);
    return this;
  }

  send(data: any): void {
    this.fastifyReply.send(data);
  }

  json(data: any): void {
    // Fastify automatically serializes objects to JSON
    this.fastifyReply.send(data);
  }
}

export class FastifyHttpAdapter implements HttpPlatformAdapter {
  constructor(private readonly options: HttpAdapterOptions = {}) {}

  extractRequest(req: FastifyRequest): HttpRequestAdapter {
    return new FastifyRequestAdapter(req);
  }

  wrapResponse(reply: FastifyReply): HttpResponseAdapter {
    return new FastifyResponseAdapter(reply);
  }

  getRawBody(req: FastifyRequest): Buffer | string {
    // Fastify provides rawBody through addContentTypeParser or preParsing hook
    if (req.rawBody) {
      return req.rawBody;
    }

    // Try to get raw body from the underlying Node.js request
    if (req.raw && (req.raw as any).rawBody) {
      return (req.raw as any).rawBody;
    }

    // Fallback to stringified body
    if (req.body) {
      return JSON.stringify(req.body);
    }

    return "";
  }

  getPlatformName(): string {
    return "fastify";
  }

  isCompatible(req: any): boolean {
    // Fastify requests have these characteristic properties
    return !!(
      req &&
      typeof req.method === "string" &&
      typeof req.url === "string" &&
      typeof req.headers === "object" &&
      req.headers !== null &&
      // Fastify-specific check: raw property exists (underlying Node.js request)
      req.raw !== undefined &&
      // Fastify requests don't have 'res' property like Express
      req.res === undefined
    );
  }
}
