import { Test, TestingModule } from "@nestjs/testing";
import { DiscoveryModule } from "@nestjs/core";
import { InngestModule } from "../inngest.module";
import { InngestModuleConfig } from "../interfaces/inngest-config.interface";
import { InngestService } from "../services/inngest.service";
import { FunctionRegistry } from "../services/function-registry.service";
import { ExecutionContextService } from "../services/execution-context.service";
import { ScopeManagerService } from "../services/scope-manager.service";
import { SignatureVerificationService } from "../services/signature-verification.service";
import { InngestController } from "../controllers/inngest.controller";
import { INNGEST_CONFIG } from "../constants";
import { createSimpleMockHttpAdapter } from "../testing/http-adapter-test-helper";

describe("InngestModule", () => {
  const validConfig: InngestModuleConfig = {
    appId: "test-app",
    eventKey: "test-event-key",
    signingKey: "test-signing-key",
  };

  describe("forRoot", () => {
    it("should create a dynamic module with correct configuration", () => {
      const dynamicModule = InngestModule.forRoot(validConfig);

      expect(dynamicModule).toBeDefined();
      expect(dynamicModule.module).toBe(InngestModule);
      expect(dynamicModule.global).toBe(false);
    });

    it("should include DiscoveryModule in imports", () => {
      const dynamicModule = InngestModule.forRoot(validConfig);

      expect(dynamicModule.imports).toContain(DiscoveryModule);
    });

    it("should include InngestController in controllers", () => {
      const dynamicModule = InngestModule.forRoot(validConfig);

      expect(dynamicModule.controllers).toContain(InngestController);
    });

    it("should include all required providers", () => {
      const dynamicModule = InngestModule.forRoot(validConfig);

      const providerTokens = dynamicModule.providers?.map((provider: any) => {
        if (typeof provider === "function") {
          return provider;
        }
        return provider.provide || provider;
      });

      expect(providerTokens).toContain(INNGEST_CONFIG);
      expect(providerTokens).toContain(InngestService);
      expect(providerTokens).toContain(FunctionRegistry);
      expect(providerTokens).toContain(ExecutionContextService);
      expect(providerTokens).toContain(ScopeManagerService);
      expect(providerTokens).toContain(SignatureVerificationService);
    });

    it("should export all required services", () => {
      const dynamicModule = InngestModule.forRoot(validConfig);

      expect(dynamicModule.exports).toContain(InngestService);
      expect(dynamicModule.exports).toContain(FunctionRegistry);
      expect(dynamicModule.exports).toContain(ExecutionContextService);
      expect(dynamicModule.exports).toContain(ScopeManagerService);
      expect(dynamicModule.exports).toContain(SignatureVerificationService);
      expect(dynamicModule.exports).toContain(INNGEST_CONFIG);
    });

    it("should provide merged configuration", () => {
      const dynamicModule = InngestModule.forRoot(validConfig);

      const configProvider = dynamicModule.providers?.find(
        (provider: any) => provider.provide === INNGEST_CONFIG,
      ) as any;

      expect(configProvider).toBeDefined();
      expect(configProvider.useValue).toBeDefined();
      expect(configProvider.useValue.appId).toBe("test-app");
      expect(configProvider.useValue.eventKey).toBe("test-event-key");
      expect(configProvider.useValue.signingKey).toBe("test-signing-key");
    });

    it("should merge configuration with defaults", () => {
      const minimalConfig: InngestModuleConfig = {
        appId: "test-app",
        eventKey: "test-event-key",
      };

      const dynamicModule = InngestModule.forRoot(minimalConfig);

      const configProvider = dynamicModule.providers?.find(
        (provider: any) => provider.provide === INNGEST_CONFIG,
      ) as any;

      expect(configProvider.useValue.isDev).toBe(false);
      expect(configProvider.useValue.logger).toBe(true);
      expect(configProvider.useValue.endpoint).toBe("/api/inngest");
      expect(configProvider.useValue.timeout).toBe(30000);
    });

    it("should validate configuration and throw on invalid config", () => {
      const invalidConfig = {
        // Missing required appId
        eventKey: "test-event-key",
      } as InngestModuleConfig;

      expect(() => InngestModule.forRoot(invalidConfig)).toThrow();
    });
  });

  describe("forRootGlobal", () => {
    it("should create a global dynamic module", () => {
      const dynamicModule = InngestModule.forRootGlobal(validConfig);

      expect(dynamicModule).toBeDefined();
      expect(dynamicModule.module).toBe(InngestModule);
      expect(dynamicModule.global).toBe(true);
    });

    it("should have same providers and exports as forRoot", () => {
      const regularModule = InngestModule.forRoot(validConfig);
      const globalModule = InngestModule.forRootGlobal(validConfig);

      // Check providers array lengths and types are the same (exact object equality not possible due to factory functions)
      expect(globalModule.providers).toHaveLength(
        regularModule.providers!.length,
      );
      expect(globalModule.exports).toEqual(regularModule.exports);
      expect(globalModule.controllers).toEqual(regularModule.controllers);
      expect(globalModule.imports).toEqual(regularModule.imports);
    });
  });

  describe("forRootAsync", () => {
    it("should create a dynamic module with async factory configuration", () => {
      const dynamicModule = InngestModule.forRootAsync({
        useFactory: () => ({
          appId: "async-app",
          eventKey: "async-key",
        }),
      });

      expect(dynamicModule).toBeDefined();
      expect(dynamicModule.module).toBe(InngestModule);
      expect(dynamicModule.global).toBe(false);
    });

    it("should include imports from options", () => {
      const TestModule = class {};
      const dynamicModule = InngestModule.forRootAsync({
        imports: [TestModule],
        useFactory: () => validConfig,
      });

      expect(dynamicModule.imports).toContain(DiscoveryModule);
      expect(dynamicModule.imports).toContain(TestModule);
    });

    it("should support useFactory with inject", () => {
      const SERVICE_TOKEN = "SERVICE_TOKEN";
      const dynamicModule = InngestModule.forRootAsync({
        useFactory: (service: any) => ({
          appId: service.appId,
          eventKey: service.eventKey,
        }),
        inject: [SERVICE_TOKEN],
      });

      const configProvider = dynamicModule.providers?.find(
        (provider: any) => provider.provide === INNGEST_CONFIG,
      ) as any;

      expect(configProvider).toBeDefined();
      expect(configProvider.inject).toEqual([SERVICE_TOKEN]);
    });

    it("should support useClass configuration", () => {
      class ConfigService {
        createInngestConfig(): InngestModuleConfig {
          return validConfig;
        }
      }

      const dynamicModule = InngestModule.forRootAsync({
        useClass: ConfigService,
      });

      const providers = dynamicModule.providers || [];
      const hasConfigService = providers.some(
        (provider: any) => provider.provide === ConfigService,
      );

      expect(hasConfigService).toBe(true);
    });
  });

  describe("forRootAsyncGlobal", () => {
    it("should create a global dynamic module with async configuration", () => {
      const dynamicModule = InngestModule.forRootAsyncGlobal({
        useFactory: () => validConfig,
      });

      expect(dynamicModule).toBeDefined();
      expect(dynamicModule.module).toBe(InngestModule);
      expect(dynamicModule.global).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should throw error for missing appId", () => {
      const invalidConfig = {
        eventKey: "test-key",
      } as InngestModuleConfig;

      expect(() => InngestModule.forRoot(invalidConfig)).toThrow();
    });

    it("should not throw error for missing eventKey (eventKey is optional)", () => {
      const configWithoutEventKey = {
        appId: "test-app",
      } as InngestModuleConfig;

      expect(() => InngestModule.forRoot(configWithoutEventKey)).not.toThrow();
    });

    it("should throw error for invalid retry configuration", () => {
      const invalidConfig: InngestModuleConfig = {
        appId: "test-app",
        eventKey: "test-key",
        retry: {
          maxAttempts: -1, // Invalid
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
        },
      };

      expect(() => InngestModule.forRoot(invalidConfig)).toThrow();
    });
  });
});
