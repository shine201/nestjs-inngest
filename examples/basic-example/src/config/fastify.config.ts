import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger } from "@nestjs/common";
import { InngestService } from "nestjs-inngest";

/**
 * Configure Fastify-specific settings for the NestJS application
 */
export async function configureFastify(app: NestFastifyApplication): Promise<void> {
  const logger = new Logger("FastifyConfig");

  // Configure static file serving for Fastify
  try {
    const path = require('path');
    await app.register(require('@fastify/static'), {
      root: path.join(__dirname, '..', '..', 'public'),
      prefix: '/public/',
    });
    logger.debug("Static file serving configured");
  } catch (error) {
    logger.warn("Failed to configure static files, continuing without static serve:", error.message);
  }

  logger.debug("Fastify configuration completed");
}

/**
 * Setup Inngest Fastify plugin
 */
export async function setupInngestFastifyPlugin(app: NestFastifyApplication): Promise<void> {
  const logger = new Logger("InngestFastifyPlugin");

  try {
    const inngestService = app.get(InngestService);
    const { plugin, options } = await inngestService.createServe('fastify');

    // Register the Inngest plugin with Fastify
    await app.register(plugin, {
      ...options,
      // You can add additional Fastify-specific options here
      prefix: '/api/inngest', // This sets the route prefix
    });

    logger.log("✅ Inngest Fastify plugin setup completed");
  } catch (error) {
    logger.error("❌ Failed to setup Inngest Fastify plugin:", error);
    throw error;
  }
}