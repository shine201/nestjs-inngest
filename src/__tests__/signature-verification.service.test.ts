import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { SignatureVerificationService } from "../services/signature-verification.service";
import { InngestWebhookError } from "../errors";
import { ERROR_MESSAGES } from "../constants";
import { createSimpleMockHttpAdapter } from "../testing/http-adapter-test-helper";

// Mock crypto module
jest.mock("crypto", () => ({
  createHmac: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  digest: jest.fn().mockReturnValue("valid-signature"),
  timingSafeEqual: jest.fn().mockReturnValue(true),
}));

describe("SignatureVerificationService", () => {
  let service: SignatureVerificationService;
  let mockRequest: Partial<Request>;
  let mockCrypto: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SignatureVerificationService, createSimpleMockHttpAdapter()],
    }).compile();

    service = module.get<SignatureVerificationService>(
      SignatureVerificationService,
    );

    // Setup mock request
    mockRequest = {
      headers: {},
      body: { test: "data" },
    };

    // Get mocked crypto
    mockCrypto = require("crypto");

    // Reset mocks
    jest.clearAllMocks();
    mockCrypto.timingSafeEqual.mockReturnValue(true);
  });

  describe("verifyWebhookSignature", () => {
    const validConfig = {
      signingKey: "test-signing-key-with-sufficient-length",
      toleranceSeconds: 300,
    };

    it("should verify valid signature successfully", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      mockRequest.headers = {
        "x-inngest-signature": `s=valid-signature,t=${timestamp}`,
      };
      mockRequest.body = { test: "data" };

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).resolves.not.toThrow();

      expect(mockCrypto.createHmac).toHaveBeenCalledWith(
        "sha256",
        validConfig.signingKey,
      );
      expect(mockCrypto.timingSafeEqual).toHaveBeenCalled();
    });

    it("should skip verification when no signing key is provided", async () => {
      const configWithoutKey = { signingKey: "" };

      await expect(
        service.verifyWebhookSignature(
          mockRequest as Request,
          configWithoutKey,
        ),
      ).resolves.not.toThrow();

      expect(mockCrypto.createHmac).not.toHaveBeenCalled();
    });

    it("should throw error when signature header is missing", async () => {
      mockRequest.headers = {}; // No signature header

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).rejects.toThrow(InngestWebhookError);

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).rejects.toThrow("Missing signature header");
    });

    it("should throw error for invalid signature format", async () => {
      mockRequest.headers = {
        "x-inngest-signature": "invalid-format",
      };

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).rejects.toThrow(InngestWebhookError);

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).rejects.toThrow("Invalid signature header format");
    });

    it("should throw error for missing signature components", async () => {
      mockRequest.headers = {
        "x-inngest-signature": "s=signature-only",
      };

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).rejects.toThrow(InngestWebhookError);

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).rejects.toThrow("Missing required signature components");
    });

    it("should throw error for invalid timestamp format", async () => {
      mockRequest.headers = {
        "x-inngest-signature": "s=valid-signature,t=invalid-timestamp",
      };

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).rejects.toThrow(InngestWebhookError);

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).rejects.toThrow("Invalid timestamp format");
    });

    it("should throw error for timestamp outside tolerance", async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      mockRequest.headers = {
        "x-inngest-signature": `s=valid-signature,t=${oldTimestamp}`,
      };

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).rejects.toThrow(InngestWebhookError);

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).rejects.toThrow("Request timestamp too old");
    });

    it("should accept timestamp within tolerance", async () => {
      const recentTimestamp = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago
      mockRequest.headers = {
        "x-inngest-signature": `s=valid-signature,t=${recentTimestamp}`,
      };

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).resolves.not.toThrow();
    });

    it("should throw error for signature verification failure", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      mockRequest.headers = {
        "x-inngest-signature": `s=invalid-signature,t=${timestamp}`,
      };

      mockCrypto.timingSafeEqual.mockReturnValue(false);

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).rejects.toThrow(InngestWebhookError);

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).rejects.toThrow(ERROR_MESSAGES.SIGNATURE_VERIFICATION_FAILED);
    });

    it("should handle raw body from middleware", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const rawBody = '{"test":"data"}';

      mockRequest.headers = {
        "x-inngest-signature": `s=valid-signature,t=${timestamp}`,
      };
      (mockRequest as any).rawBody = rawBody;

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).resolves.not.toThrow();

      expect(mockCrypto.update).toHaveBeenCalledWith(
        `${timestamp}.${rawBody}`,
        "utf8",
      );
    });

    it("should handle Buffer body", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const bodyBuffer = Buffer.from('{"test":"data"}', "utf8");

      mockRequest.headers = {
        "x-inngest-signature": `s=valid-signature,t=${timestamp}`,
      };
      mockRequest.body = bodyBuffer;

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).resolves.not.toThrow();

      expect(mockCrypto.update).toHaveBeenCalledWith(
        `${timestamp}.${bodyBuffer.toString("utf8")}`,
        "utf8",
      );
    });

    it("should use custom tolerance seconds", async () => {
      const customConfig = {
        signingKey: validConfig.signingKey,
        toleranceSeconds: 60, // 1 minute
      };

      const oldTimestamp = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago
      mockRequest.headers = {
        "x-inngest-signature": `s=valid-signature,t=${oldTimestamp}`,
      };

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, customConfig),
      ).rejects.toThrow("Request timestamp too old");
    });

    it("should handle signature with version component", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      mockRequest.headers = {
        "x-inngest-signature": `s=valid-signature,t=${timestamp},v=1`,
      };

      await expect(
        service.verifyWebhookSignature(mockRequest as Request, validConfig),
      ).resolves.not.toThrow();
    });
  });

  describe("createTestSignature", () => {
    it("should create valid test signature", async () => {
      const body = '{"test":"data"}';
      const signingKey = "test-key";
      const timestamp = 1234567890;

      const signature = await service.createTestSignature(
        body,
        signingKey,
        timestamp,
      );

      expect(signature).toMatch(/^s=.+,t=1234567890$/);
      expect(mockCrypto.createHmac).toHaveBeenCalledWith("sha256", signingKey);
      expect(mockCrypto.update).toHaveBeenCalledWith(
        `${timestamp}.${body}`,
        "utf8",
      );
    });

    it("should use current timestamp when not provided", async () => {
      const body = '{"test":"data"}';
      const signingKey = "test-key";

      const signature = await service.createTestSignature(body, signingKey);

      expect(signature).toMatch(/^s=.+,t=\d+$/);
    });
  });

  describe("validateSignatureConfig", () => {
    it("should validate valid configuration", () => {
      const validConfig = {
        signingKey: "valid-signing-key-with-sufficient-length",
        toleranceSeconds: 300,
      };

      expect(() => service.validateSignatureConfig(validConfig)).not.toThrow();
    });

    it("should throw error for missing signing key", () => {
      const invalidConfig = {
        signingKey: "",
      };

      expect(() => service.validateSignatureConfig(invalidConfig)).toThrow(
        "Signing key is required",
      );
    });

    it("should throw error for negative tolerance", () => {
      const invalidConfig = {
        signingKey: "valid-key",
        toleranceSeconds: -1,
      };

      expect(() => service.validateSignatureConfig(invalidConfig)).toThrow(
        "Tolerance seconds must be non-negative",
      );
    });

    it("should warn about short signing key", () => {
      const configWithShortKey = {
        signingKey: "short",
      };

      const loggerSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation();

      service.validateSignatureConfig(configWithShortKey);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("Signing key appears to be too short"),
      );

      loggerSpy.mockRestore();
    });

    it("should warn about high tolerance", () => {
      const configWithHighTolerance = {
        signingKey: "valid-signing-key-with-sufficient-length",
        toleranceSeconds: 7200, // 2 hours
      };

      const loggerSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation();

      service.validateSignatureConfig(configWithHighTolerance);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("Tolerance seconds is very high"),
      );

      loggerSpy.mockRestore();
    });
  });

  describe("getVerificationStatus", () => {
    it("should return status with signing key", () => {
      const status = service.getVerificationStatus("test-key");

      expect(status).toEqual({
        enabled: true,
        hasSigningKey: true,
        algorithm: "HMAC-SHA256",
        toleranceSeconds: 300,
      });
    });

    it("should return status without signing key", () => {
      const status = service.getVerificationStatus();

      expect(status).toEqual({
        enabled: false,
        hasSigningKey: false,
        algorithm: "HMAC-SHA256",
        toleranceSeconds: 300,
      });
    });
  });
});
