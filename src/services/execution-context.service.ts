import { Injectable, Logger, Scope } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { ContextIdFactory, REQUEST } from "@nestjs/core";
import {
  InngestFunctionContext,
  InngestFunctionMetadata,
} from "../interfaces/inngest-function.interface";
import { InngestEvent } from "../interfaces/inngest-event.interface";
import { InngestRuntimeError } from "../errors";

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
    attempt: number = 1
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
        contextId
      );

      // Create step tools with dependency injection support
      const stepTools = this.createStepTools(contextId, functionMetadata);

      // Create logger with context
      const contextLogger = this.createContextLogger(
        functionMetadata.config.id,
        runId,
        attempt
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

      this.logger.debug(
        `Created execution context for function ${functionMetadata.config.id} (${executionId})`
      );

      return executionContext;
    } catch (error) {
      this.logger.error(
        `Failed to create execution context for function ${functionMetadata.config.id}:`,
        error
      );
      throw new InngestRuntimeError(
        "Failed to create execution context",
        functionMetadata.config.id,
        runId,
        error as Error
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
        `Executing function ${functionMetadata.config.id} (${executionId})`
      );

      // Get the target instance with proper scoping
      const targetInstance = await this.getTargetInstance(
        functionMetadata.target.constructor,
        contextId
      );

      // Bind the method to the scoped instance
      const boundMethod =
        targetInstance[functionMetadata.propertyKey].bind(targetInstance);

      // Execute the function
      const startTime = Date.now();
      const result = await boundMethod(inngestContext);
      const duration = Date.now() - startTime;

      this.logger.debug(
        `Function ${functionMetadata.config.id} completed in ${duration}ms (${executionId})`
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Function ${functionMetadata.config.id} failed (${executionId}):`,
        error
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new InngestRuntimeError(
        `Function execution failed: ${errorMessage}`,
        functionMetadata.config.id,
        inngestContext.runId,
        error as Error
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
    contextId: any
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
          `Failed to resolve target instance: ${errorMessage}. Fallback error: ${fallbackErrorMessage}`
        );
      }
    }
  }

  /**
   * Creates step tools with dependency injection support
   */
  private createStepTools(
    contextId: any,
    functionMetadata: InngestFunctionMetadata
  ): any {
    return {
      run: async <T>(id: string, fn: () => Promise<T> | T): Promise<T> => {
        this.logger.debug(
          `Executing step "${id}" in function ${functionMetadata.config.id}`
        );
        try {
          const result = await fn();
          this.logger.debug(`Step "${id}" completed successfully`);
          return result;
        } catch (error) {
          this.logger.error(`Step "${id}" failed:`, error);
          throw error;
        }
      },

      sleep: async (duration: string | number): Promise<void> => {
        const ms =
          typeof duration === "string"
            ? this.parseDuration(duration)
            : duration;
        this.logger.debug(
          `Sleeping for ${ms}ms in function ${functionMetadata.config.id}`
        );
        return new Promise((resolve) => setTimeout(resolve, ms));
      },

      waitForEvent: async (
        event: string,
        options?: { timeout?: string | number; if?: string }
      ): Promise<InngestEvent> => {
        // This would typically integrate with Inngest's step system
        // For now, we'll throw an error indicating this needs Inngest integration
        throw new Error(
          "waitForEvent requires Inngest step system integration"
        );
      },

      sendEvent: async (
        event: InngestEvent | InngestEvent[]
      ): Promise<void> => {
        // Get InngestService with proper scoping
        try {
          const { InngestService } = await import("./inngest.service");
          const inngestService = await this.moduleRef.resolve(
            InngestService,
            contextId
          );

          if (Array.isArray(event)) {
            await inngestService.sendBatch(event);
          } else {
            await inngestService.send(event);
          }
        } catch (error) {
          this.logger.error("Failed to send event from step:", error);
          throw error;
        }
      },

      invoke: async <T>(functionId: string, data?: any): Promise<T> => {
        // This would typically integrate with Inngest's function invocation system
        // For now, we'll throw an error indicating this needs Inngest integration
        throw new Error(
          "invoke requires Inngest function invocation system integration"
        );
      },
    };
  }

  /**
   * Creates a context-aware logger
   */
  private createContextLogger(
    functionId: string,
    runId: string,
    attempt: number
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
