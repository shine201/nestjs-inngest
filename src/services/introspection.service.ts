import { Injectable, Logger } from "@nestjs/common";
import { FunctionRegistry } from "./function-registry.service";
import { DevelopmentMode } from "../utils/development-mode";
import { InngestFunctionMetadata } from "../interfaces/inngest-function.interface";

/**
 * Metadata summary for function introspection (sanitized)
 */
export interface FunctionSummary {
  id: string;
  name: string;
  triggers: any[];
  className?: string;
  methodName: string;
  retries?: number;
  timeout?: number;
  concurrency?: any;
  rateLimit?: any;
}

/**
 * Detailed function information for debugging
 */
export interface FunctionDetails extends FunctionSummary {
  registeredAt: string;
  hasHandler: boolean;
  handlerType: string;
}

/**
 * Registry statistics
 */
export interface RegistryStats {
  totalFunctions: number;
  functionsByTriggerType: {
    event: number;
    cron: number;
  };
  classCount: number;
  averageTriggersPerFunction: number;
}

/**
 * Service for providing function introspection and debugging capabilities
 * Only active when enableIntrospection is true in development configuration
 */
@Injectable()
export class IntrospectionService {
  private readonly logger = new Logger(IntrospectionService.name);

  constructor(private readonly functionRegistry: FunctionRegistry) {}

  /**
   * Check if introspection is enabled
   */
  isEnabled(): boolean {
    return DevelopmentMode.isIntrospectionEnabled();
  }

  /**
   * Get all registered functions summary (sanitized)
   */
  getFunctionsSummary(): FunctionSummary[] {
    if (!this.isEnabled()) {
      throw new Error(
        "Introspection is not enabled. Set development.enableIntrospection: true",
      );
    }

    const functions = this.functionRegistry.getFunctions();
    return functions.map((fn) => this.sanitizeFunctionMetadata(fn));
  }

  /**
   * Get detailed information for a specific function
   */
  getFunctionDetails(functionId: string): FunctionDetails | null {
    if (!this.isEnabled()) {
      throw new Error("Introspection is not enabled");
    }

    const fn = this.functionRegistry.getFunction(functionId);
    if (!fn) {
      return null;
    }

    const summary = this.sanitizeFunctionMetadata(fn);
    return {
      ...summary,
      registeredAt: new Date().toISOString(), // TODO: Track actual registration time
      hasHandler: typeof fn.handler === "function",
      handlerType: typeof fn.handler,
    };
  }

  /**
   * Get registry statistics
   */
  getRegistryStats(): RegistryStats {
    if (!this.isEnabled()) {
      throw new Error("Introspection is not enabled");
    }

    const functions = this.functionRegistry.getFunctions();
    const functionsByTriggerType = { event: 0, cron: 0 };
    const classNames = new Set<string>();
    let totalTriggers = 0;

    functions.forEach((fn) => {
      fn.config.triggers.forEach((trigger) => {
        totalTriggers++;
        if ("event" in trigger) {
          functionsByTriggerType.event++;
        } else if ("cron" in trigger) {
          functionsByTriggerType.cron++;
        }
      });

      if (fn.target?.constructor?.name) {
        classNames.add(fn.target.constructor.name);
      }
    });

    return {
      totalFunctions: functions.length,
      functionsByTriggerType,
      classCount: classNames.size,
      averageTriggersPerFunction:
        functions.length > 0 ? totalTriggers / functions.length : 0,
    };
  }

  /**
   * Get functions by trigger type
   */
  getFunctionsByTriggerType(triggerType: "event" | "cron"): FunctionSummary[] {
    if (!this.isEnabled()) {
      throw new Error("Introspection is not enabled");
    }

    const functions = this.functionRegistry.getFunctions();
    return functions
      .filter((fn) =>
        fn.config.triggers.some((trigger) => triggerType in trigger),
      )
      .map((fn) => this.sanitizeFunctionMetadata(fn));
  }

