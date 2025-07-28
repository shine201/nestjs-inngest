import { Injectable, Scope, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { ContextIdFactory, REQUEST } from "@nestjs/core";
import { InngestEvent } from "../interfaces/inngest-event.interface";

/**
 * Request context for Inngest functions
 */
export interface InngestRequestContext {
  /**
   * The event that triggered the function
   */
  event: InngestEvent;

  /**
   * Function run ID
   */
  runId: string;

  /**
   * Execution attempt number
   */
  attempt: number;

  /**
   * Function ID
   */
  functionId: string;

  /**
   * Execution start time
   */
  startTime: Date;

  /**
   * Additional context data
   */
  metadata?: Record<string, any>;
}

/**
 * Service for managing scoped providers in Inngest function execution
 */
@Injectable({ scope: Scope.DEFAULT })
export class ScopeManagerService {
  private readonly logger = new Logger(ScopeManagerService.name);
  private readonly activeScopes = new Map<string, any>();

  constructor(private readonly moduleRef: ModuleRef) {}

  /**
   * Creates a new execution scope for an Inngest function
   */
  createExecutionScope(requestContext: InngestRequestContext): any {
    const contextId = ContextIdFactory.create();
    const scopeKey = `${requestContext.functionId}-${requestContext.runId}-${requestContext.attempt}`;

    try {
      // Register the request context as a scoped provider
      this.moduleRef.registerRequestByContextId(requestContext, contextId);

      // Store the context ID for cleanup
      this.activeScopes.set(scopeKey, {
        contextId,
        requestContext,
        createdAt: requestContext.startTime,
      });

      this.logger.debug(`Created execution scope: ${scopeKey}`);

      return contextId;
    } catch (error) {
      this.logger.error(
        `Failed to create execution scope for ${scopeKey}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Resolves a provider with the given scope
   */
  async resolveScoped<T>(
    token: any,
    contextId: any,
    options?: {
      strict?: boolean;
      fallbackToSingleton?: boolean;
    },
  ): Promise<T> {
    const { strict = false, fallbackToSingleton = true } = options || {};

    try {
      // Try to resolve with the scoped context
      return await this.moduleRef.resolve<T>(token, contextId, { strict });
    } catch (error) {
      if (fallbackToSingleton) {
        this.logger.debug(
          `Falling back to singleton resolution for ${token.name || token}`,
        );
        try {
          return this.moduleRef.get<T>(token, { strict });
        } catch (fallbackError) {
          this.logger.error(
            `Failed to resolve provider ${token.name || token}:`,
            fallbackError,
          );
          throw fallbackError;
        }
      }
      throw error;
    }
  }

  /**
   * Gets the request context for a given scope
   */
  getRequestContext(contextId: any): InngestRequestContext | undefined {
    for (const scope of this.activeScopes.values()) {
      if (scope.contextId === contextId) {
        return scope.requestContext;
      }
    }
    return undefined;
  }

  /**
   * Cleans up an execution scope
   */
  cleanupScope(scopeKey: string): void {
    const scope = this.activeScopes.get(scopeKey);
    if (scope) {
      this.activeScopes.delete(scopeKey);
      this.logger.debug(`Cleaned up execution scope: ${scopeKey}`);
    }
  }

  /**
   * Gets all active scopes (for monitoring)
   */
  getActiveScopes(): Array<{
    scopeKey: string;
    requestContext: InngestRequestContext;
    createdAt: Date;
    age: number;
  }> {
    const now = new Date();
    const scopes: Array<{
      scopeKey: string;
      requestContext: InngestRequestContext;
      createdAt: Date;
      age: number;
    }> = [];

    for (const [scopeKey, scope] of this.activeScopes.entries()) {
      scopes.push({
        scopeKey,
        requestContext: scope.requestContext,
        createdAt: scope.createdAt,
        age: now.getTime() - scope.createdAt.getTime(),
      });
    }

    return scopes;
  }

  /**
   * Cleans up old scopes (for memory management)
   */
  cleanupOldScopes(maxAge: number = 5 * 60 * 1000): number {
    const now = new Date();
    let cleanedCount = 0;

    for (const [scopeKey, scope] of this.activeScopes.entries()) {
      const age = now.getTime() - scope.createdAt.getTime();
      if (age > maxAge) {
        this.activeScopes.delete(scopeKey);
        cleanedCount++;
        this.logger.debug(`Cleaned up old scope: ${scopeKey} (age: ${age}ms)`);
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} old execution scope(s)`);
    }

    return cleanedCount;
  }

  /**
   * Gets scope statistics
   */
  getScopeStats(): {
    activeScopes: number;
    scopesByFunction: Record<string, number>;
    averageAge: number;
    oldestScope?: {
      scopeKey: string;
      age: number;
    };
  } {
    const scopes = this.getActiveScopes();
    const stats = {
      activeScopes: scopes.length,
      scopesByFunction: {} as Record<string, number>,
      averageAge: 0,
      oldestScope: undefined as { scopeKey: string; age: number } | undefined,
    };

    if (scopes.length === 0) {
      return stats;
    }

    let totalAge = 0;
    let oldestAge = 0;
    let oldestScopeKey = "";

    for (const scope of scopes) {
      // Count by function
      const functionId = scope.requestContext.functionId;
      stats.scopesByFunction[functionId] =
        (stats.scopesByFunction[functionId] || 0) + 1;

      // Calculate ages
      totalAge += scope.age;
      if (scope.age > oldestAge) {
        oldestAge = scope.age;
        oldestScopeKey = scope.scopeKey;
      }
    }

    stats.averageAge = totalAge / scopes.length;
    if (oldestScopeKey) {
      stats.oldestScope = {
        scopeKey: oldestScopeKey,
        age: oldestAge,
      };
    }

    return stats;
  }

  /**
   * Clears all scopes (mainly for testing)
   */
  clear(): void {
    const count = this.activeScopes.size;
    this.activeScopes.clear();
    this.logger.debug(`Cleared ${count} execution scope(s)`);
  }
}

/**
 * Decorator to inject the current Inngest request context
 */
export const InjectInngestContext = () => {
  return (
    target: any,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ) => {
    // This would be implemented using NestJS's custom parameter decorator system
    // For now, we'll provide a placeholder that can be extended
    throw new Error(
      "InjectInngestContext decorator requires full NestJS integration",
    );
  };
};

/**
 * Injectable token for the current Inngest request context
 */
export const INNGEST_REQUEST_CONTEXT = Symbol("INNGEST_REQUEST_CONTEXT");
