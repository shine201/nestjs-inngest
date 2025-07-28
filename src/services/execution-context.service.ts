import { Injectable, Logger, Scope } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { ContextIdFactory, REQUEST } from "@nestjs/core";
import {
  InngestFunctionContext,
  InngestFunctionMetadata,
  StepTools,
} from "../interfaces/inngest-function.interface";
import { StepOptionsOrId } from "inngest";
import { InngestEvent } from "../interfaces/inngest-event.interface";
import { InngestRuntimeError } from "../errors";
import { DevelopmentMode } from "../utils/development-mode";

/**
 * Context for function execution
 */
export interface ExecutionContext {
  /**
   * Unique execution ID
   */
  executionId: string;

  /**
   * Function metadata
   */
  functionMetadata: InngestFunctionMetadata;

  /**
   * Inngest function context
   */
  inngestContext: InngestFunctionContext;

  /**
   * NestJS context ID for scoped providers
   */
  contextId: any;

  /**
   * Start time of execution
   */
  startTime: Date;

  /**
   * Execution attempt number
   */
  attempt: number;
}

/**
 * Service for managing function execution contexts and dependency injection
 */
@Injectable({ scope: Scope.DEFAULT })
export class ExecutionContextService {
  private readonly logger = new Logger(ExecutionContextService.name);
  private readonly activeExecutions = new Map<string, ExecutionContext>();

  constructor(private readonly moduleRef: ModuleRef) {}

  /**
   * Creates an execution context for a function
   */
  async createExecutionContext(
    functionMetadata: InngestFunctionMetadata,
    event: InngestEvent,
    runId: string,
    attempt: number = 1,
  ): Promise<ExecutionContext> {
    const executionId = `${functionMetadata.config.id}-${runId}-${attempt}`;

    try {
      // Create NestJS context ID for scoped providers
      const contextId = ContextIdFactory.create();

      // Register the event as a request-scoped provider
      this.moduleRef.registerRequestByContextId(
        {
          event,
          runId,
          attempt,
          functionId: functionMetadata.config.id,
        },
        contextId,
      );

      // Create step tools with dependency injection support
      const stepTools = this.createStepTools(contextId, functionMetadata);

      // Create logger with context
      const contextLogger = this.createContextLogger(
        functionMetadata.config.id,
        runId,
        attempt,
      );

      // Create Inngest function context
      const inngestContext: InngestFunctionContext = {
        event,
        step: stepTools,
        logger: contextLogger,
        runId,
        attempt,
      };

      // Create execution context
      const executionContext: ExecutionContext = {
        executionId,
        functionMetadata,
        inngestContext,
        contextId,
        startTime: new Date(),
        attempt,
      };

      // Store active execution
      this.activeExecutions.set(executionId, executionContext);

      // Log function execution start in development mode
      DevelopmentMode.logFunctionExecution(
        functionMetadata.config.id,
        runId,
        event,
        "start",
      );

      this.logger.debug(
        `Created execution context for function ${functionMetadata.config.id} (${executionId})`,
      );

      return executionContext;
    } catch (error) {
      this.logger.error(
        `Failed to create execution context for function ${functionMetadata.config.id}:`,
        error,
      );
      throw new InngestRuntimeError(
        "Failed to create execution context",
        functionMetadata.config.id,
        runId,
        error as Error,
      );
    }
  }

  /**
   * Executes a function with proper dependency injection
   */
  async executeFunction(executionContext: ExecutionContext): Promise<any> {
    const { executionId, functionMetadata, inngestContext, contextId } =
      executionContext;

    try {
      this.logger.debug(
        `Executing function ${functionMetadata.config.id} (${executionId})`,
      );

      // Get the target instance with proper scoping
      const targetInstance = await this.getTargetInstance(
        functionMetadata.target.constructor,
        contextId,
      );

      // Bind the method to the scoped instance
      const boundMethod =
        targetInstance[functionMetadata.propertyKey].bind(targetInstance);

      // Execute the function with proper Inngest signature (event, { step, ... })
      const startTime = Date.now();
      const result = await boundMethod(inngestContext.event, {
        step: inngestContext.step,
        logger: inngestContext.logger,
        runId: inngestContext.runId,
        attempt: inngestContext.attempt,
      });
      const duration = Date.now() - startTime;

      // Log function execution completion in development mode
      DevelopmentMode.logFunctionExecution(
        functionMetadata.config.id,
        inngestContext.runId,
        inngestContext.event,
        "complete",
        { result, duration },
      );

      this.logger.debug(
        `Function ${functionMetadata.config.id} completed in ${duration}ms (${executionId})`,
      );

      return result;
    } catch (error) {
      // Log function execution error in development mode
      DevelopmentMode.logFunctionExecution(
        functionMetadata.config.id,
        inngestContext.runId,
        inngestContext.event,
        "error",
        { error },
      );

      this.logger.error(
        `Function ${functionMetadata.config.id} failed (${executionId}):`,
        error,
      );

      // Enhance error with development context
      const enhancedError = DevelopmentMode.enhanceErrorForDevelopment(
        error as Error,
        {
          functionId: functionMetadata.config.id,
          runId: inngestContext.runId,
        },
      );

      const errorMessage = enhancedError.message;
      throw new InngestRuntimeError(
        `Function execution failed: ${errorMessage}`,
        functionMetadata.config.id,
        inngestContext.runId,
        enhancedError,
      );
    } finally {
      // Clean up execution context
      this.cleanupExecutionContext(executionId);
    }
  }

