import {
  Controller,
  Post,
  Put,
  Req,
  Res,
  Logger,
  HttpStatus,
  HttpException,
  Inject,
} from "@nestjs/common";
import { Request, Response } from "express";
import { FunctionRegistry } from "../services/function-registry.service";
import { ExecutionContextService } from "../services/execution-context.service";
import { MergedInngestConfig } from "../utils/config-validation";
import { InngestWebhookError, InngestRuntimeError } from "../errors";
import { INNGEST_CONFIG } from "../constants";

/**
 * Webhook request body structure from Inngest
 */
interface InngestWebhookRequest {
  /**
   * Request type (invoke, register, etc.)
   */
  type: "invoke" | "register" | "introspect";

  /**
   * Function data for invoke requests
   */
  function?: {
    id: string;
    name: string;
  };

  /**
   * Event data for invoke requests
   */
  event?: any;

  /**
   * Run context for invoke requests
   */
  ctx?: {
    run_id: string;
    attempt: number;
    stack?: any;
  };

  /**
   * Steps data for invoke requests
   */
  steps?: Record<string, any>;

  /**
   * Additional request data
   */
  [key: string]: any;
}

/**
 * Controller for handling Inngest webhook requests
 */
@Controller()
export class InngestController {
  private readonly logger = new Logger(InngestController.name);

  constructor(
    @Inject(INNGEST_CONFIG) private readonly config: MergedInngestConfig,
    private readonly functionRegistry: FunctionRegistry,
    private readonly executionContextService: ExecutionContextService
  ) {}

  /**
   * Handles POST requests from Inngest (function invocations)
   */
  @Post()
  async handlePost(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handleWebhookRequest(req, res);
  }

  /**
   * Handles PUT requests from Inngest (function registration)
   */
  @Put()
  async handlePut(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handleWebhookRequest(req, res);
  }

