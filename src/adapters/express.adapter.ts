import { Request, Response } from "express";
import {
  HttpPlatformAdapter,
  HttpRequestAdapter,
  HttpResponseAdapter,
  HttpAdapterOptions,
} from "./http-platform.interface";

export class ExpressRequestAdapter implements HttpRequestAdapter {
  body: any;
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  rawBody?: Buffer | string;

  constructor(private readonly expressRequest: Request) {
    this.body = expressRequest.body;
    this.headers = expressRequest.headers;
    this.method = expressRequest.method;
    this.url = expressRequest.url;
    this.rawBody = (expressRequest as any).rawBody;
  }
}

export class ExpressResponseAdapter implements HttpResponseAdapter {
  constructor(private readonly expressResponse: Response) {}

  status(code: number): HttpResponseAdapter {
    this.expressResponse.status(code);
    return this;
  }

  header(name: string, value: string): HttpResponseAdapter {
    this.expressResponse.header(name, value);
    return this;
  }

  send(data: any): void {
    this.expressResponse.send(data);
  }

  json(data: any): void {
    this.expressResponse.json(data);
  }
}

export class ExpressHttpAdapter implements HttpPlatformAdapter {
  constructor(private readonly options: HttpAdapterOptions = {}) {}

  extractRequest(req: Request): HttpRequestAdapter {
    return new ExpressRequestAdapter(req);
  }

  wrapResponse(res: Response): HttpResponseAdapter {
    return new ExpressResponseAdapter(res);
  }

  getRawBody(req: Request): Buffer | string {
    // Try to get raw body from middleware
    const rawBody = (req as any).rawBody;
    if (rawBody) {
      return rawBody;
    }

    // Fallback to stringified body if raw body middleware not present
    if (req.body) {
      return JSON.stringify(req.body);
    }

    return "";
  }

  getPlatformName(): string {
    return "express";
  }

  isCompatible(req: any): boolean {
    // Express requests have these characteristic properties
    return !!(
      req &&
      typeof req.method === "string" &&
      typeof req.url === "string" &&
      typeof req.headers === "object" &&
      req.headers !== null &&
      // Express-specific check: res property exists on request
      req.res !== undefined
    );
  }
}