  /**
   * Gets a target instance with proper dependency injection scoping
   */
  private async getTargetInstance(
    targetClass: any,
    contextId: any,
  ): Promise<any> {
    try {
      // Try to get the instance with the context ID (for scoped providers)
      return await this.moduleRef.resolve(targetClass, contextId);
    } catch (error) {
      // Fallback to regular resolution (for singleton providers)
      try {
        return this.moduleRef.get(targetClass);
      } catch (fallbackError) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const fallbackErrorMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError);
        throw new Error(
          `Failed to resolve target instance: ${errorMessage}. Fallback error: ${fallbackErrorMessage}`,
        );
      }
    }
  }

  /**
   * Creates step tools with dependency injection support
   * Implements official Inngest step tools interface with proper typing
   */
  private createStepTools(
    contextId: any,
    functionMetadata: InngestFunctionMetadata,
  ): StepTools {
    return {
      run: async <TFn extends (...args: any[]) => unknown>(
        idOrOptions: StepOptionsOrId,
        fn: TFn,
        ...input: Parameters<TFn>
      ) => {
        const stepId =
          typeof idOrOptions === "string"
            ? idOrOptions
            : idOrOptions.id || "step";
        this.logger.debug(
          `Executing step "${stepId}" in function ${functionMetadata.config.id}`,
        );
        try {
          const result = await fn(...input);
          this.logger.debug(`Step "${stepId}" completed successfully`);
          return result;
        } catch (error) {
          this.logger.error(`Step "${stepId}" failed:`, error);
          throw error;
        }
      },

      sleep: async (
        idOrOptions: StepOptionsOrId,
        time: number | string,
      ): Promise<void> => {
        const stepId =
          typeof idOrOptions === "string"
            ? idOrOptions
            : idOrOptions.id || "sleep";
        const ms = typeof time === "string" ? this.parseDuration(time) : time;

        this.logger.debug(
          `Sleeping for ${ms}ms in step "${stepId}" for function ${functionMetadata.config.id}`,
        );
        return new Promise((resolve) => setTimeout(resolve, ms));
      },

      sleepUntil: async (
        idOrOptions: StepOptionsOrId,
        time: Date | string,
      ): Promise<void> => {
        const stepId =
          typeof idOrOptions === "string"
            ? idOrOptions
            : idOrOptions.id || "sleepUntil";
        const targetTime = typeof time === "string" ? new Date(time) : time;
        const now = new Date();
        const ms = Math.max(0, targetTime.getTime() - now.getTime());

        this.logger.debug(
          `Sleeping until ${targetTime.toISOString()} (${ms}ms) in step "${stepId}"`,
        );
        return new Promise((resolve) => setTimeout(resolve, ms));
      },

      waitForEvent: async (
        idOrOptions: StepOptionsOrId,
        opts: any,
      ): Promise<any> => {
        const stepId =
          typeof idOrOptions === "string"
            ? idOrOptions
            : idOrOptions.id || "waitForEvent";
        throw new Error(
          `waitForEvent (${stepId}) requires Inngest step system integration`,
        );
      },

      sendEvent: async (
        idOrOptions: StepOptionsOrId,
        payload: any,
      ): Promise<any> => {
        const stepId =
          typeof idOrOptions === "string"
            ? idOrOptions
            : idOrOptions.id || "sendEvent";
        try {
          const { InngestService } = await import("./inngest.service");
          const inngestService = await this.moduleRef.resolve(
            InngestService,
            contextId,
          );

          if (Array.isArray(payload)) {
            await inngestService.sendBatch(payload);
          } else {
            await inngestService.send(payload);
          }

          return {
            ids: Array.isArray(payload)
              ? payload.map((p) => p.id || "no-id")
              : [payload.id || "no-id"],
          };
        } catch (error) {
          this.logger.error(
            `Failed to send event from step "${stepId}":`,
            error,
          );
          throw error;
        }
      },

      invoke: async (idOrOptions: StepOptionsOrId, opts: any): Promise<any> => {
        const stepId =
          typeof idOrOptions === "string"
            ? idOrOptions
            : idOrOptions.id || "invoke";
        throw new Error(
          `invoke (${stepId}) requires Inngest function invocation system integration`,
        );
      },

      waitForSignal: async (
        idOrOptions: StepOptionsOrId,
        opts: any,
      ): Promise<any> => {
        const stepId =
          typeof idOrOptions === "string"
            ? idOrOptions
            : idOrOptions.id || "waitForSignal";
        throw new Error(
          `waitForSignal (${stepId}) requires Inngest step system integration`,
        );
      },

      sendSignal: async (
        idOrOptions: StepOptionsOrId,
        opts: any,
      ): Promise<any> => {
        const stepId =
          typeof idOrOptions === "string"
            ? idOrOptions
            : idOrOptions.id || "sendSignal";
        throw new Error(
          `sendSignal (${stepId}) requires Inngest step system integration`,
        );
      },

      fetch: async (
        idOrOptions: StepOptionsOrId,
        ...args: Parameters<typeof fetch>
      ): Promise<Response> => {
        const stepId =
          typeof idOrOptions === "string"
            ? idOrOptions
            : idOrOptions.id || "fetch";
        this.logger.debug(`Making fetch request in step "${stepId}"`);

        try {
          const response = await fetch(...args);
          this.logger.debug(
            `Fetch completed in step "${stepId}" with status ${response.status}`,
          );
          return response;
        } catch (error) {
          this.logger.error(`Fetch failed in step "${stepId}":`, error);
          throw error;
        }
      },

      ai: {
        infer: async (
          idOrOptions: StepOptionsOrId,
          options: any,
        ): Promise<any> => {
          const stepId =
            typeof idOrOptions === "string"
              ? idOrOptions
              : idOrOptions.id || "ai.infer";
          throw new Error(
            `ai.infer (${stepId}) requires Inngest AI integration`,
          );
        },
        wrap: async (
          idOrOptions: StepOptionsOrId,
          fn: any,
          ...input: any[]
        ): Promise<any> => {
          const stepId =
            typeof idOrOptions === "string"
              ? idOrOptions
              : idOrOptions.id || "ai.wrap";
          throw new Error(
            `ai.wrap (${stepId}) requires Inngest AI integration`,
          );
        },
        models: {
          anthropic: (() => {
            throw new Error(
              "ai.models.anthropic requires Inngest AI integration",
            );
          }) as any,
          gemini: (() => {
            throw new Error("ai.models.gemini requires Inngest AI integration");
          }) as any,
          openai: (() => {
            throw new Error("ai.models.openai requires Inngest AI integration");
          }) as any,
          deepseek: (() => {
            throw new Error(
              "ai.models.deepseek requires Inngest AI integration",
            );
          }) as any,
          grok: (() => {
            throw new Error("ai.models.grok requires Inngest AI integration");
          }) as any,
        },
      },
    } as StepTools;
  }

  /**
   * Creates a context-aware logger
   */
  private createContextLogger(
    functionId: string,
    runId: string,
    attempt: number,
  ): any {
    const contextPrefix = `[${functionId}:${runId}:${attempt}]`;

    return {
      info: (message: string, ...args: any[]) => {
        this.logger.log(`${contextPrefix} ${message}`, ...args);
      },
      warn: (message: string, ...args: any[]) => {
        this.logger.warn(`${contextPrefix} ${message}`, ...args);
      },
      error: (message: string, ...args: any[]) => {
        this.logger.error(`${contextPrefix} ${message}`, ...args);
      },
      debug: (message: string, ...args: any[]) => {
        this.logger.debug(`${contextPrefix} ${message}`, ...args);
      },
    };
  }

  /**
   * Parses duration string to milliseconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
    if (!match) {
      throw new Error(`Invalid duration format: ${duration}`);
    }

    const value = parseFloat(match[1]);
    const unit = match[2];

    switch (unit) {
      case "ms":
        return value;
      case "s":
        return value * 1000;
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      default:
        throw new Error(`Unsupported duration unit: ${unit}`);
    }
  }

  /**
   * Cleans up execution context
   */
  private cleanupExecutionContext(executionId: string): void {
    const context = this.activeExecutions.get(executionId);
    if (context) {
      this.activeExecutions.delete(executionId);
      this.logger.debug(`Cleaned up execution context ${executionId}`);
    }
  }

  /**
   * Gets active execution contexts (for monitoring)
   */
  getActiveExecutions(): ExecutionContext[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Gets execution statistics
   */
  getExecutionStats(): {
    activeExecutions: number;
    executionsByFunction: Record<string, number>;
    averageExecutionTime: number;
  } {
    const executions = this.getActiveExecutions();
    const now = new Date();

    const stats = {
      activeExecutions: executions.length,
      executionsByFunction: {} as Record<string, number>,
      averageExecutionTime: 0,
    };

    let totalExecutionTime = 0;

    for (const execution of executions) {
      const functionId = execution.functionMetadata.config.id;
      stats.executionsByFunction[functionId] =
        (stats.executionsByFunction[functionId] || 0) + 1;

      totalExecutionTime += now.getTime() - execution.startTime.getTime();
    }

    if (executions.length > 0) {
      stats.averageExecutionTime = totalExecutionTime / executions.length;
    }

    return stats;
  }

  /**
   * Clears all execution contexts (mainly for testing)
   */
  clear(): void {
    this.activeExecutions.clear();
    this.logger.debug("Cleared all execution contexts");
  }
}
