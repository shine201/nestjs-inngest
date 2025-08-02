import { Controller, Get, Param, Query, HttpException, HttpStatus } from "@nestjs/common";
import { InngestService, IntrospectionService } from "nestjs-inngest";

/**
 * Debug controller for testing development configurations
 */
@Controller("debug")
export class DebugController {
  constructor(
    private readonly inngestService: InngestService,
    private readonly introspectionService: IntrospectionService,
  ) {}

  /**
   * Get Inngest client configuration for debugging
   */
  @Get("inngest-config")
  getInngestConfig() {
    const client = this.inngestService.getClient();
    
    // Extract some basic info from the client (be careful not to expose secrets)
    return {
      appId: (client as any)._client?.id || "unknown",
      isDev: (client as any)._client?.isDev || false,
      hasSigningKey: !!(client as any)._client?.signingKey,
      hasEventKey: !!(client as any)._client?.eventKey,
      signatureVerificationStatus: (client as any)._client?.signingKey 
        ? "enabled" 
        : "disabled",
      baseUrl: (client as any)._client?.baseUrl || "default",
    };
  }

  /**
   * Test signature verification configuration
   */
  @Get("signature-verification")
  getSignatureVerificationStatus() {
    const client = this.inngestService.getClient();
    const clientConfig = (client as any)._client || {};
    
    return {
      message: "Signature verification configuration",
      isDev: clientConfig.isDev,
      hasSigningKey: !!clientConfig.signingKey,
      signatureVerification: !!clientConfig.signingKey ? "enabled" : "disabled",
      recommendation: !clientConfig.signingKey 
        ? "✅ Signature verification is disabled - suitable for development/testing"
        : "🔒 Signature verification is enabled - required for production",
    };
  }

  // === INTROSPECTION ENDPOINTS ===

  /**
   * Check if introspection is enabled
   */
  @Get("introspection/status")
  getIntrospectionStatus() {
    return {
      enabled: this.introspectionService.isEnabled(),
      message: this.introspectionService.isEnabled() 
        ? "✅ Function introspection is enabled"
        : "❌ Function introspection is disabled. Set development.enableIntrospection: true",
    };
  }

  /**
   * Get all registered functions summary
   */
  @Get("introspection/functions")
  getFunctionsSummary() {
    try {
      const functions = this.introspectionService.getFunctionsSummary();
      return {
        success: true,
        count: functions.length,
        functions,
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : "Failed to get functions",
        HttpStatus.FORBIDDEN
      );
    }
  }

  /**
   * Get detailed information for a specific function
   */
  @Get("introspection/functions/:id")
  getFunctionDetails(@Param("id") functionId: string) {
    try {
      const details = this.introspectionService.getFunctionDetails(functionId);
      if (!details) {
        throw new HttpException("Function not found", HttpStatus.NOT_FOUND);
      }
      return {
        success: true,
        function: details,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error instanceof Error ? error.message : "Failed to get function details",
        HttpStatus.FORBIDDEN
      );
    }
  }

  /**
   * Get registry statistics
   */
  @Get("introspection/stats")
  getRegistryStats() {
    try {
      const stats = this.introspectionService.getRegistryStats();
      return {
        success: true,
        stats,
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : "Failed to get registry stats",
        HttpStatus.FORBIDDEN
      );
    }
  }

  /**
   * Get functions by trigger type
   */
  @Get("introspection/functions-by-trigger/:type")
  getFunctionsByTriggerType(@Param("type") triggerType: "event" | "cron") {
    try {
      if (triggerType !== "event" && triggerType !== "cron") {
        throw new HttpException("Invalid trigger type. Use 'event' or 'cron'", HttpStatus.BAD_REQUEST);
      }
      
      const functions = this.introspectionService.getFunctionsByTriggerType(triggerType);
      return {
        success: true,
        triggerType,
        count: functions.length,
        functions,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error instanceof Error ? error.message : "Failed to get functions by trigger type",
        HttpStatus.FORBIDDEN
      );
    }
  }

  /**
   * Search functions by pattern
   */
  @Get("introspection/search")
  searchFunctions(@Query("q") pattern: string) {
    try {
      if (!pattern) {
        throw new HttpException("Query parameter 'q' is required", HttpStatus.BAD_REQUEST);
      }
      
      const functions = this.introspectionService.searchFunctions(pattern);
      return {
        success: true,
        pattern,
        count: functions.length,
        functions,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error instanceof Error ? error.message : "Failed to search functions",
        HttpStatus.FORBIDDEN
      );
    }
  }

  /**
   * Get all unique event triggers
   */
  @Get("introspection/events")
  getUniqueEventTriggers() {
    try {
      const events = this.introspectionService.getUniqueEventTriggers();
      return {
        success: true,
        count: events.length,
        events,
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : "Failed to get event triggers",
        HttpStatus.FORBIDDEN
      );
    }
  }

  /**
   * Get all unique cron triggers
   */
  @Get("introspection/crons")
  getUniqueCronTriggers() {
    try {
      const crons = this.introspectionService.getUniqueCronTriggers();
      return {
        success: true,
        count: crons.length,
        crons,
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : "Failed to get cron triggers",
        HttpStatus.FORBIDDEN
      );
    }
  }

  /**
   * Validate a specific function configuration
   */
  @Get("introspection/validate/:id")
  validateFunction(@Param("id") functionId: string) {
    try {
      const validation = this.introspectionService.validateFunction(functionId);
      return {
        success: true,
        functionId,
        validation,
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : "Failed to validate function",
        HttpStatus.FORBIDDEN
      );
    }
  }
}