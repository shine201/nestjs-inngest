import {
  ExpressHttpAdapter,
  ExpressRequestAdapter,
  ExpressResponseAdapter,
} from "../express.adapter";

describe("ExpressHttpAdapter", () => {
  let adapter: ExpressHttpAdapter;

  beforeEach(() => {
    adapter = new ExpressHttpAdapter();
  });

  describe("extractRequest", () => {
    it("should extract request data correctly", () => {
      const mockExpressReq = {
        method: "POST",
        url: "/api/inngest",
        headers: {
          "content-type": "application/json",
          "x-inngest-signature": "test",
        },
        body: { test: "data" },
        rawBody: "raw data",
      } as any;

      const adaptedReq = adapter.extractRequest(mockExpressReq);

      expect(adaptedReq.method).toBe("POST");
      expect(adaptedReq.url).toBe("/api/inngest");
      expect(adaptedReq.headers).toEqual(mockExpressReq.headers);
      expect(adaptedReq.body).toEqual({ test: "data" });
      expect(adaptedReq.rawBody).toBe("raw data");
    });
  });

  describe("wrapResponse", () => {
    it("should create response wrapper", () => {
      const mockExpressRes = {
        status: jest.fn().mockReturnThis(),
        header: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      } as any;

      const adaptedRes = adapter.wrapResponse(mockExpressRes);

      expect(adaptedRes).toBeInstanceOf(ExpressResponseAdapter);
    });
  });

  describe("getRawBody", () => {
    it("should get raw body from middleware", () => {
      const mockReq = {
        rawBody: "test raw body",
      } as any;

      const rawBody = adapter.getRawBody(mockReq);
      expect(rawBody).toBe("test raw body");
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
    it("should return express", () => {
      expect(adapter.getPlatformName()).toBe("express");
    });
  });

  describe("isCompatible", () => {
    it("should return true for Express request", () => {
      const mockExpressReq = {
        method: "POST",
        url: "/api/inngest",
        headers: {},
        res: {}, // Express-specific property
      };

      expect(adapter.isCompatible(mockExpressReq)).toBe(true);
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

describe("ExpressResponseAdapter", () => {
  let mockExpressRes: any;
  let adapter: ExpressResponseAdapter;

  beforeEach(() => {
    mockExpressRes = {
      status: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn(),
    };
    adapter = new ExpressResponseAdapter(mockExpressRes);
  });

  it("should set status code", () => {
    const result = adapter.status(200);

    expect(mockExpressRes.status).toHaveBeenCalledWith(200);
    expect(result).toBe(adapter);
  });

  it("should set header", () => {
    const result = adapter.header("Content-Type", "application/json");

    expect(mockExpressRes.header).toHaveBeenCalledWith(
      "Content-Type",
      "application/json",
    );
    expect(result).toBe(adapter);
  });

  it("should send data", () => {
    adapter.send("test data");

    expect(mockExpressRes.send).toHaveBeenCalledWith("test data");
  });

  it("should send json", () => {
    const testData = { test: "data" };
    adapter.json(testData);

    expect(mockExpressRes.json).toHaveBeenCalledWith(testData);
  });
});
