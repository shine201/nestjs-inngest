import { DynamicModule, Module, Provider } from '@nestjs/common';
import { Test, TestingModule, TestingModuleBuilder } from '@nestjs/testing';
import { DiscoveryModule } from '@nestjs/core';
import { InngestModule } from '../inngest.module';
import { InngestService } from '../services/inngest.service';
import { FunctionRegistry } from '../services/function-registry.service';
import { ExecutionContextService } from '../services/execution-context.service';
import { ScopeManagerService } from '../services/scope-manager.service';
import { SignatureVerificationService } from '../services/signature-verification.service';
import { InngestController } from '../controllers/inngest.controller';
import { MergedInngestConfig } from '../utils/config-validation';
import { INNGEST_CONFIG } from '../constants';
import { MockInngestService } from './mocks/mock-inngest.service';
import { MockExecutionContextService } from './mocks/mock-execution-context.service';
import { MockSignatureVerificationService } from './mocks/mock-signature-verification.service';

/**
 * Configuration for InngestTestingModule
 */
export interface InngestTestingConfig {
  /**
   * Whether to use real Inngest services or mocks
   */
  useRealServices?: boolean;
  
  /**
   * Mock configuration overrides
   */
  mockConfig?: Partial<MergedInngestConfig>;
  
  /**
   * Custom mock providers
   */
  customMocks?: Provider[];
  
  /**
   * Whether to include the webhook controller in tests
   */
  includeController?: boolean;
  
  /**
   * Event registry for type-safe testing
   */
  eventRegistry?: Record<string, any>;
}

/**
 * Testing module for Inngest that provides mock services and utilities
 */
@Module({})
export class InngestTestingModule {
  /**
   * Create a testing module with default mock services
   */
  static forTest(config: InngestTestingConfig = {}): DynamicModule {
    const {
      useRealServices = false,
      mockConfig = {},
      customMocks = [],
      includeController = true,
      eventRegistry = {},
    } = config;

    // Default test configuration
    const defaultConfig: MergedInngestConfig = {
      appId: 'test-app',
      signingKey: 'test-signing-key',
      endpoint: '/api/inngest',
      env: 'test',
      isDev: true,
      logger: true,
      timeout: 5000,
      maxBatchSize: 100,
      strict: false,
      retry: {
        maxAttempts: 2,
        backoff: 'exponential',
        initialDelay: 100,
      },
      development: {
        enabled: true,
        disableSignatureVerification: true,
      },
      ...mockConfig,
    };

    // Core providers that are always included
    const coreProviders: Provider[] = [
      {
        provide: INNGEST_CONFIG,
        useValue: defaultConfig,
      },
      FunctionRegistry,
      ScopeManagerService,
      ...customMocks,
    ];

    // Service providers (real or mock based on configuration)
    const serviceProviders: Provider[] = useRealServices
      ? [
          InngestService,
          ExecutionContextService,
          SignatureVerificationService,
        ]
      : [
          {
            provide: InngestService,
            useClass: MockInngestService,
          },
          {
            provide: ExecutionContextService,
            useClass: MockExecutionContextService,
          },
          {
            provide: SignatureVerificationService,
            useClass: MockSignatureVerificationService,
          },
        ];

    // Controller (optional)
    const controllers = includeController ? [InngestController] : [];

    const allProviders = [
      ...coreProviders,
      ...serviceProviders,
    ];

    return {
      module: InngestTestingModule,
      imports: [DiscoveryModule],
      controllers: controllers,
      providers: allProviders,
      exports: allProviders,
    };
  }

  /**
   * Create a complete testing module builder with common setup
   */
  static createTestingModuleBuilder(
    config: InngestTestingConfig = {}
  ): TestingModuleBuilder {
    return Test.createTestingModule({
      imports: [InngestTestingModule.forTest(config)],
    });
  }

  /**
   * Create a testing module with automatic compilation
   */
  static async createTestingModule(
    config: InngestTestingConfig = {}
  ): Promise<TestingModule> {
    const moduleBuilder = this.createTestingModuleBuilder(config);
    return await moduleBuilder.compile();
  }

  /**
   * Helper to create a minimal testing setup for unit tests
   */
  static forUnitTest(): DynamicModule {
    return this.forTest({
      useRealServices: false,
      includeController: false,
    });
  }

