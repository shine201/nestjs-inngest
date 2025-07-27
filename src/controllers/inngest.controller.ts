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
import { Request, Response } from "express";
import { FunctionRegistry } from "../services/function-registry.service";
import { ExecutionContextService } from "../services/execution-context.service";
import { SignatureVerificationService } from "../services/signature-verification.service";
import { MergedInngestConfig } from "../utils/config-validation";
import { InngestWebhookError, InngestRuntimeError } from "../errors";
import { INNGEST_CONFIG, ERROR_MESSAGES } from "../constants";
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
  private readonly logger = new Logger(InngestController.name);

  constructor(
    @Inject(INNGEST_CONFIG) private readonly config: MergedInngestConfig,
    private readonly functionRegistry: FunctionRegistry,
    private readonly executionContext: ExecutionContextService,
    private readonly signatureVerification: SignatureVerificationService
  ) {}

  /**
   * Handles POST requests from Inngest (function execution)
   */
  @Post()
  async handlePost(
    @Req() req: Request,
    @Res() res: Response,
    @Headers() headers: Record<string, string>,
    @Body() body: InngestWebhookRequest
  ): Promise<void> {
    try {
      this.logger.debug(
        `Received POST webhook for function: ${body.function_id}`
      );

      // Verify webhook signature using dedicated service
      await this.signatureVerification.verifyWebhookSignature(req, {
        signingKey: this.config.signingKey,
        toleranceSeconds: 300, // 5 minutes
      });

      // Execute the function
      const result = await this.executeFunction(body);

      // Send success response
      res.status(HttpStatus.OK).json({
        status: "ok",
        result,
      });
    } catch (error) {
      this.handleWebhookError(error, res, body?.function_id);
    }
  }

  /**
   * Handles PUT requests from Inngest (function registration/introspection)
   */
  @Put()
  async handlePut(
    @Req() req: Request,
    @Res() res: Response,
    @Headers() headers: Record<string, string>
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

      res.status(HttpStatus.OK).json({
        functions,
        sdk: {
          name: "nest-inngest",
          version: "1.0.0",
          language: "typescript",
          framework: "nestjs",
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
    webhookRequest: InngestWebhookRequest
  ): Promise<any> {
    const { function_id, event, run_id, attempt = 1 } = webhookRequest;

    // Get function metadata
    const functionMetadata = this.functionRegistry.getFunction(function_id);
    if (!functionMetadata) {
      throw new InngestWebhookError(
        `${ERROR_MESSAGES.FUNCTION_NOT_FOUND}: ${function_id}`,
        HttpStatus.NOT_FOUND
      );
    }

    try {
      // Create execution context
      const executionContext =
        await this.executionContext.createExecutionContext(
          functionMetadata,
          event,
          run_id,
          attempt
        );

      // Execute the function
      const result = await this.executionContext.executeFunction(
        executionContext
      );

      this.logger.log(
        `Function ${function_id} executed successfully (run: ${run_id}, attempt: ${attempt})`
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Function ${function_id} execution failed (run: ${run_id}, attempt: ${attempt}):`,
        error
      );

      throw new InngestRuntimeError(
        `Function execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        function_id,
        run_id,
        error as Error
      );
    }
  }

  /**
   * Gets function definitions for introspection
   */
  private getFunctionDefinitions(): any[] {
    try {
      return this.functionRegistry.createInngestFunctions();
    } catch (error) {
      this.logger.error("Failed to create function definitions:", error);
      throw new InngestWebhookError(
        "Failed to retrieve function definitions",
        HttpStatus.INTERNAL_SERVER_ERROR,
        error as Error
      );
    }
  }

  /**
   * Handles webhook errors and sends appropriate responses
   */
  private handleWebhookError(
    error: any,
    res: Response,
    functionId?: string
  ): void {
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";

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
      },
    };

    this.logger.error(
      `Webhook error${functionId ? ` for function ${functionId}` : ""}:`,
      error
    );

    res.status(statusCode).json(errorResponse);
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
      this.config.signingKey
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
          }`
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
        "No functions registered - consider adding @InngestFunction decorators"
      );
    }

    return {
      isValid: issues.length === 0,
      issues,
      recommendations,
    };
  }
}
