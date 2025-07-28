import { Injectable, Logger } from "@nestjs/common";
import { Request } from "express";
import { InngestWebhookError } from "../errors";
import { ERROR_MESSAGES } from "../constants";
import { DevelopmentMode } from "../utils/development-mode";

/**
 * Parsed signature components from Inngest webhook header
 */
interface ParsedSignature {
  signature: string;
  timestamp: number;
  version?: string;
}

/**
 * Configuration for signature verification
 */
interface SignatureVerificationConfig {
  signingKey?: string;
  toleranceSeconds?: number;
  requiredHeaders?: string[];
}

/**
 * Service for verifying Inngest webhook signatures
 */
@Injectable()
export class SignatureVerificationService {
  private readonly logger = new Logger(SignatureVerificationService.name);
  private readonly DEFAULT_TOLERANCE_SECONDS = 300; // 5 minutes

  /**
   * Verifies the signature of an incoming webhook request
   */
  async verifyWebhookSignature(
    request: Request,
    config: SignatureVerificationConfig,
  ): Promise<void> {
    // Skip verification in development mode if configured to do so
    if (DevelopmentMode.shouldDisableSignatureVerification()) {
      DevelopmentMode.log(
        "Signature verification disabled in development mode",
      );
      return;
    }

    if (!config.signingKey) {
      this.logger.warn(
        "No signing key provided - skipping signature verification",
      );
      return;
    }

    // Check if signature header exists before proceeding
    const signatureHeader = request.headers["x-inngest-signature"] as string;
    if (!signatureHeader) {
      throw new InngestWebhookError(
        "Missing signature header (x-inngest-signature)",
        401,
      );
    }

    try {
      // Parse signature components
      const parsedSignature = this.parseSignatureHeader(signatureHeader);

      // Verify timestamp tolerance
      this.verifyTimestamp(parsedSignature.timestamp, config.toleranceSeconds);

      // Get request body for verification
      const rawBody = this.extractRawBody(request);

      // Verify the signature
      await this.verifySignature(rawBody, parsedSignature, config.signingKey);

      this.logger.debug("Webhook signature verified successfully");
    } catch (error) {
      if (error instanceof InngestWebhookError) {
        throw error;
      }

      this.logger.error("Signature verification failed:", error);
      throw new InngestWebhookError(
        `Signature verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        401,
        error as Error,
      );
    }
  }

  /**
   * Extracts the signature header from the request
   */
  private extractSignatureHeader(request: Request): string {
    const signatureHeader = request.headers["x-inngest-signature"] as string;

    if (!signatureHeader) {
      throw new InngestWebhookError(
        "Missing signature header (x-inngest-signature)",
        401,
      );
    }

    return signatureHeader;
  }

  /**
   * Parses the signature header into its components
   */
  private parseSignatureHeader(signatureHeader: string): ParsedSignature {
    try {
      // Expected format: "s=<signature>,t=<timestamp>[,v=<version>]"
      const parts = signatureHeader.split(",");
      const components: Record<string, string> = {};

      for (const part of parts) {
        const [key, value] = part.split("=", 2);
        if (key && value) {
          components[key] = value;
        }
      }

      const signature = components["s"];
      const timestampStr = components["t"];
      const version = components["v"];

      if (!signature || !timestampStr) {
        throw new Error("Missing required signature components (s, t)");
      }

      const timestamp = parseInt(timestampStr, 10);
      if (isNaN(timestamp)) {
        throw new Error("Invalid timestamp format");
      }

      return {
        signature,
        timestamp,
        version,
      };
    } catch (error) {
      throw new InngestWebhookError(
        `Invalid signature header format: ${
          error instanceof Error ? error.message : String(error)
        }`,
        401,
        error as Error,
      );
    }
  }

  /**
   * Verifies that the timestamp is within the acceptable tolerance
   */
  private verifyTimestamp(
    timestamp: number,
    toleranceSeconds: number = this.DEFAULT_TOLERANCE_SECONDS,
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(now - timestamp);

    if (timeDiff > toleranceSeconds) {
      throw new InngestWebhookError(
        `Request timestamp too old or too far in the future. ` +
          `Difference: ${timeDiff}s, Tolerance: ${toleranceSeconds}s`,
        401,
      );
    }

    this.logger.debug(`Timestamp verification passed (diff: ${timeDiff}s)`);
  }

  /**
   * Extracts the raw body from the request for signature verification
   */
  private extractRawBody(request: Request): string {
    // Check if raw body was captured by middleware
    if ((request as any).rawBody) {
      return (request as any).rawBody;
    }

    // Check if body is a Buffer
    if (Buffer.isBuffer((request as any).body)) {
      return (request as any).body.toString("utf8");
    }

    // Fallback to JSON stringification (not ideal for signature verification)
    this.logger.warn(
      "Raw body not available, using JSON.stringify as fallback. " +
        "Consider using raw body middleware for better security.",
    );

    return JSON.stringify(request.body);
  }

  /**
   * Verifies the HMAC signature
   */
  private async verifySignature(
    body: string,
    parsedSignature: ParsedSignature,
    signingKey: string,
  ): Promise<void> {
    try {
      const crypto = await import("crypto");

      // Create the signed payload: timestamp.body
      const signedPayload = `${parsedSignature.timestamp}.${body}`;

      // Calculate expected signature using HMAC-SHA256
      const expectedSignature = crypto
        .createHmac("sha256", signingKey)
        .update(signedPayload, "utf8")
        .digest("hex");

      // Convert signatures to buffers for timing-safe comparison
      const providedSignatureBuffer = Buffer.from(
        parsedSignature.signature,
        "hex",
      );
      const expectedSignatureBuffer = Buffer.from(expectedSignature, "hex");

      // Verify signature lengths match
      if (providedSignatureBuffer.length !== expectedSignatureBuffer.length) {
        throw new Error("Signature length mismatch");
      }

      // Perform timing-safe comparison
      const isValid = crypto.timingSafeEqual(
        providedSignatureBuffer,
        expectedSignatureBuffer,
      );

      if (!isValid) {
        throw new Error(ERROR_MESSAGES.SIGNATURE_VERIFICATION_FAILED);
      }

      this.logger.debug("HMAC signature verification successful");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === ERROR_MESSAGES.SIGNATURE_VERIFICATION_FAILED
      ) {
        throw new InngestWebhookError(
          ERROR_MESSAGES.SIGNATURE_VERIFICATION_FAILED,
          401,
        );
      }

      throw new InngestWebhookError(
        `Signature computation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        401,
        error as Error,
      );
    }
  }