  /**
   * Main webhook request handler
   */
  private async handleWebhookRequest(
    req: Request,
    res: Response
  ): Promise<void> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    try {
      this.logger.debug(
        `Handling webhook request ${requestId}: ${req.method} ${req.url}`
      );

      // Validate request signature if signing key is configured
      if (this.config.signingKey) {
        await this.validateSignature(req);
      }

      // Parse request body
      const webhookRequest = this.parseWebhookRequest(req);

      // Handle different request types
      let response: any;
      switch (webhookRequest.type) {
        case "invoke":
          response = await this.handleInvokeRequest(webhookRequest, requestId);
          break;
        case "register":
          response = await this.handleRegisterRequest(
            webhookRequest,
            requestId
          );
          break;
        case "introspect":
          response = await this.handleIntrospectRequest(
            webhookRequest,
            requestId
          );
          break;
        default:
          throw new InngestWebhookError(
            `Unsupported request type: ${webhookRequest.type}`,
            HttpStatus.BAD_REQUEST
          );
      }

      // Send response
      const duration = Date.now() - startTime;
      this.logger.debug(
        `Webhook request ${requestId} completed in ${duration}ms`
      );

      res.status(HttpStatus.OK).json(response);
    } catch (error) {
      await this.handleWebhookError(error, req, res, requestId, startTime);
    }
  }

  /**
   * Handles function invocation requests
   */
  private async handleInvokeRequest(
    webhookRequest: InngestWebhookRequest,
    requestId: string
  ): Promise<any> {
    const { function: fnData, event, ctx } = webhookRequest;

    if (!fnData?.id) {
      throw new InngestWebhookError(
        "Missing function ID in invoke request",
        HttpStatus.BAD_REQUEST
      );
    }

    if (!event) {
      throw new InngestWebhookError(
        "Missing event data in invoke request",
        HttpStatus.BAD_REQUEST
      );
    }

    if (!ctx?.run_id) {
      throw new InngestWebhookError(
        "Missing run context in invoke request",
        HttpStatus.BAD_REQUEST
      );
    }

    this.logger.log(
      `Invoking function ${fnData.id} (run: ${ctx.run_id}, attempt: ${
        ctx.attempt || 1
      })`
    );

    // Get function metadata
    const functionMetadata = this.functionRegistry.getFunction(fnData.id);
    if (!functionMetadata) {
      throw new InngestWebhookError(
        `Function not found: ${fnData.id}`,
        HttpStatus.NOT_FOUND
      );
    }

    try {
      // Create execution context
      const executionContext =
        await this.executionContextService.createExecutionContext(
          functionMetadata,
          event,
          ctx.run_id,
          ctx.attempt || 1
        );

      // Execute function
      const result = await this.executionContextService.executeFunction(
        executionContext
      );

      this.logger.log(
        `Function ${fnData.id} completed successfully (run: ${ctx.run_id})`
      );

      return {
        status: "completed",
        result,
        requestId,
      };
    } catch (error) {
      this.logger.error(
        `Function ${fnData.id} failed (run: ${ctx.run_id}):`,
        error
      );

      // Return error response that Inngest can handle
      return {
        status: "failed",
        error: {
          name: error.name || "Error",
          message: error.message || "Unknown error",
          stack: error.stack,
        },
        requestId,
      };
    }
  }

  /**
   * Handles function registration requests
   */
  private async handleRegisterRequest(
    webhookRequest: InngestWebhookRequest,
    requestId: string
  ): Promise<any> {
    this.logger.log(`Handling function registration request ${requestId}`);

    try {
      // Get all registered functions
      const functions = this.functionRegistry.createInngestFunctions();

      this.logger.log(`Returning ${functions.length} registered function(s)`);

      return {
        functions,
        requestId,
        app: {
          id: this.config.appId,
          name: this.config.appId,
          url: this.config.baseUrl || "http://localhost:3000",
        },
      };
    } catch (error) {
      this.logger.error("Failed to handle registration request:", error);
      throw new InngestWebhookError(
        "Failed to register functions",
        HttpStatus.INTERNAL_SERVER_ERROR,
        error as Error
      );
    }
  }

  /**
   * Handles introspection requests
   */
  private async handleIntrospectRequest(
    webhookRequest: InngestWebhookRequest,
    requestId: string
  ): Promise<any> {
    this.logger.debug(`Handling introspection request ${requestId}`);

    const stats = this.functionRegistry.getStats();
    const executionStats = this.executionContextService.getExecutionStats();

    return {
      app: {
        id: this.config.appId,
        name: this.config.appId,
        url: this.config.baseUrl || "http://localhost:3000",
        env: this.config.env,
        isDev: this.config.isDev,
      },
      functions: {
        total: stats.totalFunctions,
        byTriggerType: stats.functionsByTriggerType,
        byClass: stats.functionsByClass,
      },
      execution: {
        active: executionStats.activeExecutions,
        byFunction: executionStats.executionsByFunction,
        averageTime: executionStats.averageExecutionTime,
      },
      requestId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Validates webhook request signature
   */
  private async validateSignature(req: Request): Promise<void> {
    const signature = req.headers["x-inngest-signature"] as string;
    const timestamp = req.headers["x-inngest-timestamp"] as string;

    if (!signature) {
      throw new InngestWebhookError(
        "Missing signature header",
        HttpStatus.UNAUTHORIZED
      );
    }

    if (!timestamp) {
      throw new InngestWebhookError(
        "Missing timestamp header",
        HttpStatus.UNAUTHORIZED
      );
    }

    // Check timestamp to prevent replay attacks (5 minute window)
    const requestTime = parseInt(timestamp, 10) * 1000;
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    if (Math.abs(now - requestTime) > maxAge) {
      throw new InngestWebhookError(
        "Request timestamp too old",
        HttpStatus.UNAUTHORIZED
      );
    }

    // Validate signature
    const crypto = await import("crypto");
    const body = JSON.stringify(req.body);
    const payload = `${timestamp}.${body}`;
    const expectedSignature = crypto
      .createHmac("sha256", this.config.signingKey!)
      .update(payload)
      .digest("hex");

    const providedSignature = signature.replace("sha256=", "");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "hex"),
        Buffer.from(providedSignature, "hex")
      )
    ) {
      throw new InngestWebhookError(
        "Invalid signature",
        HttpStatus.UNAUTHORIZED
      );
    }

    this.logger.debug("Webhook signature validated successfully");
  }

  /**
   * Parses webhook request body
   */
  private parseWebhookRequest(req: Request): InngestWebhookRequest {
    try {
      const body = req.body;

      if (!body || typeof body !== "object") {
        throw new Error("Invalid request body");
      }

      if (!body.type) {
        throw new Error("Missing request type");
      }

      return body as InngestWebhookRequest;
    } catch (error) {
      throw new InngestWebhookError(
        `Failed to parse webhook request: ${error.message}`,
        HttpStatus.BAD_REQUEST,
        error as Error
      );
    }
  }

  /**
   * Handles webhook errors
   */
  private async handleWebhookError(
    error: any,
    req: Request,
    res: Response,
    requestId: string,
    startTime: number
  ): Promise<void> {
    const duration = Date.now() - startTime;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: any = {
      error: "Internal Server Error",
      message: "An unexpected error occurred",
      requestId,
      timestamp: new Date().toISOString(),
    };

    if (error instanceof InngestWebhookError) {
      statusCode = error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      errorResponse = {
        error: error.name,
        message: error.message,
        requestId,
        timestamp: new Date().toISOString(),
      };
    } else if (error instanceof InngestRuntimeError) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      errorResponse = {
        error: "Function Execution Error",
        message: error.message,
        functionId: error.functionId,
        runId: error.runId,
        requestId,
        timestamp: new Date().toISOString(),
      };
    } else if (error instanceof HttpException) {
      statusCode = error.getStatus();
      errorResponse = {
        error: error.name,
        message: error.message,
        requestId,
        timestamp: new Date().toISOString(),
      };
    }

    this.logger.error(
      `Webhook request ${requestId} failed after ${duration}ms:`,
      error
    );

    // Don't expose internal errors in production
    if (
      this.config.env === "production" &&
      statusCode === HttpStatus.INTERNAL_SERVER_ERROR
    ) {
      errorResponse.message = "Internal Server Error";
      delete errorResponse.stack;
    }

    res.status(statusCode).json(errorResponse);
  }

  /**
   * Generates a unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets controller health status
   */
  getHealthStatus(): {
    status: "healthy" | "degraded" | "unhealthy";
    endpoint: string;
    registeredFunctions: number;
    activeExecutions: number;
  } {
    const stats = this.functionRegistry.getStats();
    const executionStats = this.executionContextService.getExecutionStats();

    return {
      status: "healthy", // TODO: Implement actual health checks
      endpoint: this.config.endpoint,
      registeredFunctions: stats.totalFunctions,
      activeExecutions: executionStats.activeExecutions,
    };
  }
}
