import { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "@nestjs/common";
import { join } from "path";
import { InngestService } from "nestjs-inngest";

/**
 * Configure Express-specific settings for the NestJS application
 */
export async function configureExpress(app: NestExpressApplication): Promise<void> {
  const logger = new Logger("ExpressConfig");

  // Configure static file serving
  app.useStaticAssets(join(__dirname, "..", "..", "public"), {
    index: "index.html",
  });

  // Configure body parsers
  app.useBodyParser("json", { limit: "10mb" });

  logger.debug("Express configuration completed");
}

/**
 * Setup Inngest serve middleware
 */
export async function setupInngestMiddleware(app: NestExpressApplication): Promise<void> {
  const logger = new Logger("InngestMiddleware");

  try {
    const inngestService = app.get(InngestService);
    const serveMiddleware = await inngestService.createServe('express');

    // Wrap serve middleware with error handling
    app.use("/api/inngest", (req, res, next) => {
      console.log(`[DEBUG] Received ${req.method} ${req.url}`);
      serveMiddleware(req, res, (err) => {
        if (err) {
          console.error("[ERROR] Serve middleware error:", err);
          res.status(500).json({ error: err.message });
        } else {
          next();
        }
      });
    });

    logger.log("✅ Inngest middleware setup completed");
  } catch (error) {
    logger.error("❌ Failed to setup Inngest middleware:", error);
    throw error;
  }
}