  /**
   * Get functions by class name
   */
  getFunctionsByClass(className: string): FunctionSummary[] {
    if (!this.isEnabled()) {
      throw new Error("Introspection is not enabled");
    }

    const functions = this.functionRegistry.getFunctions();
    return functions
      .filter((fn) => fn.target?.constructor?.name === className)
      .map((fn) => this.sanitizeFunctionMetadata(fn));
  }

  /**
   * Search functions by pattern
   */
  searchFunctions(pattern: string): FunctionSummary[] {
    if (!this.isEnabled()) {
      throw new Error("Introspection is not enabled");
    }

    const functions = this.functionRegistry.getFunctions();
    const regex = new RegExp(pattern, "i");

    return functions
      .filter(
        (fn) =>
          regex.test(fn.config.id) ||
          regex.test(fn.config.name || "") ||
          regex.test(fn.propertyKey),
      )
      .map((fn) => this.sanitizeFunctionMetadata(fn));
  }

  /**
   * Get all unique trigger events
   */
  getUniqueEventTriggers(): string[] {
    if (!this.isEnabled()) {
      throw new Error("Introspection is not enabled");
    }

    const functions = this.functionRegistry.getFunctions();
    const events = new Set<string>();

    functions.forEach((fn) => {
      fn.config.triggers.forEach((trigger) => {
        if ("event" in trigger && trigger.event) {
          events.add(trigger.event);
        }
      });
    });

    return Array.from(events).sort();
  }

  /**
   * Get all unique cron expressions
   */
  getUniqueCronTriggers(): string[] {
    if (!this.isEnabled()) {
      throw new Error("Introspection is not enabled");
    }

    const functions = this.functionRegistry.getFunctions();
    const crons = new Set<string>();

    functions.forEach((fn) => {
      fn.config.triggers.forEach((trigger) => {
        if ("cron" in trigger && trigger.cron) {
          crons.add(trigger.cron);
        }
      });
    });

    return Array.from(crons).sort();
  }

  /**
   * Validate function configuration
   */
  validateFunction(functionId: string): {
    isValid: boolean;
    issues: string[];
    warnings: string[];
  } {
    if (!this.isEnabled()) {
      throw new Error("Introspection is not enabled");
    }

    const fn = this.functionRegistry.getFunction(functionId);
    if (!fn) {
      return {
        isValid: false,
        issues: ["Function not found"],
        warnings: [],
      };
    }

    const issues: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!fn.config.id) {
      issues.push("Missing function ID");
    }

    if (!fn.config.triggers || fn.config.triggers.length === 0) {
      issues.push("No triggers configured");
    }

    if (!fn.handler || typeof fn.handler !== "function") {
      issues.push("Invalid or missing handler function");
    }

    // Warnings
    if (!fn.config.name) {
      warnings.push("No display name provided");
    }

    if (fn.config.retries === undefined) {
      warnings.push("No retry configuration specified");
    }

    if (fn.config.timeout === undefined) {
      warnings.push("No timeout configuration specified");
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings,
    };
  }

  /**
   * Sanitize function metadata for safe exposure
   * Removes sensitive information and internal implementation details
   */
  private sanitizeFunctionMetadata(
    fn: InngestFunctionMetadata,
  ): FunctionSummary {
    return {
      id: fn.config.id,
      name: fn.config.name || fn.config.id,
      triggers: fn.config.triggers.map((trigger) => {
        // Clone trigger but remove any potential sensitive data
        if ("event" in trigger) {
          return {
            event: trigger.event,
            if: trigger.if ? "[conditional]" : undefined,
          };
        } else if ("cron" in trigger) {
          return {
            cron: trigger.cron,
            timezone: trigger.timezone,
          };
        }
        return trigger;
      }),
      className: fn.target?.constructor?.name,
      methodName: fn.propertyKey,
      retries: fn.config.retries,
      timeout: fn.config.timeout,
      concurrency: fn.config.concurrency,
      rateLimit: fn.config.rateLimit
        ? {
            limit: fn.config.rateLimit.limit,
            period: fn.config.rateLimit.period,
            // Don't expose key for security
          }
        : undefined,
    };
  }
}