  /**
   * Creates a signature for testing purposes
   */
  async createTestSignature(
    body: string,
    signingKey: string,
    timestamp?: number,
  ): Promise<string> {
    const crypto = await import("crypto");
    const ts = timestamp || Math.floor(Date.now() / 1000);

    const signedPayload = `${ts}.${body}`;
    const signature = crypto
      .createHmac("sha256", signingKey)
      .update(signedPayload, "utf8")
      .digest("hex");

    return `s=${signature},t=${ts}`;
  }

  /**
   * Validates signature configuration
   */
  validateSignatureConfig(config: SignatureVerificationConfig): void {
    if (!config.signingKey) {
      throw new Error("Signing key is required for signature verification");
    }

    if (config.signingKey.length < 32) {
      this.logger.warn(
        "Signing key appears to be too short for secure verification",
      );
    }

    if (config.toleranceSeconds && config.toleranceSeconds < 0) {
      throw new Error("Tolerance seconds must be non-negative");
    }

    if (config.toleranceSeconds && config.toleranceSeconds > 3600) {
      this.logger.warn(
        "Tolerance seconds is very high (>1 hour), consider reducing for better security",
      );
    }
  }

  /**
   * Gets signature verification status and configuration
   */
  getVerificationStatus(signingKey?: string): {
    enabled: boolean;
    hasSigningKey: boolean;
    algorithm: string;
    toleranceSeconds: number;
  } {
    return {
      enabled: !!signingKey,
      hasSigningKey: !!signingKey,
      algorithm: "HMAC-SHA256",
      toleranceSeconds: this.DEFAULT_TOLERANCE_SECONDS,
    };
  }
}
