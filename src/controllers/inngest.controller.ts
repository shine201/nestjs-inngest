import {
  Controller,
  Post,
  Put,
  Req,
  Res,
  Headers,
  Body,
  Logger,
  Inject,
  HttpStatus,
} from "@nestjs/common";
import { HttpPlatformAdapter } from "../adapters/http-platform.interface";
import { FunctionRegistry } from "../services/function-registry.service";
import { ExecutionContextService } from "../services/execution-context.service";
import { SignatureVerificationService } from "../services/signature-verification.service";
import { MergedInngestConfig } from "../utils/config-validation";
import {
  InngestWebhookError,
  InngestRuntimeError,
  InngestTimeoutError,
  InngestRetryError,
} from "../errors";
import { INNGEST_CONFIG, ERROR_MESSAGES } from "../constants";
import { errorHandler, ErrorSeverity, withRetry } from "../utils/error-handler";
import {
  EnhancedLogger,
  LoggerFactory,
} from "../services/enhanced-logger.service";
import { InngestEvent } from "../interfaces/inngest-event.interface";

/**
 * Webhook request from Inngest
 */
interface InngestWebhookRequest {
  /**
   * Function ID to execute
   */
  function_id: string;
  /**
   * Event data
   */
  event: InngestEvent;
  /**
   * Function run ID
   */
  run_id: string;
  /**
   * Execution attempt number
   */
  attempt: number;
  /**
   * Step information (for step execution)
   */
  step?: {
    id: string;
    name: string;
    op: string;
  };
  /**
   * Additional context
   */
  ctx?: {
    stack?: any;
    run_id: string;
    attempt: number;
  };
}

/**
 * Controller for handling Inngest webhooks with enhanced security
 */
@Controller()
export class InngestController {
  private readonly logger: EnhancedLogger;
  private readonly loggerFactory = new LoggerFactory();

  constructor(
    @Inject(INNGEST_CONFIG) private readonly config: MergedInngestConfig,
    @Inject("HTTP_PLATFORM_ADAPTER")
    private readonly httpAdapter: HttpPlatformAdapter,
    private readonly functionRegistry: FunctionRegistry,
    private readonly executionContext: ExecutionContextService,
    private readonly signatureVerification: SignatureVerificationService,
  ) {
    this.logger = this.loggerFactory.createServiceLogger("InngestController");
  }

