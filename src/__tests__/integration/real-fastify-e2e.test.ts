import { Test, TestingModule } from "@nestjs/testing";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Module } from "@nestjs/common";
import request from "supertest";
import { InngestModule } from "../../inngest.module";

@Module({
  imports: [
    InngestModule.forRoot({
      appId: "fastify-e2e-test-app",
      signingKey: "fastify-e2e-test-signing-key-that-is-long-enough",
      endpoint: "/api/inngest",
      env: "test",
      isDev: true,
      logger: false,
      timeout: 5000,
      development: {
        enabled: true,
        disableSignatureVerification: true,
      },
      httpPlatform: "fastify",
    }),
  ],
})
class FastifyE2ETestModule {}

describe("Real Fastify E2E Integration", () => {
  let app: NestFastifyApplication;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [FastifyE2ETestModule],
    }).compile();

    // Create REAL Fastify application using NestJS FastifyAdapter
    const fastifyAdapter = new FastifyAdapter();
    app = module.createNestApplication<NestFastifyApplication>(fastifyAdapter);

    // Register raw-body plugin for signature verification
    await app.register(require("fastify-raw-body"), {
      field: "rawBody",
      global: false,
      encoding: "utf8",
      runFirst: true,
      routes: ["/api/inngest"],
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (module) {
      await module.close();
    }
  });

  describe("Real Fastify Platform Integration", () => {
    it("should successfully create and start a Fastify application", async () => {
      expect(app).toBeDefined();
      expect(app.getHttpAdapter().getInstance().server).toBeDefined();
    });

    it("should handle PUT requests through real Fastify", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/inngest")
        .expect(200);

      expect(response.body).toHaveProperty("functions");
      expect(response.body).toHaveProperty("sdk");
      expect(response.body.sdk.name).toBe("nest-inngest");
      expect(response.body.sdk.platform).toBe("fastify");

      // Verify functions array exists (even if empty)
      expect(Array.isArray(response.body.functions)).toBe(true);
    });

    it("should properly handle JSON content type in Fastify", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/inngest")
        .expect(200);

      expect(response.headers["content-type"]).toMatch(/application\/json/);
      expect(response.body.sdk.platform).toBe("fastify");
    });

    it("should handle error cases in real Fastify", async () => {
      const malformedRequest = {
        invalid: "request",
        missing: "required_fields",
      };

      const response = await request(app.getHttpServer())
        .post("/api/inngest")
        .send(malformedRequest)
        .expect(404);

      expect(response.body).toHaveProperty("error");
    });

    it("should handle missing function in real Fastify", async () => {
      const webhookRequest = {
        function_id: "non-existent-function",
        event: {
          name: "test.nonexistent",
          data: { message: "This should fail" },
        },
        run_id: "missing-function-test",
        attempt: 1,
      };

      const response = await request(app.getHttpServer())
        .post("/api/inngest")
        .send(webhookRequest)
        .expect(404);

      expect(response.body.error.message).toContain(
        "Inngest function not found: non-existent-function",
      );
    });
  });

  describe("Platform Adapter Verification in Real Fastify", () => {
    it("should correctly detect platform as Fastify in real requests", async () => {
      // This test verifies that our platform detection works with REAL Fastify requests
      const response = await request(app.getHttpServer())
        .put("/api/inngest")
        .expect(200);

      // The SDK response should indicate Fastify platform
      expect(response.body.sdk.platform).toBe("fastify");

      // Verify the response structure is correct
      expect(response.body.sdk).toMatchObject({
        name: "nest-inngest",
        version: expect.any(String),
        language: "typescript",
        framework: "nestjs",
        platform: "fastify",
      });
    });
  });

  describe("Performance and Behavior Verification", () => {
    it("should handle concurrent requests in real Fastify", async () => {
      const requests = Array.from({ length: 3 }, (_, i) =>
        request(app.getHttpServer()).put("/api/inngest").expect(200),
      );

      const responses = await Promise.all(requests);

      responses.forEach((response, index) => {
        expect(response.body.sdk.platform).toBe("fastify");
        expect(response.body).toHaveProperty("sdk");
        expect(response.body).toHaveProperty("functions");
      });
    });

    it("should maintain correct headers in real Fastify responses", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/inngest")
        .expect(200);

      expect(response.headers["content-type"]).toMatch(/application\/json/);
      expect(response.body.sdk.platform).toBe("fastify");
    });
  });
});
