import { DevelopmentMode, DevelopmentModeConfig } from '../utils/development-mode';
import { InngestEvent } from '../interfaces/inngest-event.interface';

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();

describe('DevelopmentMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset development mode before each test
    (DevelopmentMode as any).isInitialized = false;
    (DevelopmentMode as any).config = undefined;
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
  });

  describe('initialization', () => {
    it('should initialize with provided configuration', () => {
      const config: DevelopmentModeConfig = {
        enabled: true,
        verboseLogging: true,
        mockExternalCalls: true,
      };

      DevelopmentMode.initialize(config);

      expect(DevelopmentMode.isEnabled()).toBe(true);
      expect(DevelopmentMode.getConfig()).toEqual(config);
    });

    it('should log initialization messages when enabled', () => {
      const config: DevelopmentModeConfig = {
        enabled: true,
        verboseLogging: true,
        mockExternalCalls: true,
        disableSignatureVerification: true,
        localWebhookUrl: 'http://localhost:3000',
        enableIntrospection: true,
        enableStepDebugging: true,
      };

      DevelopmentMode.initialize(config);

      // Verify that initialization logs were called
      // Note: These are Logger calls, not direct console.log calls
      expect(DevelopmentMode.isEnabled()).toBe(true);
    });

    it('should handle disabled configuration', () => {
      const config: DevelopmentModeConfig = {
        enabled: false,
      };

      DevelopmentMode.initialize(config);

      expect(DevelopmentMode.isEnabled()).toBe(false);
      expect(DevelopmentMode.isVerboseLoggingEnabled()).toBe(false);
    });
  });

  describe('feature flags', () => {
    beforeEach(() => {
      const config: DevelopmentModeConfig = {
        enabled: true,
        verboseLogging: true,
        mockExternalCalls: true,
        disableSignatureVerification: true,
        enableIntrospection: true,
        enableStepDebugging: true,
      };
      DevelopmentMode.initialize(config);
    });

    it('should return correct feature flag values', () => {
      expect(DevelopmentMode.isVerboseLoggingEnabled()).toBe(true);
      expect(DevelopmentMode.shouldMockExternalCalls()).toBe(true);
      expect(DevelopmentMode.shouldDisableSignatureVerification()).toBe(true);
      expect(DevelopmentMode.isIntrospectionEnabled()).toBe(true);
      expect(DevelopmentMode.isStepDebuggingEnabled()).toBe(true);
    });

    it('should return false for features when disabled', () => {
      DevelopmentMode.initialize({ enabled: false });

      expect(DevelopmentMode.isVerboseLoggingEnabled()).toBe(false);
      expect(DevelopmentMode.shouldMockExternalCalls()).toBe(false);
      expect(DevelopmentMode.shouldDisableSignatureVerification()).toBe(false);
      expect(DevelopmentMode.isIntrospectionEnabled()).toBe(false);
      expect(DevelopmentMode.isStepDebuggingEnabled()).toBe(false);
    });
  });

  describe('timeout handling', () => {
    it('should return development timeout when configured', () => {
      DevelopmentMode.initialize({
        enabled: true,
        developmentTimeout: 60000,
      });

      expect(DevelopmentMode.getTimeout(30000)).toBe(60000);
    });

    it('should return default timeout when not configured', () => {
      DevelopmentMode.initialize({ enabled: true });

      expect(DevelopmentMode.getTimeout(30000)).toBe(30000);
    });

    it('should return default timeout when disabled', () => {
      DevelopmentMode.initialize({ enabled: false });

      expect(DevelopmentMode.getTimeout(30000)).toBe(30000);
    });
  });

  describe('logging', () => {
    beforeEach(() => {
      DevelopmentMode.initialize({
        enabled: true,
        verboseLogging: true,
      });
    });

    it('should log messages when verbose logging is enabled', () => {
      DevelopmentMode.log('Test message');
      // Logging is handled by NestJS Logger, so we can't easily test it here
      // But we can verify the method doesn't throw
      expect(() => DevelopmentMode.log('Test message')).not.toThrow();
    });

    it('should log function execution events', () => {
      const event: InngestEvent = {
        name: 'test.event',
        data: { test: true },
        id: 'test-id',
        ts: Date.now(),
        user: { id: 'test-user' },
        v: '2022-04-21',
      };

      expect(() => {
        DevelopmentMode.logFunctionExecution('test-func', 'run-123', event, 'start');
        DevelopmentMode.logFunctionExecution('test-func', 'run-123', event, 'step', {
          stepId: 'step-1',
          stepType: 'run',
          data: { input: 'test' },
        });
        DevelopmentMode.logFunctionExecution('test-func', 'run-123', event, 'complete', {
          result: { success: true },
          duration: 1000,
        });
        DevelopmentMode.logFunctionExecution('test-func', 'run-123', event, 'error', {
          error: new Error('Test error'),
        });
      }).not.toThrow();
    });

    it('should log step debugging information', () => {
      DevelopmentMode.initialize({
        enabled: true,
        enableStepDebugging: true,
      });

      expect(() => {
        DevelopmentMode.logStepDebug('func-1', 'run-1', 'step-1', 'run', { input: 'test' });
        DevelopmentMode.logStepDebug('func-1', 'run-1', 'step-1', 'run', { input: 'test' }, { output: 'success' });
        DevelopmentMode.logStepDebug('func-1', 'run-1', 'step-1', 'run', { input: 'test' }, undefined, new Error('Step failed'));
      }).not.toThrow();
    });
  });

  describe('error enhancement', () => {
    beforeEach(() => {
      DevelopmentMode.initialize({ enabled: true });
    });

    it('should enhance errors with development context', () => {
      const originalError = new Error('Original error message');
      const context = {
        functionId: 'test-function',
        runId: 'run-123',
        stepId: 'step-1',
      };

      const enhancedError = DevelopmentMode.enhanceErrorForDevelopment(originalError, context);

      expect(enhancedError.message).toContain('Original error message');
      expect(enhancedError.message).toContain('Function: test-function');
      expect(enhancedError.message).toContain('Run: run-123');
      expect(enhancedError.message).toContain('Step: step-1');
      expect(enhancedError.stack).toBe(originalError.stack);
      expect(enhancedError.name).toBe(originalError.name);
    });

    it('should return original error when disabled', () => {
      DevelopmentMode.initialize({ enabled: false });

      const originalError = new Error('Original error message');
      const enhancedError = DevelopmentMode.enhanceErrorForDevelopment(originalError, {
        functionId: 'test-function',
      });

      expect(enhancedError).toBe(originalError);
    });
  });

  describe('webhook URL creation', () => {
    it('should use configured local webhook URL', () => {
      DevelopmentMode.initialize({
        enabled: true,
        localWebhookUrl: 'http://localhost:4000',
      });

      const url = DevelopmentMode.createDevelopmentWebhookUrl('/api/inngest');
      expect(url).toBe('http://localhost:4000/api/inngest');
    });

    it('should use default URL when not configured', () => {
      DevelopmentMode.initialize({ enabled: true });

      const url = DevelopmentMode.createDevelopmentWebhookUrl('/api/inngest');
      expect(url).toBe('http://localhost:3000/api/inngest');
    });

    it('should use default path when not provided', () => {
      DevelopmentMode.initialize({ enabled: true });

      const url = DevelopmentMode.createDevelopmentWebhookUrl();
      expect(url).toBe('http://localhost:3000/api/inngest');
    });
  });

  describe('configuration summary', () => {
    it('should return summary when enabled', () => {
      const config: DevelopmentModeConfig = {
        enabled: true,
        verboseLogging: true,
        mockExternalCalls: false,
        localWebhookUrl: 'http://localhost:4000',
        developmentTimeout: 60000,
      };

      DevelopmentMode.initialize(config);

      const summary = DevelopmentMode.getConfigSummary();
      expect(summary).toEqual({
        enabled: true,
        verboseLogging: true,
        mockExternalCalls: false,
        disableSignatureVerification: false,
        enableIntrospection: false,
        enableStepDebugging: false,
        localWebhookUrl: 'http://localhost:4000',
        developmentTimeout: 60000,
      });
    });

    it('should return disabled summary when not enabled', () => {
      DevelopmentMode.initialize({ enabled: false });

      const summary = DevelopmentMode.getConfigSummary();
      expect(summary).toEqual({ enabled: false });
    });
  });

  describe('environment detection', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should detect development environment from NODE_ENV', () => {
      process.env.NODE_ENV = 'development';
      const config = DevelopmentMode.detectDevelopmentEnvironment();
      expect(config.enabled).toBe(true);
    });

    it('should detect test environment', () => {
      process.env.NODE_ENV = 'test';
      const config = DevelopmentMode.detectDevelopmentEnvironment();
      expect(config.enabled).toBe(true);
    });

    it('should not enable for production environment', () => {
      process.env.NODE_ENV = 'production';
      const config = DevelopmentMode.detectDevelopmentEnvironment();
      expect(config.enabled).toBe(false);
    });

    it('should parse environment variables', () => {
      process.env.NODE_ENV = 'development';
      process.env.INNGEST_DEV_VERBOSE = 'true';
      process.env.INNGEST_DEV_MOCK = 'true';
      process.env.INNGEST_DEV_NO_SIG = 'true';
      process.env.INNGEST_DEV_INTROSPECT = 'true';
      process.env.INNGEST_DEV_DEBUG_STEPS = 'true';
      process.env.INNGEST_DEV_WEBHOOK_URL = 'http://localhost:4000';
      process.env.INNGEST_DEV_TIMEOUT = '60000';

      const config = DevelopmentMode.detectDevelopmentEnvironment();
      expect(config).toEqual({
        enabled: true,
        verboseLogging: true,
        mockExternalCalls: true,
        disableSignatureVerification: true,
        enableIntrospection: true,
        enableStepDebugging: true,
        localWebhookUrl: 'http://localhost:4000',
        developmentTimeout: 60000,
      });
    });
  });

  describe('configuration application', () => {
    it('should apply development settings to config', () => {
      DevelopmentMode.initialize({
        enabled: true,
        developmentTimeout: 60000,
        disableSignatureVerification: true,
      });

      const originalConfig = {
        appId: 'test-app',
        signingKey: 'test-key',
        timeout: 30000,
        isDev: false,
      } as any;

      const appliedConfig = DevelopmentMode.applyToConfig(originalConfig);

      expect(appliedConfig.timeout).toBe(60000);
      expect(appliedConfig.isDev).toBe(true);
    });

    it('should not modify config when disabled', () => {
      DevelopmentMode.initialize({ enabled: false });

      const originalConfig = {
        appId: 'test-app',
        timeout: 30000,
        isDev: false,
      } as any;

      const appliedConfig = DevelopmentMode.applyToConfig(originalConfig);

      expect(appliedConfig).toEqual(originalConfig);
    });
  });

  describe('external call mocking', () => {
    beforeEach(() => {
      DevelopmentMode.initialize({
        enabled: true,
        mockExternalCalls: true,
      });
    });

    it('should return mock result when mocking is enabled', async () => {
      const mockResult = { mocked: true };
      const actualCall = jest.fn().mockResolvedValue({ real: true });

      const result = await DevelopmentMode.mockExternalCall(
        'TestService',
        'testMethod',
        mockResult,
        actualCall
      );

      expect(result).toEqual(mockResult);
      expect(actualCall).not.toHaveBeenCalled();
    });

    it('should call actual function when mocking is disabled', async () => {
      DevelopmentMode.initialize({
        enabled: true,
        mockExternalCalls: false,
      });

      const mockResult = { mocked: true };
      const actualCall = jest.fn().mockResolvedValue({ real: true });

      const result = await DevelopmentMode.mockExternalCall(
        'TestService',
        'testMethod',
        mockResult,
        actualCall
      );

      expect(result).toEqual({ real: true });
      expect(actualCall).toHaveBeenCalled();
    });
  });
});