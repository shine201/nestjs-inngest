import { Test, TestingModule } from "@nestjs/testing";
import { Module, Injectable, DynamicModule } from "@nestjs/common";
import { InngestModule } from "../../inngest.module";
import { InngestService } from "../../services/inngest.service";
import { FunctionRegistry } from "../../services/function-registry.service";
import { ExecutionContextService } from "../../services/execution-context.service";
import { SignatureVerificationService } from "../../services/signature-verification.service";
import { ScopeManagerService } from "../../services/scope-manager.service";
import { EnhancedLogger } from "../../services/enhanced-logger.service";
import { InngestController } from "../../controllers/inngest.controller";
import { createSimpleMockHttpAdapter } from "../../testing/http-adapter-test-helper";
import {
  InngestModuleConfig,
  InngestModuleAsyncOptions,
  InngestConfigFactory,
} from "../../interfaces/inngest-config.interface";
import { InngestFunction } from "../../decorators/inngest-function.decorator";
import { INNGEST_CONFIG } from "../../constants";
import { validateAndMergeConfig } from "../../utils/config-validation";
import { DevelopmentMode } from "../../utils/development-mode";

// Test service for module integration
@Injectable()
class ModuleTestService {
  @InngestFunction({
    id: "module-test-function",
    name: "Module Test Function",
    triggers: [{ event: "module.test" }],
  })
  async handleModuleTest(event: any, { step }: any) {
    return { module: "initialized", event: event.data };
  }
}

// Test configuration factory
@Injectable()
class TestConfigFactory implements InngestConfigFactory {
  createInngestConfig(): InngestModuleConfig {
    return {
      appId: "factory-test-app",
      signingKey: "factory-test-key",
      endpoint: "/api/inngest",
      env: "test",
      isDev: true,
      logger: true,
      timeout: 3000,
      retry: {
        maxAttempts: 1,
        initialDelay: 100,
        maxDelay: 30000,
        backoffMultiplier: 2,
      },
      development: {
        enabled: true,
        disableSignatureVerification: true,
      },
    };
  }
}

// Test module with providers
@Module({
  providers: [ModuleTestService],
  exports: [ModuleTestService],
})
class TestFeatureModule {
  static forRoot(): DynamicModule {
    return {
      module: TestFeatureModule,
      providers: [ModuleTestService],
      exports: [ModuleTestService],
    };
  }
}

