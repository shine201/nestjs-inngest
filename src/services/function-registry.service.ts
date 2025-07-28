import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DiscoveryService, MetadataScanner, ModuleRef } from "@nestjs/core";
import { InstanceWrapper } from "@nestjs/core/injector/instance-wrapper";
import {
  InngestFunctionMetadata,
  InngestFunctionConfig,
} from "../interfaces/inngest-function.interface";
import { InngestFunctionError } from "../errors";
import { METADATA_KEYS, ERROR_MESSAGES } from "../constants";
import { getInngestFunctionMetadata } from "../decorators/inngest-function.decorator";

/**
 * Registry for managing Inngest functions
 */
@Injectable()
export class FunctionRegistry implements OnModuleInit {
  private readonly logger = new Logger(FunctionRegistry.name);
  private readonly functions = new Map<string, InngestFunctionMetadata>();
  private readonly functionsByClass = new Map<any, InngestFunctionMetadata[]>();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Initializes the registry by discovering all Inngest functions
   */
  async onModuleInit(): Promise<void> {
    await this.discoverFunctions();
    this.logger.log(`Discovered ${this.functions.size} Inngest function(s)`);
  }

  /**
   * Discovers all Inngest functions in the application
   */
  private async discoverFunctions(): Promise<void> {
    const providers = this.discoveryService.getProviders();

    for (const wrapper of providers) {
      await this.scanProvider(wrapper);
    }
  }

  /**
   * Scans a provider for Inngest functions
   */
  private async scanProvider(wrapper: InstanceWrapper): Promise<void> {
    if (!wrapper.metatype || !wrapper.instance) {
      return;
    }

    const { instance, metatype } = wrapper;
    const prototype = Object.getPrototypeOf(instance);

    // Get function metadata from the class
    const functionMetadata = getInngestFunctionMetadata(prototype);

    if (functionMetadata.length === 0) {
      return;
    }

    this.logger.debug(
      `Found ${functionMetadata.length} Inngest function(s) in ${metatype.name}`,
    );

    // Process each function
    for (const meta of functionMetadata) {
      await this.registerFunction(instance, meta.propertyKey, meta.config);
    }

    // Store functions by class for easier lookup
    this.functionsByClass.set(metatype, functionMetadata);
  }

  /**
   * Registers a single Inngest function
   */
  async registerFunction(
    target: any,
    propertyKey: string,
    config: InngestFunctionConfig,
  ): Promise<void> {
    try {
      // Check for duplicate function IDs across the entire application
      if (this.functions.has(config.id)) {
        const existing = this.functions.get(config.id)!;

        // Allow overriding in test environment
        if (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID) {
          this.logger.warn(
            `Overriding function "${config.id}" in test environment`,
          );
          this.functions.delete(config.id);
          // Also remove from functionsByClass
          const existingClassFunctions =
            this.functionsByClass.get(existing.target) || [];
          const filteredFunctions = existingClassFunctions.filter(
            (fn) => fn.config.id !== config.id,
          );
          this.functionsByClass.set(existing.target, filteredFunctions);
        } else {
          throw new InngestFunctionError(
            `${ERROR_MESSAGES.DUPLICATE_FUNCTION_ID}: Function ID "${config.id}" is already registered in ${existing.target.constructor.name}.${existing.propertyKey}`,
            config.id,
          );
        }
      }

      // Validate that the method exists and is callable
      const method = target[propertyKey];
      if (typeof method !== "function") {
        throw new InngestFunctionError(
          `Method "${propertyKey}" is not a function`,
          config.id,
        );
      }

      // Create function metadata
      const metadata: InngestFunctionMetadata = {
        target,
        propertyKey,
        config,
        handler: method.bind(target), // Bind the method to the instance
      };

      // Register the function
      this.functions.set(config.id, metadata);

      this.logger.debug(
        `Registered Inngest function: ${config.id} (${target.constructor.name}.${propertyKey})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to register Inngest function "${config.id}":`,
        error,
      );
      throw error;
    }
  }

  /**
   * Gets all registered Inngest functions
   */
  getFunctions(): InngestFunctionMetadata[] {
    return Array.from(this.functions.values());
  }

  /**
   * Gets a specific function by ID
   */
  getFunction(id: string): InngestFunctionMetadata | undefined {
    return this.functions.get(id);
  }

  /**
   * Gets functions registered for a specific class
   */
  getFunctionsByClass(target: any): InngestFunctionMetadata[] {
    return this.functionsByClass.get(target) || [];
  }

