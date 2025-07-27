import { Injectable } from '@nestjs/common';
import { Request } from 'express';

/**
 * Mock implementation of SignatureVerificationService for testing
 */
@Injectable()
export class MockSignatureVerificationService {
  private verifyMock = jest.fn();
  private validateConfigMock = jest.fn();
  private statusMock = jest.fn();
  private shouldBypassVerification = false;
  private verificationError: Error | null = null;

  /**
   * Mock webhook signature verification
   */
  async verifyWebhookSignature(
    request: Request,
    options: {
      signingKey: string;
      toleranceSeconds?: number;
    }
  ): Promise<void> {
    this.verifyMock(request, options);

    if (this.verificationError) {
      throw this.verificationError;
    }

    if (!this.shouldBypassVerification) {
      // Default behavior - verify based on mock configuration
      // In test mode, we typically want to pass verification
      return Promise.resolve();
    }
  }

  /**
   * Mock signature configuration validation
   */
  validateSignatureConfig(config: { signingKey: string }): void {
    this.validateConfigMock(config);

    if (this.verificationError) {
      throw this.verificationError;
    }

    // Default: validation passes
  }

  /**
   * Mock get verification status
   */
  getVerificationStatus(signingKey: string): {
    isValid: boolean;
    algorithm: string;
    keyLength: number;
    issues: string[];
  } {
    this.statusMock(signingKey);

    return {
      isValid: true,
      algorithm: 'HS256',
      keyLength: signingKey.length,
      issues: [],
    };
  }

  /**
   * Configure mock to bypass signature verification
   */
  bypassVerification(bypass: boolean = true): void {
    this.shouldBypassVerification = bypass;
  }

  /**
   * Configure mock to throw verification error
   */
  setVerificationError(error: Error | null): void {
    this.verificationError = error;
  }

  /**
   * Configure mock to fail verification with specific error
   */
  mockVerificationFailure(message: string = 'Signature verification failed'): void {
    this.verificationError = new Error(message);
  }

  /**
   * Configure mock to succeed verification
   */
  mockVerificationSuccess(): void {
    this.verificationError = null;
    this.shouldBypassVerification = false;
  }

  /**
   * Get the jest mock for verify method
   */
  getVerifyMock(): jest.Mock {
    return this.verifyMock;
  }

  /**
   * Get the jest mock for validate config method
   */
  getValidateConfigMock(): jest.Mock {
    return this.validateConfigMock;
  }

  /**
   * Get the jest mock for get status method
   */
  getStatusMock(): jest.Mock {
    return this.statusMock;
  }

  /**
   * Clear all mock calls
   */
  clearMocks(): void {
    this.verifyMock.mockClear();
    this.validateConfigMock.mockClear();
    this.statusMock.mockClear();
  }

  /**
   * Reset all mocks to default behavior
   */
  resetMocks(): void {
    this.verifyMock.mockReset();
    this.validateConfigMock.mockReset();
    this.statusMock.mockReset();
    this.shouldBypassVerification = false;
    this.verificationError = null;

    // Restore default implementations
    this.verifyMock.mockImplementation(async () => {
      if (this.verificationError) {
        throw this.verificationError;
      }
      return Promise.resolve();
    });

    this.validateConfigMock.mockImplementation(() => {
      if (this.verificationError) {
        throw this.verificationError;
      }
    });

    this.statusMock.mockImplementation((signingKey: string) => ({
      isValid: true,
      algorithm: 'HS256',
      keyLength: signingKey.length,
      issues: [],
    }));
  }

  /**
   * Assert that verification was attempted
   */
  expectVerificationAttempted(times: number = 1): void {
    expect(this.verifyMock).toHaveBeenCalledTimes(times);
  }

  /**
   * Assert that verification was called with specific parameters
   */
  expectVerificationCalledWith(signingKey: string, toleranceSeconds?: number): void {
    expect(this.verifyMock).toHaveBeenCalledWith(
      expect.any(Object), // request object
      expect.objectContaining({
        signingKey,
        ...(toleranceSeconds !== undefined && { toleranceSeconds }),
      })
    );
  }

  /**
   * Assert that config validation was attempted
   */
  expectConfigValidated(times: number = 1): void {
    expect(this.validateConfigMock).toHaveBeenCalledTimes(times);
  }

  /**
   * Assert that status was checked
   */
  expectStatusChecked(times: number = 1): void {
    expect(this.statusMock).toHaveBeenCalledTimes(times);
  }

  /**
   * Create a mock request with signature headers
   */
  static createMockRequestWithSignature(
    body: any,
    signature: string = 'mock-signature',
    timestamp: string = Date.now().toString()
  ): Partial<Request> {
    return {
      headers: {
        'x-inngest-signature': signature,
        'x-inngest-timestamp': timestamp,
      },
      body,
      rawBody: Buffer.from(JSON.stringify(body)),
    } as Partial<Request>;
  }

  /**
   * Create a mock request without signature (should fail verification)
   */
  static createMockRequestWithoutSignature(body: any): Partial<Request> {
    return {
      headers: {},
      body,
      rawBody: Buffer.from(JSON.stringify(body)),
    } as Partial<Request>;
  }

  /**
   * Create a mock request with invalid signature
   */
  static createMockRequestWithInvalidSignature(body: any): Partial<Request> {
    return {
      headers: {
        'x-inngest-signature': 'invalid-signature',
        'x-inngest-timestamp': Date.now().toString(),
      },
      body,
      rawBody: Buffer.from(JSON.stringify(body)),
    } as Partial<Request>;
  }
}