  /**
   * Helper to create integration testing setup
   */
  static forIntegrationTest(config: Partial<InngestTestingConfig> = {}): DynamicModule {
    return this.forTest({
      useRealServices: true,
      includeController: true,
      ...config,
    });
  }

  /**
   * Create a testing module specifically for controller testing
   */
  static forControllerTest(config: Partial<InngestTestingConfig> = {}): DynamicModule {
    return this.forTest({
      useRealServices: false,
      includeController: true,
      ...config,
    });
  }

  /**
   * Create a testing module with real services but test configuration
   */
  static forServiceTest(config: Partial<InngestTestingConfig> = {}): DynamicModule {
    return this.forTest({
      useRealServices: true,
      includeController: false,
      ...config,
    });
  }
}

/**
 * Helper function to quickly create a testing module
 */
export async function createInngestTestingModule(
  config: InngestTestingConfig = {}
): Promise<TestingModule> {
  return InngestTestingModule.createTestingModule(config);
}

/**
 * Type-safe testing utilities
 */
export class InngestTestUtils {
  /**
   * Create a test event with proper typing
   */
  static createTestEvent<T extends Record<string, any>>(
    name: keyof T,
    data: T[keyof T],
    options: {
      id?: string;
      ts?: number;
      user?: { id: string; [key: string]: any };
      v?: string;
    } = {}
  ) {
    return {
      name: name as string,
      data,
      id: options.id || `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ts: options.ts || Date.now(),
      user: options.user || { id: 'test-user' },
      v: options.v || '2022-04-21',
    };
  }

  /**
   * Create a test webhook request
   */
  static createTestWebhookRequest(
    functionId: string,
    event: any,
    options: {
      runId?: string;
      attempt?: number;
      step?: any;
      ctx?: any;
    } = {}
  ) {
    return {
      function_id: functionId,
      event,
      run_id: options.runId || `run_${Date.now()}`,
      attempt: options.attempt || 1,
      step: options.step,
      ctx: options.ctx,
    };
  }

  /**
   * Create test function metadata
   */
  static createTestFunctionMetadata(
    id: string,
    options: {
      name?: string;
      trigger?: any;
      handler?: Function;
      config?: any;
    } = {}
  ) {
    return {
      id,
      name: options.name || id,
      trigger: options.trigger || { event: 'test.event' },
      handler: options.handler || jest.fn(),
      config: options.config || {},
    };
  }

  /**
   * Wait for a specific amount of time (useful for async testing)
   */
  static async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create a mock execution context
   */
  static createMockExecutionContext(
    functionId: string,
    runId: string,
    event: any,
    attempt: number = 1
  ) {
    return {
      functionId,
      runId,
      event,
      attempt,
      step: {
        run: jest.fn(),
        sleep: jest.fn(),
        sleepUntil: jest.fn(),
        waitForEvent: jest.fn(),
        invoke: jest.fn(),
        sendEvent: jest.fn(),
      },
      env: process.env,
    };
  }

  /**
   * Assert that a mock was called with specific event
   */
  static expectEventSent(
    mockSendEvent: jest.Mock,
    eventName: string,
    eventData?: any
  ) {
    const calls = mockSendEvent.mock.calls;
    const matchingCall = calls.find(call => {
      const [event] = call;
      return event.name === eventName && 
        (eventData ? JSON.stringify(event.data) === JSON.stringify(eventData) : true);
    });

    expect(matchingCall).toBeDefined();
    return matchingCall;
  }

  /**
   * Assert that a function was triggered with specific parameters
   */
  static expectFunctionTriggered(
    mockHandler: jest.Mock,
    expectedEvent?: any,
    expectedContext?: any
  ) {
    expect(mockHandler).toHaveBeenCalled();
    
    if (expectedEvent || expectedContext) {
      const lastCall = mockHandler.mock.calls[mockHandler.mock.calls.length - 1];
      const [actualEvent, actualContext] = lastCall;
      
      if (expectedEvent) {
        expect(actualEvent).toEqual(expect.objectContaining(expectedEvent));
      }
      
      if (expectedContext) {
        expect(actualContext).toEqual(expect.objectContaining(expectedContext));
      }
    }
  }
}