  /**
   * Checks if a function is registered
   */
  hasFunction(id: string): boolean {
    return this.functions.has(id);
  }

  /**
   * Gets all function IDs
   */
  getFunctionIds(): string[] {
    return Array.from(this.functions.keys());
  }

  /**
   * Gets function count
   */
  getFunctionCount(): number {
    return this.functions.size;
  }

  /**
   * Clear all registered functions (for testing purposes)
   */
  clearFunctions(): void {
    this.functions.clear();
    this.functionsByClass.clear();
  }

  /**
   * Creates Inngest function definitions for the Inngest client
   */
  createInngestFunctions(): any[] {
    const inngestFunctions: any[] = [];

    for (const metadata of this.functions.values()) {
      try {
        const inngestFunction = this.createInngestFunction(metadata);
        inngestFunctions.push(inngestFunction);
      } catch (error) {
        this.logger.error(
          `Failed to create Inngest function for "${metadata.config.id}":`,
          error,
        );
        throw new InngestFunctionError(
          `Failed to create Inngest function for "${metadata.config.id}"`,
          metadata.config.id,
          error as Error,
        );
      }
    }

    return inngestFunctions;
  }

  /**
   * Creates a single Inngest function definition
   */
  private createInngestFunction(metadata: InngestFunctionMetadata): any {
    const { config, handler } = metadata;

    // Validate handler is still a function
    if (typeof handler !== "function") {
      throw new Error(`Handler for function "${config.id}" is not a function`);
    }

    // Build the function configuration for Inngest
    const inngestConfig: any = {
      id: config.id,
      name: config.name,
    };

    // Add optional configuration
    if (config.concurrency !== undefined) {
      inngestConfig.concurrency = config.concurrency;
    }

    if (config.rateLimit !== undefined) {
      inngestConfig.rateLimit = config.rateLimit;
    }

    if (config.retries !== undefined) {
      inngestConfig.retries = config.retries;
    }

    if (config.timeout !== undefined) {
      inngestConfig.timeout = config.timeout;
    }

    // Convert triggers to Inngest format
    const triggers = config.triggers.map((trigger) => {
      if ("event" in trigger) {
        const eventTrigger: any = { event: trigger.event };
        if (trigger.if) {
          eventTrigger.if = trigger.if;
        }
        return eventTrigger;
      } else if ("cron" in trigger) {
        return { cron: trigger.cron };
      }
      throw new InngestFunctionError(
        `Invalid trigger type for function "${config.id}"`,
        config.id,
      );
    });

    // Return the Inngest function definition
    return {
      ...inngestConfig,
      triggers,
      handler,
    };
  }

  /**
   * Validates all registered functions
   */
  validateFunctions(): void {
    const errors: string[] = [];

    for (const [id, metadata] of this.functions.entries()) {
      try {
        // Validate that the handler is still callable
        if (typeof metadata.handler !== "function") {
          errors.push(`Function "${id}": Handler is not a function`);
        }

        // Validate that the target instance still exists
        if (!metadata.target) {
          errors.push(`Function "${id}": Target instance is null or undefined`);
        }

        // Validate configuration
        if (
          !metadata.config.triggers ||
          metadata.config.triggers.length === 0
        ) {
          errors.push(`Function "${id}": No triggers defined`);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errors.push(`Function "${id}": Validation error - ${errorMessage}`);
      }
    }

    if (errors.length > 0) {
      throw new InngestFunctionError(
        `Function validation failed:\n${errors.join("\n")}`,
        "validation",
      );
    }
  }

  /**
   * Gets registry statistics
   */
  getStats(): {
    totalFunctions: number;
    functionsByTriggerType: Record<string, number>;
    functionsByClass: Record<string, number>;
  } {
    const stats = {
      totalFunctions: this.functions.size,
      functionsByTriggerType: {} as Record<string, number>,
      functionsByClass: {} as Record<string, number>,
    };

    for (const metadata of this.functions.values()) {
      // Count by trigger type
      for (const trigger of metadata.config.triggers) {
        const triggerType = "event" in trigger ? "event" : "cron";
        stats.functionsByTriggerType[triggerType] =
          (stats.functionsByTriggerType[triggerType] || 0) + 1;
      }

      // Count by class
      const className = metadata.target.constructor.name;
      stats.functionsByClass[className] =
        (stats.functionsByClass[className] || 0) + 1;
    }

    return stats;
  }

  /**
   * Clears all registered functions (mainly for testing)
   */
  clear(): void {
    this.functions.clear();
    this.functionsByClass.clear();
    this.logger.debug("Function registry cleared");
  }
}
