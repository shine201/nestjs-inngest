import { Logger } from "@nestjs/common";
import { serve } from "inngest/express";
import { InngestService } from "../services/inngest.service";
import { FunctionRegistry } from "../services/function-registry.service";

/**
 * Simple helper function to setup Inngest serve middleware
 * Similar to official Inngest examples
 */
export async function setupInngest(
  app: any,
  endpoint: string = "/api/inngest",
): Promise<void> {
  try {
    // Get services from NestJS app
    const inngestService = app.get(InngestService);
    const functionRegistry = app.get(FunctionRegistry);

    // Get Inngest client and functions
    const client = inngestService.getClient();

    const functionDefs = functionRegistry.createInngestFunctions();
    console.log(
      `🔍 setupInngest: Created ${functionDefs.length} function definitions`,
    );

    if (functionDefs.length === 0) {
      throw new Error("No functions registered within your app");
    }

    // Convert to Inngest function format
    const functions = functionDefs.map((def) => {
      const config: any = {
        id: def.id,
        name: def.name,
      };

      if (def.concurrency) config.concurrency = def.concurrency;
      if (def.rateLimit) config.rateLimit = def.rateLimit;
      if (def.retries) config.retries = def.retries;
      if (def.timeout) config.timeouts = def.timeout;

      return client.createFunction(config, def.triggers, def.handler);
    });

    // Create serve middleware
    const serveMiddleware = serve({
      client,
      functions,
    });

    // Get the underlying Express app and register middleware directly
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use(endpoint, serveMiddleware);

    console.log(`✅ Inngest serve middleware registered at ${endpoint}`);
    console.log(`📊 Found ${functions.length} Inngest functions`);
  } catch (error) {
    console.error("❌ Failed to setup Inngest:", error);
    throw error;
  }
}
