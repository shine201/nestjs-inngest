import { Test, TestingModule } from "@nestjs/testing";
import { InngestModule } from "../inngest.module";
import { InngestController } from "../controllers/inngest.controller";
import { INNGEST_CONFIG } from "../constants";

describe("Endpoint Configuration", () => {
  afterEach(() => {
    // Clean up metadata after each test
    Reflect.deleteMetadata("path", InngestController);
  });

  describe("forRoot with custom endpoint", () => {
    it("should set controller path from endpoint configuration", async () => {
      const customEndpoint = "/custom/webhook/path";

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          InngestModule.forRoot({
            appId: "test-app",
            signingKey: "test-key",
            endpoint: customEndpoint,
          }),
        ],
      }).compile();

      // Check that the metadata was set correctly
      const controllerPath = Reflect.getMetadata("path", InngestController);
      expect(controllerPath).toBe(customEndpoint);

      // Check that the config contains the correct endpoint
      const config = module.get(INNGEST_CONFIG);
      expect(config.endpoint).toBe(customEndpoint);

      await module.close();
    });

    it("should use default endpoint when none specified", async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          InngestModule.forRoot({
            appId: "test-app",
            signingKey: "test-key",
          }),
        ],
      }).compile();

      // Check that the metadata was set to default
      const controllerPath = Reflect.getMetadata("path", InngestController);
      expect(controllerPath).toBe("/api/inngest");

      // Check that the config contains the default endpoint
      const config = module.get(INNGEST_CONFIG);
      expect(config.endpoint).toBe("/api/inngest");

      await module.close();
    });
  });

  describe("forRootAsync with custom endpoint", () => {
    it("should set controller path from async endpoint configuration", async () => {
      const customEndpoint = "/async/webhook";

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          InngestModule.forRootAsync({
            useFactory: () => ({
              appId: "test-app",
              signingKey: "test-key",
              endpoint: customEndpoint,
            }),
          }),
        ],
      }).compile();

      // Give the async configuration time to resolve
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that the metadata was set correctly
      const controllerPath = Reflect.getMetadata("path", InngestController);
      expect(controllerPath).toBe(customEndpoint);

      // Check that the config contains the correct endpoint
      const config = module.get(INNGEST_CONFIG);
      expect(config.endpoint).toBe(customEndpoint);

      await module.close();
    });

    it("should handle various endpoint formats", async () => {
      const testCases = [
        "/webhook",
        "/api/v1/inngest",
        "/custom/path/to/webhook",
        "/inngest-webhook",
      ];

      for (const endpoint of testCases) {
        const module: TestingModule = await Test.createTestingModule({
          imports: [
            InngestModule.forRootAsync({
              useFactory: () => ({
                appId: "test-app",
                signingKey: "test-key",
                endpoint,
              }),
            }),
          ],
        }).compile();

        // Give the async configuration time to resolve
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Check that the metadata was set correctly
        const controllerPath = Reflect.getMetadata("path", InngestController);
        expect(controllerPath).toBe(endpoint);

        await module.close();

        // Clean up between iterations
        Reflect.deleteMetadata("path", InngestController);
      }
    });
  });

  describe("endpoint validation", () => {
    it("should reject invalid endpoint formats", () => {
      const invalidEndpoints = [
        "invalid-endpoint", // Should start with /
      ];

      for (const endpoint of invalidEndpoints) {
        expect(() => {
          InngestModule.forRoot({
            appId: "test-app",
            signingKey: "test-key",
            endpoint,
          });
        }).toThrow("endpoint must be a valid path starting with /");
      }
    });

    it("should allow valid endpoint formats", async () => {
      const validEndpoints = [
        "/webhook",
        "/api/inngest",
        "/v1/webhooks/inngest",
        "/custom-path_123",
      ];

      for (const endpoint of validEndpoints) {
        const module = await Test.createTestingModule({
          imports: [
            InngestModule.forRoot({
              appId: "test-app",
              signingKey: "test-key",
              endpoint,
            }),
          ],
        }).compile();

        expect(module).toBeDefined();
        const controllerPath = Reflect.getMetadata("path", InngestController);
        expect(controllerPath).toBe(endpoint);

        await module.close();
        Reflect.deleteMetadata("path", InngestController);
      }
    });
  });
});
