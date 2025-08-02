import {
  Injectable,
  Inject,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { Inngest, EventSchemas } from "inngest";
import {
  InngestEvent,
  InngestEventBatch,
  EventSchemaRegistry,
  DefaultEventRegistry,
} from "../interfaces/inngest-event.interface";
import { MergedInngestConfig } from "../utils/config-validation";
import { InngestEventError } from "../errors";
import { INNGEST_CONFIG, ERROR_MESSAGES } from "../constants";
import { TypedEventBuilder } from "../utils/event-types";
import {
  ValidationErrorReporter,
  ValidationResult,
  EventValidator,
  TypeChecker,
} from "../utils/validation-error-reporter";
import { FunctionRegistry } from "./function-registry.service";
import { InngestFunctionMetadata } from "../interfaces/inngest-function.interface";
import { ModuleRef } from "@nestjs/core";
import { DevelopmentMode } from "../utils/development-mode";
import { serve as ExpressServe } from "inngest/express";
import { serve as FastifyServe, fastifyPlugin } from "inngest/fastify";
import { connect } from "inngest/connect";

/**
 * Retry options for event sending
 */
interface RetryOptions {
  attempt: number;
  maxAttempts: number;
  delay: number;
}

/**
 * Service for interacting with Inngest
 */
@Injectable()
export class InngestService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InngestService.name);
  private inngestClient: Inngest;
  private readonly eventBuilder: TypedEventBuilder<DefaultEventRegistry> =
    new TypedEventBuilder();
  private connection: any = null;

  constructor(
    @Inject(INNGEST_CONFIG) private readonly config: MergedInngestConfig,
    private readonly functionRegistry: FunctionRegistry,
    private moduleRef: ModuleRef,
  ) {
    this.logger.log(
      `Inngest service initialized for app: ${this.config.appId}`,
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    // Wait for function discovery first
    await this.functionRegistry.waitForDiscovery();

    // Ensure client is initialized
    await this.ensureClientInitialized();

    await this.runningTask();
  }
  /**
   * See:
   * https://github.com/nestjs/nest/pull/14914
   * https://github.com/nestjs/nest/issues/14911
   */
  async runningTask() {
    if (this.config.enableConnect) {
      await this.connectToInngest();
    }
  }
  /**
   * Creates and configures the Inngest client
   */
  private createInngestClient(): Inngest {
    const clientConfig: any = {
      id: this.config.appId,
      isDev: this.config.isDev,
    };

    // Add event key if provided
    if (this.config.eventKey) {
      clientConfig.eventKey = this.config.eventKey;
    }

    // Handle signature verification configuration
    const shouldDisableSignatureVerification =
      DevelopmentMode.shouldDisableSignatureVerification();

    if (shouldDisableSignatureVerification) {
      this.logger.log(
        "🔓 Signature verification disabled by development configuration",
      );
      // Force development mode when signature verification is disabled
      clientConfig.isDev = true;
      // Don't add signing key to disable verification
    } else {
      // Add signing key if provided (REQUIRED for serve mode in production)
      if (this.config.signingKey) {
        clientConfig.signingKey = this.config.signingKey;
      } else if (!this.config.isDev) {
        this.logger.warn(
          "⚠️ No signing key provided for production mode. This may cause webhook verification failures.",
        );
      }
    }

    // Add base URL if provided
    if (this.config.baseUrl) {
      clientConfig.baseUrl = this.config.baseUrl;
    }

    // Configure logging
    if (!this.config.logger) {
      clientConfig.logger = { level: "silent" };
    }

    // Set schemas with discovered events
    clientConfig.schemas = new EventSchemas().fromRecord();
    try {
      const client = new Inngest(clientConfig);
      this.logger.debug("Inngest client created successfully");
      return client;
    } catch (error) {
      this.logger.error("Failed to create Inngest client", error);
      throw new InngestEventError(
        "Failed to initialize Inngest client",
        undefined,
        error as Error,
      );
    }
  }

  /**
   * Gets the underlying Inngest client instance
   */
  getClient(): Inngest {
    return this.inngestClient;
  }

  /**
   * Sends a single event to Inngest
   */
  async send(event: InngestEvent): Promise<void>;
  /**
   * Sends multiple events to Inngest
   */
  async send(events: InngestEventBatch): Promise<void>;
  /**
   * Implementation for sending events
   */
  async send(eventOrEvents: InngestEvent | InngestEventBatch): Promise<void> {
    if (!this.config.eventKey) {
      throw new InngestEventError(
        "Event key is required for sending events. Please configure eventKey in your Inngest module.",
      );
    }

    const events = Array.isArray(eventOrEvents)
      ? eventOrEvents
      : [eventOrEvents];

    // Validate events before sending - let validation errors bubble up
    this.validateEvents(events);

    // Send events with retry logic
    await this.sendWithRetry(events);
  }

  /**
   * Validates events before sending
   */
  private validateEvents(events: InngestEvent[]): void {
    if (!events || events.length === 0) {
      throw new InngestEventError("At least one event must be provided");
    }

    if (events.length > this.config.maxBatchSize) {
      throw new InngestEventError(
        `Batch size exceeds maximum allowed (${this.config.maxBatchSize}). Got ${events.length} events.`,
      );
    }

    events.forEach((event, index) => {
      this.validateSingleEvent(event, index);
    });
  }

  /**
   * Validates a single event with comprehensive error reporting
   */
  private validateSingleEvent(event: InngestEvent, index?: number): void {
    const eventContext = index !== undefined ? ` at index ${index}` : "";
    const reporter = new ValidationErrorReporter();

    // Basic structure validation
    EventValidator.validateEventStructure(event, reporter);

    // Event name format validation
    if (event?.name) {
      EventValidator.validateEventNameFormat(
        event.name,
        reporter,
        this.config.strict,
      );
    }

    // Data serialization validation
    if (event?.data !== undefined) {
      EventValidator.validateEventDataSerialization(event.data, reporter);
    }

    // Schema-based validation if available
    if (event?.name && event?.data !== undefined) {
      this.validateEventWithSchema(event, reporter);
    }

    // Throw if any validation errors occurred
    reporter.throwIfErrors(event?.name);

    this.logger.debug(
      `Event${eventContext} passed all validation checks: ${event?.name}`,
    );
  }

  /**
   * Validates event against registered schema using error reporter
   */
  private validateEventWithSchema(
    event: InngestEvent,
    reporter: ValidationErrorReporter,
  ): void {
    const schema = this.eventBuilder.getSchema(
      event.name as string & keyof DefaultEventRegistry,
    );
    if (schema) {
      try {
        if (!this.eventBuilder.validateEvent(event as any)) {
          reporter.addCustomError(
            "event.data",
            `Schema validation failed for event type: ${event.name}`,
            "SCHEMA_VALIDATION_FAILED",
            "valid data according to schema",
            event.data,
          );
        } else {
          this.logger.debug(`Event passed schema validation: ${event.name}`);
        }
      } catch (error) {
        reporter.addCustomError(
          "event.data",
          `Schema validation error: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "SCHEMA_VALIDATION_ERROR",
          "valid data according to schema",
          event.data,
        );
      }
    }
  }

  /**
   * Validate an event and return detailed validation result
   */
  validateEventWithDetails(event: InngestEvent): ValidationResult {
    const reporter = new ValidationErrorReporter();

    // Basic structure validation
    EventValidator.validateEventStructure(event, reporter);

    // Event name format validation
    if (event?.name) {
      EventValidator.validateEventNameFormat(
        event.name,
        reporter,
        this.config.strict,
      );
    }

    // Data serialization validation
    if (event?.data !== undefined) {
      EventValidator.validateEventDataSerialization(event.data, reporter);
    }

    // Schema-based validation if available
    if (event?.name && event?.data !== undefined) {
      this.validateEventWithSchema(event, reporter);
    }

    return reporter.getResult();
  }

  /**
   * Gets service configuration
   */
  getConfig(): MergedInngestConfig {
    return { ...this.config };
  }

  /**
   * Checks if the service is properly configured for sending events
   */
  canSendEvents(): boolean {
    return !!this.config.eventKey;
  }

  /**
   * Gets service health status
   */
  getHealthStatus(): {
    status: "healthy" | "degraded" | "unhealthy";
    appId: string;
    canSendEvents: boolean;
    isDev: boolean;
    lastError?: string;
  } {
    return {
      status: "healthy", // TODO: Implement actual health checks
      appId: this.config.appId,
      canSendEvents: this.canSendEvents(),
      isDev: this.config.isDev,
    };
  }

  /**
   * Sends events with retry logic
   */
  private async sendWithRetry(events: InngestEvent[]): Promise<void> {
    const retryOptions: RetryOptions = {
      attempt: 1,
      maxAttempts: this.config.retry.maxAttempts || 3,
      delay: this.config.retry.initialDelay || 1000,
    };

    return this.attemptSend(events, retryOptions);
  }

  /**
   * Attempts to send events with exponential backoff retry
   */
  private async attemptSend(
    events: InngestEvent[],
    options: RetryOptions,
  ): Promise<void> {
    try {
      // Log the events being sent (in debug mode)
      if (this.config.logger) {
        this.logger.debug(
          `Sending ${events.length} event(s) to Inngest (attempt ${options.attempt}/${options.maxAttempts})`,
        );
        events.forEach((event, index) => {
          this.logger.debug(`Event ${index + 1}: ${event.name}`, {
            eventId: event.id,
            eventName: event.name,
            hasData: !!event.data,
            hasUser: !!event.user,
          });
        });
      }

      // Send events to Inngest
      await this.inngestClient.send(events);

      this.logger.log(`Successfully sent ${events.length} event(s) to Inngest`);
    } catch (error) {
      const eventNames = events.map((e) => e.name).join(", ");

      // Check if we should retry
      if (
        options.attempt < options.maxAttempts &&
        this.shouldRetry(error as Error)
      ) {
        this.logger.warn(
          `Failed to send event(s) on attempt ${options.attempt}/${options.maxAttempts}: ${eventNames}. Retrying in ${options.delay}ms...`,
          error,
        );

        // Wait before retrying
        await this.delay(options.delay);

        // Calculate next delay with exponential backoff
        const nextDelay = Math.min(
          options.delay * (this.config.retry.backoffMultiplier || 2),
          this.config.retry.maxDelay || 30000,
        );

        // Retry with updated options
        return this.attemptSend(events, {
          attempt: options.attempt + 1,
          maxAttempts: options.maxAttempts,
          delay: nextDelay,
        });
      }

      // All retries exhausted or non-retryable error
      this.logger.error(
        `Failed to send event(s) after ${options.attempt} attempt(s): ${eventNames}`,
        error,
      );

      throw new InngestEventError(
        ERROR_MESSAGES.EVENT_SEND_FAILED,
        eventNames,
        error as Error,
      );
    }
  }

  /**
   * Determines if an error is retryable
   */
  private shouldRetry(error: Error): boolean {
    // Retry on network errors, timeouts, and 5xx server errors
    const retryableErrors = [
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
    ];

    // Check for network errors
    if (retryableErrors.some((code) => error.message.includes(code))) {
      return true;
    }

    // Check for HTTP status codes (if available)
    const httpError = error as any;
    if (httpError.status || httpError.statusCode) {
      const status = httpError.status || httpError.statusCode;
      // Retry on 5xx server errors and 429 rate limiting
      return status >= 500 || status === 429;
    }

    // Don't retry on validation errors or 4xx client errors (except 429)
    return false;
  }

  /**
   * Delays execution for the specified number of milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Sends events in optimized batches
   */
  async sendBatch(events: InngestEvent[]): Promise<void> {
    if (!this.config.eventKey) {
      throw new InngestEventError(
        "Event key is required for sending events. Please configure eventKey in your Inngest module.",
      );
    }

    if (!events || events.length === 0) {
      throw new InngestEventError("At least one event must be provided");
    }

    // Validate all events first (but skip batch size check since we'll split)
    events.forEach((event, index) => {
      this.validateSingleEvent(event, index);
    });

    // Split into batches if necessary
    const batches = this.createBatches(events, this.config.maxBatchSize);

    this.logger.debug(
      `Sending ${events.length} events in ${batches.length} batch(es)`,
    );

    // Send all batches with controlled concurrency
    const concurrencyLimit = 5; // Limit concurrent batch sends

    for (let i = 0; i < batches.length; i += concurrencyLimit) {
      const batchSlice = batches.slice(i, i + concurrencyLimit);
      const batchPromises = batchSlice.map((batch) =>
        this.sendWithRetry(batch),
      );

      // Wait for this slice of batches to complete before starting the next
      await Promise.all(batchPromises);
    }

    this.logger.log(
      `Successfully sent all ${events.length} events in ${batches.length} batch(es)`,
    );
  }

  /**
   * Creates batches from events array
   */
  private createBatches(
    events: InngestEvent[],
    batchSize: number,
  ): InngestEvent[][] {
    const batches: InngestEvent[][] = [];

    for (let i = 0; i < events.length; i += batchSize) {
      batches.push(events.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Register an event schema for validation
   */
  registerEventSchema<T extends string & keyof DefaultEventRegistry>(
    eventName: T,
    schema: EventSchemaRegistry<DefaultEventRegistry>[T],
  ): void {
    if (schema) {
      this.eventBuilder.registerSchema(eventName, schema);
      this.logger.debug(`Registered schema for event: ${eventName}`);
    }
  }

  /**
   * Register multiple event schemas
   */
  registerEventSchemas(
    schemas: EventSchemaRegistry<DefaultEventRegistry>,
  ): void {
    Object.entries(schemas).forEach(([eventName, schema]) => {
      if (schema) {
        this.registerEventSchema(
          eventName as string & keyof DefaultEventRegistry,
          schema,
        );
      }
    });
  }

  /**
   * Get registered schemas
   */
  getEventSchemas(): EventSchemaRegistry<DefaultEventRegistry> {
    return this.eventBuilder.getSchemas();
  }

  /**
   * Check if schema is registered for an event
   */
  hasEventSchema(eventName: string): boolean {
    return !!this.eventBuilder.getSchema(
      eventName as string & keyof DefaultEventRegistry,
    );
  }

  /**
   * Gets all registered Inngest functions
   */
  getAllFunctions(): InngestFunctionMetadata[] {
    return this.functionRegistry.getFunctions();
  }

  /**
   * Gets function count
   */
  getFunctionCount(): number {
    return this.functionRegistry.getFunctionCount();
  }

  /**
   * Gets a specific function by ID
   */
  getFunction(id: string): InngestFunctionMetadata | undefined {
    return this.functionRegistry.getFunction(id);
  }

  /**
   * Gets all function IDs
   */
  getFunctionIds(): string[] {
    return this.functionRegistry.getFunctionIds();
  }

  // Simplified - Inngest handles connection automatically

  private async connectToInngest(): Promise<void> {
    try {
      const functionDefs = this.functionRegistry.createInngestFunctions();

      if (functionDefs.length === 0) {
        this.logger.warn("No functions found to register with Inngest");
        return;
      }

      this.logger.debug(
        `Connecting to Inngest with ${functionDefs.length} functions...`,
      );

      // Convert function definitions to actual Inngest functions
      const inngestFunctions = functionDefs.map((def) => {
        const config: any = {
          id: def.id,
          name: def.name,
        };

        if (def.concurrency) config.concurrency = def.concurrency;
        if (def.rateLimit) config.rateLimit = def.rateLimit;
        if (def.retries) config.retries = def.retries;
        if (def.timeout) config.timeouts = def.timeout;

        return this.inngestClient.createFunction(
          config,
          def.triggers,
          def.handler,
        );
      });

      this.connection = await connect({
        apps: [
          {
            client: this.inngestClient,
            functions: inngestFunctions,
          },
        ],
      });

      this.logger.debug("✅ Connected to Inngest Dev Server by Connect Method");
    } catch (error) {
      this.logger.error(
        "❌ Failed to connect to Inngest by Connect Method:",
        error,
      );
      if (this.config.isDev) {
        this.logger.warn(
          "Continuing without Inngest connection by Connect Method",
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * Converts function definitions to Inngest function array
   */
  private createInngestFunctionArray(): any[] {
    const functionDefs = this.functionRegistry.createInngestFunctions();

    this.logger.debug(
      `Function definitions from registry: ${functionDefs.length}`,
    );
    return functionDefs.map((def) => {
      const config: any = {
        id: def.id,
        name: def.name,
      };

      if (def.concurrency) config.concurrency = def.concurrency;
      if (def.rateLimit) config.rateLimit = def.rateLimit;
      if (def.retries) config.retries = def.retries;
      if (def.timeout) config.timeout = def.timeout;

      const trigger = def.triggers[0];
      const inngestFunction = this.inngestClient.createFunction(
        config,
        trigger,
        def.handler,
      );

      this.logger.debug(`Created Inngest function: ${config.id}`);

      return inngestFunction;
    });
  }

  getConnectionStatus() {
    return {
      connected: !!this.connection,
      connection: this.connection,
      functions: this.functionRegistry.getFunctionCount(),
    };
  }

  /**
   * Ensures the Inngest client is initialized (only creates once)
   */
  private async ensureClientInitialized(): Promise<void> {
    if (!this.inngestClient) {
      this.logger.debug("Inngest client not ready, initializing...");
      this.inngestClient = this.createInngestClient();
      this.logger.debug("Inngest client initialized successfully");
    } else {
      this.logger.debug("Inngest client already initialized");
    }
  }

  /**
   * Create serve integration for the specified platform
   */
  async createServe(platform: "express" | "fastify") {
    this.logger.debug(
      `Starting createServe(${platform}), Waiting for function discovery...`,
    );

    // Always wait for function discovery, regardless of client state
    await this.functionRegistry.waitForDiscovery();

    // Ensure client is initialized (only create once)
    await this.ensureClientInitialized();

    // Use existing method that creates proper Inngest function objects
    const inngestFunctions = this.createInngestFunctionArray();

    this.logger.log(
      `🔍 Creating ${platform} serve integration with ${inngestFunctions.length} Inngest function objects`,
    );

    if (platform === "express") {
      // Create serve middleware with debugging
      this.logger.debug("About to call serve() from inngest/express...");
      return ExpressServe({
        client: this.inngestClient,
        functions: inngestFunctions,
      });
    } else if (platform === "fastify") {
      // Log basic function info
      this.logger.debug(
        `Functions created: ${inngestFunctions.map((f) => f.constructor.name).join(", ")}`,
      );

      this.logger.debug("Fastify serve integration created successfully");

      // Return the plugin configuration
      return {
        plugin: fastifyPlugin,
        options: {
          client: this.inngestClient,
          functions: inngestFunctions,
        },
      };
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Create a controller-compatible handler for the specified platform
   * This method is specifically designed for use in NestJS Controllers
   */
  async createControllerHandler(platform: "express" | "fastify") {
    this.logger.debug(
      `Starting createControllerHandler(${platform}), waiting for function discovery...`,
    );

    // Always wait for function discovery
    await this.functionRegistry.waitForDiscovery();

    // Ensure client is initialized
    await this.ensureClientInitialized();

    // Use existing method that creates proper Inngest function objects
    const inngestFunctions = this.createInngestFunctionArray();

    this.logger.log(
      `🔍 Creating ${platform} controller handler with ${inngestFunctions.length} Inngest function objects`,
    );

    if (platform === "express") {
      return ExpressServe({
        client: this.inngestClient,
        functions: inngestFunctions,
      });
    } else if (platform === "fastify") {
      return FastifyServe({
        client: this.inngestClient,
        functions: inngestFunctions,
      });
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * @deprecated Use createServe('express') instead
   */
  async createServeMiddleware() {
    this.logger.warn(
      "createServeMiddleware() is deprecated, use createServe('express') instead",
    );
    return this.createServe("express");
  }

  async reconnect(): Promise<void> {
    this.logger.log("🔄 Reconnect called");
    if (this.connection?.close) {
      this.logger.log("🔌 Closing existing connection");
      await this.connection.close();
      this.connection = null;
    }
    this.logger.log("🚀 Starting new connection attempt");
    await this.connectToInngest();
  }
}
