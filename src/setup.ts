import { Logger } from '@nestjs/common';
import { InngestService } from './services/inngest.service';

/**
 * Simple helper to setup Inngest middleware/plugin automatically
 * This encapsulates all the complexity and provides a clean API for users
 * 
 * Includes intelligent conflict detection to avoid double-registration
 */
export async function setupInngest(app: any): Promise<void> {
  try {
    const inngestService = app.get(InngestService);
    
    // Get configuration - handle both sync and async config getters
    const config = typeof inngestService.getConfig === 'function' 
      ? inngestService.getConfig() 
      : inngestService.config || {};
    
    const endpoint = config.endpoint || '/api/inngest';
    
    // Conflict check 1: If already using controller mode, skip
    if (config.serveMode === 'controller') {
      console.warn(`⚠️ Inngest is configured with controller mode (serveMode: 'controller'). Skipping setupInngest() call.`);
      console.log(`💡 Remove setupInngest() from main.ts or change serveMode to 'middleware' in your Inngest configuration.`);
      return;
    }
    
    // Conflict check 2: Check if route is already registered by controller
    if (await isRouteAlreadyRegistered(app, endpoint)) {
      console.warn(`⚠️ Route ${endpoint} is already registered (likely by InngestController). Skipping setupInngest().`);
      console.log(`💡 This usually means you have serveMode: 'controller' but called setupInngest(). Choose one approach.`);
      return;
    }
    
    // Only setup if using middleware mode
    if (config.serveMode !== 'middleware') {
      // Not explicitly middleware mode, skip silently
      return;
    }
    
    const connectionMethods = inngestService.getConnectionMethods();
    
    // Only setup if serve mode is enabled
    if (!connectionMethods.serve) {
      return; // Skip silently
    }
    
    // Auto-detect platform and create appropriate setup
    const serveSetup = await inngestService.createServeMiddleware();
    
    if (!serveSetup) {
      console.warn('⚠️ Failed to create serve middleware. Check your Inngest configuration.');
      return;
    }
    
    // Auto-setup based on platform
    await autoSetupServe(app, serveSetup, endpoint);
    
    console.log(`✅ Inngest middleware automatically registered at ${endpoint}`);
    
  } catch (error) {
    // Log error in development for debugging
    if (process.env.NODE_ENV === 'development') {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('⚠️ setupInngest() failed (this might be normal if using controller mode):', errorMessage);
    }
  }
}

/**
 * Checks if a route is already registered (to detect controller conflicts)
 */
async function isRouteAlreadyRegistered(app: any, endpoint: string): Promise<boolean> {
  try {
    // For Express apps
    if (app._router) {
      const routes = app._router.stack || [];
      for (const layer of routes) {
        if (layer.route && layer.route.path === endpoint) {
          return true;
        }
        // Check for router middleware that might handle the path
        if (layer.regexp && layer.regexp.test(endpoint)) {
          return true;
        }
      }
    }
    
    // For Fastify apps - this is harder to check, so we'll rely on configuration check
    // Fastify doesn't expose registered routes easily
    
    // Additional check: try to make a test request to see if route exists
    // This is more reliable but requires the app to be listening
    return false;
  } catch (error) {
    // If we can't determine, assume it's not registered
    return false;
  }
}

/**
 * Internal function to auto-setup serve middleware/plugin
 */
async function autoSetupServe(app: any, serveSetup: any, endpoint: string): Promise<void> {
  // Detect platform type
  const isFastifyApp = typeof app.register === 'function';
  const isExpressApp = typeof app.use === 'function' && !app.register;
  
  if (isFastifyApp && serveSetup.plugin) {
    // Fastify setup
    await app.register(serveSetup.plugin, serveSetup.options);
  } else if (isExpressApp && typeof serveSetup === 'function') {
    // Express setup
    app.use(endpoint, serveSetup);
  } else {
    throw new Error('Unable to determine platform or invalid serve setup');
  }
}