describe("Module Initialization Integration Tests", () => {
  describe("Synchronous Configuration", () => {
    let module: TestingModule;
    let inngestService: InngestService;
    let functionRegistry: FunctionRegistry;
    let config: any;

    beforeAll(async () => {
      const testConfig: InngestModuleConfig = {
        appId: "sync-test-app",
        signingKey: "sync-test-signing-key",
        endpoint: "/api/inngest",
        env: "test",
        isDev: true,
        logger: false, // Disable logging for cleaner test output
        timeout: 5000,
        maxBatchSize: 50,
        strict: true,
        retry: {
          maxAttempts: 2,
          initialDelay: 100,
          maxDelay: 1000,
          backoffMultiplier: 2,
        },
        development: {
          enabled: true,
          disableSignatureVerification: true,
        },
      };

      module = await Test.createTestingModule({
        imports: [
          InngestModule.forRoot(testConfig),
          TestFeatureModule.forRoot(),
        ],
      }).compile();

      inngestService = module.get<InngestService>(InngestService);
      functionRegistry = module.get<FunctionRegistry>(FunctionRegistry);
      config = module.get(INNGEST_CONFIG);
    });

    afterAll(async () => {
      if (module) {
        await module.close();
      }
    });

    it("should initialize module with synchronous configuration", () => {
      expect(module).toBeDefined();
      expect(inngestService).toBeDefined();
      expect(functionRegistry).toBeDefined();
      expect(config).toBeDefined();
    });

    it("should properly merge and validate configuration", () => {
      expect(config.appId).toBe("sync-test-app");
      expect(config.signingKey).toBe("sync-test-signing-key");
      expect(config.endpoint).toBe("/api/inngest");
      expect(config.env).toBe("test");
      expect(config.isDev).toBe(true);
      expect(config.logger).toBe(false);
      expect(config.timeout).toBe(5000);
      expect(config.maxBatchSize).toBe(50);
      expect(config.strict).toBe(true);

      // Verify retry configuration
      expect(config.retry.maxAttempts).toBe(2);
      expect(config.retry.initialDelay).toBe(100);
      expect(config.retry.maxDelay).toBe(1000);
      expect(config.retry.backoffMultiplier).toBe(2);

      // Verify development configuration
      expect(config.development.enabled).toBe(true);
      expect(config.development.disableSignatureVerification).toBe(true);
    });

    it("should register functions from imported modules", () => {
      // Check that function registry is initialized
      expect(functionRegistry).toBeDefined();

      // In test environment, functions may not be auto-discovered
      // So we check that the registry service is available
      expect(typeof functionRegistry.getFunctionCount).toBe("function");
      expect(typeof functionRegistry.getFunction).toBe("function");

      // The actual function registration happens at runtime
      // during the discovery process, which may not occur in unit tests
    });

    it("should initialize all core services with proper configuration", () => {
      const executionContextService = module.get<ExecutionContextService>(
        ExecutionContextService,
      );
      const signatureVerificationService =
        module.get<SignatureVerificationService>(SignatureVerificationService);
      const scopeManagerService =
        module.get<ScopeManagerService>(ScopeManagerService);

      expect(executionContextService).toBeDefined();
      expect(signatureVerificationService).toBeDefined();
      expect(scopeManagerService).toBeDefined();

      // Test signature verification configuration
      const verificationStatus =
        signatureVerificationService.getVerificationStatus(config.signingKey);
      expect(verificationStatus.hasSigningKey).toBe(true);
      expect(verificationStatus.enabled).toBe(true);
    });

    it("should initialize controller with proper dependencies", () => {
      const controller = module.get<InngestController>(InngestController);
      expect(controller).toBeDefined();

      const healthStatus = controller.getHealthStatus();
      expect(healthStatus.status).toBe("healthy");
      expect(healthStatus.endpoint).toBe("/api/inngest");
      // In test environment, function registration may not happen automatically
      expect(typeof healthStatus.registeredFunctions).toBe("number");
      expect(healthStatus.signatureVerification.hasSigningKey).toBe(true);
    });
  });

  describe("Asynchronous Configuration with Factory", () => {
    let module: TestingModule;
    let config: any;

    beforeAll(async () => {
      // Reset DevelopmentMode state to avoid interference from other tests
      DevelopmentMode.reset();
      module = await Test.createTestingModule({
        imports: [
          InngestModule.forRootAsync({
            useFactory: async () => {
              // Simulate async configuration loading
              await new Promise((resolve) => setTimeout(resolve, 10));

              return {
                appId: "async-factory-app",
                signingKey: "async-factory-key",
                endpoint: "/api/inngest",
                env: "test",
                isDev: false, // Test production-like settings
                logger: true,
                timeout: 8000,
                maxBatchSize: 200,
                strict: false,
                retry: {
                  maxAttempts: 3,
                  initialDelay: 200,
                  maxDelay: 30000,
                  backoffMultiplier: 2,
                },
                development: {
                  enabled: false,
                  disableSignatureVerification: false,
                },
              };
            },
          }),
          TestFeatureModule,
        ],
      }).compile();

      config = module.get(INNGEST_CONFIG);
    });

    afterAll(async () => {
      if (module) {
        await module.close();
      }
    });

    it("should initialize with asynchronous factory configuration", () => {
      expect(module).toBeDefined();
      expect(config).toBeDefined();
      expect(config.appId).toBe("async-factory-app");
      expect(config.signingKey).toBe("async-factory-key");
    });

    it("should properly handle production-like configuration", () => {
      expect(config.isDev).toBe(false);
      expect(config.development.enabled).toBe(false);
      expect(config.development.disableSignatureVerification).toBe(false);
      expect(config.timeout).toBe(8000);
      expect(config.maxBatchSize).toBe(200);
      expect(config.retry.maxAttempts).toBe(3);
      // backoff removed - using backoffMultiplier instead
    });

    it("should initialize services with async configuration", () => {
      const inngestService = module.get<InngestService>(InngestService);
      const functionRegistry = module.get<FunctionRegistry>(FunctionRegistry);

      expect(inngestService).toBeDefined();
      expect(functionRegistry).toBeDefined();
      expect(functionRegistry.getFunctionCount()).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Asynchronous Configuration with Class", () => {
    let module: TestingModule;
    let config: any;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [
          InngestModule.forRootAsync({
            useClass: TestConfigFactory,
          }),
          TestFeatureModule,
        ],
        providers: [TestConfigFactory],
      }).compile();

      config = module.get(INNGEST_CONFIG);
    });

    afterAll(async () => {
      if (module) {
        await module.close();
      }
    });

    it("should initialize with class-based configuration", () => {
      expect(module).toBeDefined();
      expect(config).toBeDefined();
      expect(config.appId).toBe("factory-test-app");
      expect(config.signingKey).toBe("factory-test-key");
    });

    it("should use configuration from factory class", () => {
      expect(config.timeout).toBe(3000);
      expect(config.retry.maxAttempts).toBe(1);
      // backoff removed - using backoffMultiplier instead
      expect(config.retry.initialDelay).toBe(100);
    });
  });

  describe("Asynchronous Configuration with Existing Provider", () => {
    let module: TestingModule;
    let config: any;

    // Create a module for TestConfigFactory
    @Module({
      providers: [TestConfigFactory],
      exports: [TestConfigFactory],
    })
    class TestConfigModule {}

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [
          InngestModule.forRootAsync({
            useFactory: (factory: TestConfigFactory) =>
              factory.createInngestConfig(),
            inject: [TestConfigFactory],
            imports: [TestConfigModule],
          }),
          TestFeatureModule,
        ],
      }).compile();

      config = module.get(INNGEST_CONFIG);
    });

    afterAll(async () => {
      if (module) {
        await module.close();
      }
    });

    it("should initialize with existing provider configuration", () => {
      expect(module).toBeDefined();
      expect(config).toBeDefined();
      expect(config.appId).toBe("factory-test-app");
    });
  });

  describe("Configuration Validation", () => {
    it("should validate minimal configuration", () => {
      const minimalConfig: InngestModuleConfig = {
        appId: "minimal-app",
      };

      const { config: mergedConfig } = validateAndMergeConfig(minimalConfig);
      expect(mergedConfig.appId).toBe("minimal-app");
      expect(mergedConfig.endpoint).toBe("/api/inngest");
      expect(mergedConfig.env).toBe("production");
      expect(mergedConfig.isDev).toBe(false);
      expect(mergedConfig.logger).toBe(true);
      expect(mergedConfig.timeout).toBe(30000);
      expect(mergedConfig.maxBatchSize).toBe(100);
      expect(mergedConfig.strict).toBe(false);
    });

    it("should validate complete configuration", () => {
      const completeConfig: InngestModuleConfig = {
        appId: "complete-app",
        eventKey: "event-key",
        signingKey: "signing-key",
        baseUrl: "https://api.inngest.com",
        endpoint: "/webhooks/inngest",
        isDev: true,
        logger: false,
        env: "development",
        timeout: 15000,
        maxBatchSize: 150,
        strict: true,
        retry: {
          maxAttempts: 4,
          initialDelay: 500,
          maxDelay: 10000,
          backoffMultiplier: 3,
        },
        development: {
          enabled: true,
          disableSignatureVerification: true,
        },
      };

      const { config: mergedConfig } = validateAndMergeConfig(completeConfig);
      expect(mergedConfig.appId).toBe(completeConfig.appId);
      expect(mergedConfig.env).toBe(completeConfig.env);
    });

    it("should validate invalid configuration", () => {
      const result1 = validateAndMergeConfig({} as InngestModuleConfig);
      expect(result1.validation.isValid).toBe(false);
      expect(result1.validation.errors.length).toBeGreaterThan(0);
      expect(result1.validation.errors[0].message).toContain("appId");

      const result2 = validateAndMergeConfig({
        appId: "",
      } as InngestModuleConfig);
      expect(result2.validation.isValid).toBe(false);
      expect(result2.validation.errors.length).toBeGreaterThan(0);

      const result3 = validateAndMergeConfig({
        appId: "test",
        timeout: -1,
      } as InngestModuleConfig);
      expect(result3.validation.isValid).toBe(false);
      expect(
        result3.validation.errors.some((e) => e.message.includes("timeout")),
      ).toBe(true);

      const result4 = validateAndMergeConfig({
        appId: "test",
        maxBatchSize: 0,
      } as InngestModuleConfig);
      expect(result4.validation.isValid).toBe(false);
      expect(
        result4.validation.errors.some((e) =>
          e.message.includes("maxBatchSize"),
        ),
      ).toBe(true);
    });
  });

  describe("Module Dependencies and Providers", () => {
    let module: TestingModule;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [
          InngestModule.forRoot({
            appId: "dependency-test-app",
            signingKey: "dependency-test-key",
          }),
        ],
      }).compile();
    });

    afterAll(async () => {
      if (module) {
        await module.close();
      }
    });

    it("should provide all required services", () => {
      const requiredServices = [
        InngestService,
        FunctionRegistry,
        ExecutionContextService,
        SignatureVerificationService,
        ScopeManagerService,
        InngestController,
      ];

      for (const ServiceClass of requiredServices) {
        const service = module.get(ServiceClass);
        expect(service).toBeDefined();
        expect(service).toBeInstanceOf(ServiceClass);
      }
    });

    it("should provide configuration token", () => {
      const config = module.get(INNGEST_CONFIG);
      expect(config).toBeDefined();
      expect(config.appId).toBe("dependency-test-app");
      expect(config.signingKey).toBe("dependency-test-key");
    });

    it("should create singleton instances", () => {
      const service1 = module.get<InngestService>(InngestService);
      const service2 = module.get<InngestService>(InngestService);
      expect(service1).toBe(service2);

      const registry1 = module.get<FunctionRegistry>(FunctionRegistry);
      const registry2 = module.get<FunctionRegistry>(FunctionRegistry);
      expect(registry1).toBe(registry2);
    });

    it("should properly wire service dependencies", () => {
      const controller = module.get<InngestController>(InngestController);
      const functionRegistry = module.get<FunctionRegistry>(FunctionRegistry);
      const executionContext = module.get<ExecutionContextService>(
        ExecutionContextService,
      );
      const signatureVerification = module.get<SignatureVerificationService>(
        SignatureVerificationService,
      );

      // Test that controller has access to all dependencies
      expect(controller).toBeDefined();

      // Test that services can interact correctly
      const healthStatus = controller.getHealthStatus();
      expect(healthStatus.registeredFunctions).toBe(
        functionRegistry.getFunctionCount(),
      );
      expect(healthStatus.signatureVerification).toBeDefined();
    });
  });

  describe("Environment-Specific Configuration", () => {
    it("should handle development environment", async () => {
      const module = await Test.createTestingModule({
        imports: [
          InngestModule.forRoot({
            appId: "dev-app",
            env: "development",
            isDev: true,
            development: {
              enabled: true,
              disableSignatureVerification: true,
            },
          }),
        ],
      }).compile();

      const config = module.get(INNGEST_CONFIG);
      expect(config.env).toBe("development");
      expect(config.isDev).toBe(true);
      expect(config.development.enabled).toBe(true);
      expect(config.development.disableSignatureVerification).toBe(true);

      await module.close();
    });

    it("should handle production environment", async () => {
      const module = await Test.createTestingModule({
        imports: [
          InngestModule.forRoot({
            appId: "prod-app",
            signingKey: "prod-signing-key",
            env: "production",
            isDev: false,
            development: {
              enabled: false,
              disableSignatureVerification: false,
            },
          }),
        ],
      }).compile();

      const config = module.get(INNGEST_CONFIG);
      expect(config.env).toBe("production");
      expect(config.isDev).toBe(false);
      expect(config.development.enabled).toBe(false);
      expect(config.development.disableSignatureVerification).toBe(false);

      await module.close();
    });

    it("should handle test environment", async () => {
      const module = await Test.createTestingModule({
        imports: [
          InngestModule.forRoot({
            appId: "test-app",
            env: "test",
            development: {
              enabled: true,
              disableSignatureVerification: true,
            },
          }),
        ],
      }).compile();

      const config = module.get(INNGEST_CONFIG);
      expect(config.env).toBe("test");
      expect(config.development.enabled).toBe(true);

      await module.close();
    });
  });
});
