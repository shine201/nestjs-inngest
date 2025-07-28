import { Test, TestingModule } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Module } from "@nestjs/common";
import request from "supertest";
import { InngestModule } from "../../inngest.module";

@Module({
  imports: [
    InngestModule.forRoot({
      appId: "express-e2e-test-app",
      signingKey: "express-e2e-test-signing-key-that-is-long-enough",
      endpoint: "/api/inngest",
      env: "test",
      isDev: true,
      logger: false,
      timeout: 5000,
      development: {
        enabled: true,
        disableSignatureVerification: true,
      },
      httpPlatform: "express",
    }),
  ],
})
class ExpressE2ETestModule {}

describe("Real Express E2E Integration", () => {
  let app: NestExpressApplication;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ExpressE2ETestModule],
    }).compile();

    // Create REAL Express application using default NestJS adapter (Express)
    app = module.createNestApplication<NestExpressApplication>();

    // Note: NestJS handles JSON parsing by default, so we don't need custom raw body middleware for testing

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (module) {
      await module.close();
    }
  });

  describe("Real Express Platform Integration", () => {
    it("should successfully create and start an Express application", async () => {
      expect(app).toBeDefined();
      expect(app.getHttpAdapter().getInstance()).toBeDefined();
      expect(app.getHttpAdapter().getInstance().listen).toBeDefined();
    });

    it("should handle PUT requests through real Express", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/inngest")
        .expect(200);

      expect(response.body).toHaveProperty("functions");
      expect(response.body).toHaveProperty("sdk");
      expect(response.body.sdk.name).toBe("nest-inngest");
      expect(response.body.sdk.platform).toBe("express");

      // Verify functions array exists (even if empty)
      expect(Array.isArray(response.body.functions)).toBe(true);
    });

    it("should properly handle JSON content type in Express", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/inngest")
        .expect(200);

      expect(response.headers["content-type"]).toMatch(/application\/json/);
      expect(response.body.sdk.platform).toBe("express");
    });

    it("should handle error cases in real Express", async () => {
      const malformedRequest = {
        invalid: "request",
        missing: "required_fields",
      };

      const response = await request(app.getHttpServer())
        .post("/api/inngest")
        .send(malformedRequest);

      // Should return an error (either 404 or 500)
      expect([404, 500]).toContain(response.status);
      expect(response.body).toHaveProperty("error");
    });

    it("should handle missing function in real Express", async () => {
      const webhookRequest = {
        function_id: "non-existent-express-function",
        event: {
          name: "test.nonexistent",
          data: { message: "This should fail" },
        },
        run_id: "missing-function-test",
        attempt: 1,
      };

      const response = await request(app.getHttpServer())
        .post("/api/inngest")
        .send(webhookRequest);

      // Should return an error (either 404 or 500)
      expect([404, 500]).toContain(response.status);
      expect(response.body).toHaveProperty("error");
      if (response.status === 404) {
        expect(response.body.error.message).toContain(
          "Inngest function not found: non-existent-express-function",
        );
      }
    });
  });

  describe("Platform Adapter Verification in Real Express", () => {
    it("should correctly detect platform as Express in real requests", async () => {
      // This test verifies that our platform detection works with REAL Express requests
      const response = await request(app.getHttpServer())
        .put("/api/inngest")
        .expect(200);

      // The SDK response should indicate Express platform
      expect(response.body.sdk.platform).toBe("express");

      // Verify the response structure is correct
      expect(response.body.sdk).toMatchObject({
        name: "nest-inngest",
        version: expect.any(String),
        language: "typescript",
        framework: "nestjs",
        platform: "express",
      });
    });

    it("should handle Express-specific request properties", async () => {
      // Test that Express adapter properly handles Express-specific features
      const response = await request(app.getHttpServer())
        .put("/api/inngest")
        .set("User-Agent", "Express-E2E-Test")
        .expect(200);

      expect(response.body.sdk.platform).toBe("express");
      expect(response.body).toHaveProperty("functions");
    });
  });

  describe("Performance and Behavior Verification", () => {
    it("should handle concurrent requests in real Express", async () => {
      const requests = Array.from({ length: 3 }, (_, i) =>
        request(app.getHttpServer()).put("/api/inngest").expect(200),
      );

      const responses = await Promise.all(requests);

      responses.forEach((response, index) => {
        expect(response.body.sdk.platform).toBe("express");
        expect(response.body).toHaveProperty("sdk");
        expect(response.body).toHaveProperty("functions");
      });
    });

    it("should maintain correct headers in real Express responses", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/inngest")
        .expect(200);

      expect(response.headers["content-type"]).toMatch(/application\/json/);
      expect(response.body.sdk.platform).toBe("express");
    });

    it("should handle various HTTP methods in Express", async () => {
      // Test PUT (function introspection)
      const putResponse = await request(app.getHttpServer())
        .put("/api/inngest")
        .expect(200);

      expect(putResponse.body.sdk.platform).toBe("express");

      // Test OPTIONS (CORS preflight)
      const optionsResponse = await request(app.getHttpServer()).options(
        "/api/inngest",
      );

      // Options should be handled appropriately (may return 404 or 200 depending on setup)
      expect([200, 404]).toContain(optionsResponse.status);
    });

    it("should handle raw body processing in Express", async () => {
      // Test that Express can handle JSON body processing
      const testData = { test: "raw body processing" };

      const response = await request(app.getHttpServer())
        .post("/api/inngest")
        .send(testData);

      // Should return an error (either 404 or 500) but should process the body
      expect([404, 500]).toContain(response.status);
      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Express vs Platform Detection Comparison", () => {
    it("should consistently detect Express platform across multiple requests", async () => {
      const responses = await Promise.all([
        request(app.getHttpServer()).put("/api/inngest").expect(200),
        request(app.getHttpServer()).put("/api/inngest").expect(200),
        request(app.getHttpServer()).put("/api/inngest").expect(200),
      ]);

      responses.forEach((response) => {
        expect(response.body.sdk.platform).toBe("express");
      });
    });

    it("should provide Express-specific SDK information", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/inngest")
        .expect(200);

      expect(response.body.sdk).toEqual({
        name: "nest-inngest",
        version: expect.any(String),
        language: "typescript",
        framework: "nestjs",
        platform: "express",
      });
    });
  });

  describe("Express Middleware Integration", () => {
    it("should work with Express middleware stack", async () => {
      // Test that our Inngest controller integrates properly with Express middleware
      const response = await request(app.getHttpServer())
        .put("/api/inngest")
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .expect(200);

      expect(response.body.sdk.platform).toBe("express");
      expect(response.headers["content-type"]).toMatch(/application\/json/);
    });
  });
});