  /**
   * Handles POST requests from Inngest (function execution)
   */
  @Post()
  async handlePost(
    @Req() req: any,
    @Res() res: any,
    @Headers() headers: Record<string, string>,
    @Body() body: InngestWebhookRequest,
  ): Promise<void> {
    const { function_id, run_id, attempt = 1 } = body;
    const startTime = Date.now();

    // Create function-specific logger
    const functionLogger = this.loggerFactory.createFunctionLogger(
      function_id,
      run_id,
    );

    try {
      // Log webhook received
      this.logger.logWebhook("POST", function_id, "received", undefined, {
        runId: run_id,
        attempt,
        userAgent: headers["user-agent"],
        contentType: headers["content-type"],
      });

      // Verify webhook signature using dedicated service
      await this.signatureVerification.verifyWebhookSignature(req, {
        signingKey: this.config.signingKey,
        toleranceSeconds: 300, // 5 minutes
      });

      functionLogger.logFunctionStart(function_id, run_id, attempt, {
        eventName: body.event?.name,
        eventId: body.event?.id,
      });

      // Execute the function
      const result = await this.executeFunction(body);
      const duration = Date.now() - startTime;

      functionLogger.logFunctionSuccess(
        function_id,
        run_id,
        attempt,
        duration,
        result,
      );

      this.logger.logWebhook("POST", function_id, "processed", HttpStatus.OK, {
        runId: run_id,
        attempt,
        duration,
      });

      this.logger.logPerformance(
        "function-execution",
        duration,
        function_id,
        run_id,
      );

      // Send success response using platform adapter
      const responseAdapter = this.httpAdapter.wrapResponse(res);
      responseAdapter.status(HttpStatus.OK).json({
        status: "ok",
        result,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.handleWebhookError(error, res, body?.function_id, {
        runId: run_id,
        attempt,
        duration,
        functionLogger,
      });
    }
  }

  /**
   * Handles PUT requests from Inngest (function registration/introspection)
   */
  @Put()
  async handlePut(
    @Req() req: any,
    @Res() res: any,
    @Headers() headers: Record<string, string>,
  ): Promise<void> {
    try {
      this.logger.debug("Received PUT webhook for function introspection");

      // Verify webhook signature using dedicated service
      await this.signatureVerification.verifyWebhookSignature(req, {
        signingKey: this.config.signingKey,
        toleranceSeconds: 300, // 5 minutes
      });

      // Return function definitions
      const functions = this.getFunctionDefinitions();

      // Send response using platform adapter
      const responseAdapter = this.httpAdapter.wrapResponse(res);
      responseAdapter.status(HttpStatus.OK).json({
        functions,
        sdk: {
          name: "nest-inngest",
          version: "1.0.0",
          language: "typescript",
          framework: "nestjs",
          platform: this.httpAdapter.getPlatformName(),
        },
      });
    } catch (error) {
      this.handleWebhookError(error, res);
    }
  }

  /**
   * Executes an Inngest function
   */
  private async executeFunction(
    webhookRequest: InngestWebhookRequest,
  ): Promise<any> {
    const { function_id, event, run_id, attempt = 1 } = webhookRequest;

    // Get function metadata
    const functionMetadata = this.functionRegistry.getFunction(function_id);
    if (!functionMetadata) {
      throw new InngestWebhookError(
        `${ERROR_MESSAGES.FUNCTION_NOT_FOUND}: ${function_id}`,
        HttpStatus.NOT_FOUND,
      );
    }

    try {
      // Create execution context
      const executionContext =
        await this.executionContext.createExecutionContext(
          functionMetadata,
          event,
          run_id,
          attempt,
        );

      // Execute the function with timeout and error handling
      const result = await this.executeWithErrorHandling(
        () => this.executionContext.executeFunction(executionContext),
        function_id,
        run_id,
        attempt,
      );

      this.logger.log(
        `Function ${function_id} executed successfully (run: ${run_id}, attempt: ${attempt})`,
      );

      return result;
    } catch (error) {
      // Enhanced error handling with classification
      await this.handleExecutionError(
        error as Error,
        function_id,
        run_id,
        attempt,
      );
      throw error; // Re-throw after handling
    }
  }

  /**
   * Execute function with enhanced error handling
   */
  private async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    functionId: string,
    runId: string,
    attempt: number,
  ): Promise<T> {
    const timeout = this.config.timeout || 30000; // Default 30 seconds

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new InngestTimeoutError(
            `Function execution timed out after ${timeout}ms`,
            functionId,
            runId,
            timeout,
          ),
        );
      }, timeout);
    });

    try {
      // Race between function execution and timeout
      const result = await Promise.race([operation(), timeoutPromise]);
      return result;
    } catch (error) {
      // Classify and enhance error with context
      const enhancedError = this.enhanceError(
        error as Error,
        functionId,
        runId,
        attempt,
      );
      throw enhancedError;
    }
  }

  /**
   * Handle execution errors with detailed logging and classification
   */
  private async handleExecutionError(
    error: Error,
    functionId: string,
    runId: string,
    attempt: number,
  ): Promise<void> {
    // Classify the error
    const classification = errorHandler.classifyError(error);

    // Determine if this is a retry scenario
    const isRetryExhausted = attempt >= (this.config.retry?.maxAttempts || 3);

    // Create appropriate error context
    const errorContext = {
      functionId,
      runId,
      attempt,
      severity: classification.severity,
      category: classification.category,
      retryable: classification.retryable,
      isRetryExhausted,
    };

    // Handle based on error type and severity
    if (classification.severity === ErrorSeverity.CRITICAL) {
      this.logger.error(
        `CRITICAL: Function ${functionId} execution failed critically (run: ${runId}, attempt: ${attempt})`,
        {
          error: error.message,
          stack: error.stack,
          ...errorContext,
        },
      );
    } else if (classification.severity === ErrorSeverity.HIGH) {
      this.logger.error(
        `Function ${functionId} execution failed (run: ${runId}, attempt: ${attempt})`,
        {
          error: error.message,
          ...errorContext,
        },
      );
    } else {
      this.logger.warn(
        `Function ${functionId} execution failed (run: ${runId}, attempt: ${attempt})`,
        {
          error: error.message,
          ...errorContext,
        },
      );
    }

    // Handle error using error handler
    await errorHandler.handleError(error, {
      context: errorContext,
      rethrow: false, // We'll handle rethrowing manually
    });
  }

  /**
   * Enhance error with additional context
   */
  private enhanceError(
    error: Error,
    functionId: string,
    runId: string,
    attempt: number,
  ): Error {
    // If it's already an Inngest error, return as-is
    if (error.constructor.name.startsWith("Inngest")) {
      return error;
    }

    // Check for specific error types and wrap appropriately
    if (
      error.message.includes("timeout") ||
      error.name.includes("TimeoutError")
    ) {
      return new InngestTimeoutError(error.message, functionId, runId);
    }

    // Default to runtime error
    return new InngestRuntimeError(
      `Function execution failed: ${error.message}`,
      functionId,
      runId,
      error,
    );
  }

  /**
   * Gets function definitions for introspection
   */
  private getFunctionDefinitions(): any[] {
    try {
      return this.functionRegistry.createInngestFunctions();
    } catch (error) {
      this.logger.error("Failed to create function definitions:", { error });
      throw new InngestWebhookError(
        "Failed to retrieve function definitions",
        HttpStatus.INTERNAL_SERVER_ERROR,
        error as Error,
      );
    }
  }

  /**
   * Handles webhook errors and sends appropriate responses
   */
  private handleWebhookError(
    error: any,
    res: any,
    functionId?: string,
    context?: {
      runId?: string;
      attempt?: number;
      duration?: number;
      functionLogger?: EnhancedLogger;
    },
  ): void {
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";

    // Classify error for enhanced error handling
    const classification = errorHandler.classifyError(error);

    if (error instanceof InngestWebhookError) {
      statusCode = error.statusCode || HttpStatus.BAD_REQUEST;
      message = error.message;
    } else if (error instanceof InngestRuntimeError) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = error.message;
    } else {
      message = error.message || "Unknown error";
    }

    const errorResponse = {
      error: {
        message,
        code: error.code || "WEBHOOK_ERROR",
        function_id: functionId,
        timestamp: new Date().toISOString(),
        severity: classification.severity,
        category: classification.category,
        ...(context?.runId && { run_id: context.runId }),
        ...(context?.attempt && { attempt: context.attempt }),
      },
    };

    // Enhanced error logging using appropriate logger
    const logContext = {
      statusCode,
      severity: classification.severity,
      category: classification.category,
      retryable: classification.retryable,
      ...(context?.runId && { runId: context.runId }),
      ...(context?.attempt && { attempt: context.attempt }),
      ...(context?.duration && { duration: context.duration }),
    };

    if (context?.functionLogger && functionId && context.runId) {
      // Use function-specific logger for function execution errors
      context.functionLogger.logFunctionError(
        functionId,
        context.runId,
        context.attempt || 1,
        context.duration || 0,
        error,
        logContext,
      );
    }

    // Also use webhook-specific logging
    this.logger.logWebhook(
      "POST",
      functionId || "unknown",
      "failed",
      statusCode,
      logContext,
      error,
    );

    // Send error response using platform adapter
    const responseAdapter = this.httpAdapter.wrapResponse(res);
    responseAdapter.status(statusCode).json(errorResponse);
  }

  /**
   * Gets controller health status
   */
  getHealthStatus(): {
    status: "healthy" | "degraded" | "unhealthy";
    endpoint: string;
    registeredFunctions: number;
    signatureVerification: any;
  } {
    const signatureStatus = this.signatureVerification.getVerificationStatus(
      this.config.signingKey,
    );

    return {
      status: "healthy",
      endpoint: this.config.endpoint,
      registeredFunctions: this.functionRegistry.getFunctionCount(),
      signatureVerification: signatureStatus,
    };
  }

  /**
   * Validates webhook configuration
   */
  validateWebhookConfig(): {
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check signing key
    if (!this.config.signingKey) {
      issues.push("No signing key configured - webhooks are not secure");
      recommendations.push("Configure a signing key for webhook security");
    } else {
      try {
        this.signatureVerification.validateSignatureConfig({
          signingKey: this.config.signingKey,
        });
      } catch (error) {
        issues.push(
          `Signing key validation failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // Check endpoint configuration
    if (!this.config.endpoint) {
      issues.push("No endpoint configured");
      recommendations.push("Configure webhook endpoint path");
    }

    // Check function registry
    const functionCount = this.functionRegistry.getFunctionCount();
    if (functionCount === 0) {
      recommendations.push(
        "No functions registered - consider adding @InngestFunction decorators",
      );
    }

    return {
      isValid: issues.length === 0,
      issues,
      recommendations,
    };
  }
}
