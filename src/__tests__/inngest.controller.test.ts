import { Test, TestingModule } from "@nestjs/testing";
import { Request, Response } from "express";
import { HttpStatus } from "@nestjs/common";
import { InngestController } from "../controllers/inngest.controller";
import { FunctionRegistry } from "../services/function-registry.service";
import { ExecutionContextService } from "../services/execution-context.service";
import { SignatureVerificationService } from "../services/signature-verification.service";
import { MergedInngestConfig } from "../utils/config-validation";
import { InngestWebhookError, InngestRuntimeError } from "../errors";
import { INNGEST_CONFIG, ERROR_MESSAGES } from "../constants";
import { InngestEvent } from "../interfaces/inngest-event.interface";

describe("InngestController", () => {
  let controller: InngestController;
  let functionRegistry: jest.Mocked<FunctionRegistry>;
  let executionContext: jest.Mocked<ExecutionContextService>;
  let signatureVerification: jest.Mocked<SignatureVerificationService>;
  let mockConfig: MergedInngestConfig;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(async () => {
    mockConfig = {
      appId: "test-app",
      eventKey: "test-event-key",
      signingKey: "test-signing-key",
      baseUrl: undefined,
      endpoint: "/api/inngest",
      isDev: false,
      logger: true,
      env: "test",
      timeout: 30000,
      maxBatchSize: 100,
      strict: false,
      retry: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
      },
      development: {
        enabled: false,
        disableSignatureVerification: false,
      },
    };

    const mockFunctionRegistry = {
      getFunction: jest.fn(),
      createInngestFunctions: jest.fn(),
      getFunctionCount: jest.fn().mockReturnValue(5),
    };

    const mockExecutionContext = {
      createExecutionContext: jest.fn(),
      executeFunction: jest.fn(),
    };

    const mockSignatureVerification = {
      verifyWebhookSignature: jest.fn(),
      getVerificationStatus: jest.fn().mockReturnValue({
        enabled: true,
        hasSigningKey: true,
        algorithm: "HMAC-SHA256",
        toleranceSeconds: 300,
      }),
      validateSignatureConfig: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InngestController],
      providers: [
        {
          provide: INNGEST_CONFIG,
          useValue: mockConfig,
        },
        {
          provide: FunctionRegistry,
          useValue: mockFunctionRegistry,
        },
        {
          provide: ExecutionContextService,
          useValue: mockExecutionContext,
        },
        {
          provide: SignatureVerificationService,
          useValue: mockSignatureVerification,
        },
      ],
    }).compile();

    controller = module.get<InngestController>(InngestController);
    functionRegistry = module.get(FunctionRegistry);
    executionContext = module.get(ExecutionContextService);
    signatureVerification = module.get(SignatureVerificationService);

    // Setup mock request and response
    mockRequest = {
      body: {},
      headers: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("handlePost", () => {
    const mockWebhookRequest = {
      function_id: "test-function",
      event: {
        name: "test.event",
        data: { message: "test" },
      } as InngestEvent,
      run_id: "run-123",
      attempt: 1,
    };

    it("should execute function successfully", async () => {
      const mockFunctionMetadata = {
        target: {},
        propertyKey: "testMethod",
        config: {
          id: "test-function",
          triggers: [{ event: "test.event" }],
        },
        handler: jest.fn(),
      };

      const mockExecutionContext = {
        executionId: "test-execution",
        functionMetadata: mockFunctionMetadata,
        inngestContext: {
          event: mockWebhookRequest.event,
          step: {
            run: jest.fn(),
            sleep: jest.fn(),
            waitForEvent: jest.fn(),
            sendEvent: jest.fn(),
            invoke: jest.fn(),
          },
          logger: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
          runId: "run-123",
          attempt: 1,
        },
        contextId: "test-context",
        startTime: Date.now(),
        attempt: 1,
      } as any;

      signatureVerification.verifyWebhookSignature.mockResolvedValue();
      functionRegistry.getFunction.mockReturnValue(mockFunctionMetadata);
      executionContext.createExecutionContext.mockResolvedValue(
        mockExecutionContext
      );
      executionContext.executeFunction.mockResolvedValue("function result");

      mockRequest.body = mockWebhookRequest;

      await controller.handlePost(
        mockRequest as Request,
        mockResponse as Response,
        {} as Record<string, string>,
        mockWebhookRequest
      );

      expect(signatureVerification.verifyWebhookSignature).toHaveBeenCalledWith(
        mockRequest,
        {
          signingKey: "test-signing-key",
          toleranceSeconds: 300,
        }
      );
      expect(functionRegistry.getFunction).toHaveBeenCalledWith(
        "test-function"
      );
      expect(executionContext.createExecutionContext).toHaveBeenCalledWith(
        mockFunctionMetadata,
        mockWebhookRequest.event,
        "run-123",
        1
      );
      expect(executionContext.executeFunction).toHaveBeenCalledWith(
        mockExecutionContext
      );
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: "ok",
        result: "function result",
      });
    });

    it("should handle signature verification failure", async () => {
      signatureVerification.verifyWebhookSignature.mockRejectedValue(
        new InngestWebhookError(
          "Signature verification failed",
          HttpStatus.UNAUTHORIZED
        )
      );

      mockRequest.body = mockWebhookRequest;

      await controller.handlePost(
        mockRequest as Request,
        mockResponse as Response,
        {} as Record<string, string>,
        mockWebhookRequest
      );

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          message: "Signature verification failed",
        }),
      });
    });

    it("should handle missing function", async () => {
      signatureVerification.verifyWebhookSignature.mockResolvedValue();
      functionRegistry.getFunction.mockReturnValue(undefined);

      mockRequest.body = mockWebhookRequest;

      await controller.handlePost(
        mockRequest as Request,
        mockResponse as Response,
        {} as Record<string, string>,
        mockWebhookRequest
      );

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          message: expect.stringContaining(ERROR_MESSAGES.FUNCTION_NOT_FOUND),
          function_id: "test-function",
        }),
      });
    });

    it("should handle function execution errors", async () => {
      const mockFunctionMetadata = {
        target: {},
        propertyKey: "testMethod",
        config: {
          id: "test-function",
          triggers: [{ event: "test.event" }],
        },
        handler: jest.fn(),
      };

      signatureVerification.verifyWebhookSignature.mockResolvedValue();
      functionRegistry.getFunction.mockReturnValue(mockFunctionMetadata);
      executionContext.createExecutionContext.mockRejectedValue(
        new Error("Execution failed")
      );

      mockRequest.body = mockWebhookRequest;

      await controller.handlePost(
        mockRequest as Request,
        mockResponse as Response,
        {} as Record<string, string>,
        mockWebhookRequest
      );

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          message: "Execution failed",
          function_id: "test-function",
        }),
      });
    });
  });

  describe("handlePut", () => {
    it("should return function definitions", async () => {
      const mockFunctions = [
        {
          id: "test-function-1",
          name: "Test Function 1",
          triggers: [{ event: "test.event1" }],
        },
        {
          id: "test-function-2",
          name: "Test Function 2",
          triggers: [{ cron: "0 0 * * *" }],
        },
      ];

      signatureVerification.verifyWebhookSignature.mockResolvedValue();
      functionRegistry.createInngestFunctions.mockReturnValue(mockFunctions);

      await controller.handlePut(
        mockRequest as Request,
        mockResponse as Response,
        {} as Record<string, string>
      );

      expect(signatureVerification.verifyWebhookSignature).toHaveBeenCalledWith(
        mockRequest,
        {
          signingKey: "test-signing-key",
          toleranceSeconds: 300,
        }
      );
      expect(functionRegistry.createInngestFunctions).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.json).toHaveBeenCalledWith({
        functions: mockFunctions,
        sdk: {
          name: "nest-inngest",
          version: "1.0.0",
          language: "typescript",
          framework: "nestjs",
        },
      });
    });

    it("should handle function definition creation errors", async () => {
      signatureVerification.verifyWebhookSignature.mockResolvedValue();
      functionRegistry.createInngestFunctions.mockImplementation(() => {
        throw new Error("Failed to create functions");
      });

      await controller.handlePut(
        mockRequest as Request,
        mockResponse as Response,
        {} as Record<string, string>
      );

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          message: "Failed to retrieve function definitions",
        }),
      });
    });
  });

  describe("getHealthStatus", () => {
    it("should return health status with signature verification info", () => {
      const health = controller.getHealthStatus();

      expect(health).toEqual({
        status: "healthy",
        endpoint: "/api/inngest",
        registeredFunctions: 5,
        signatureVerification: {
          enabled: true,
          hasSigningKey: true,
          algorithm: "HMAC-SHA256",
          toleranceSeconds: 300,
        },
      });

      expect(signatureVerification.getVerificationStatus).toHaveBeenCalledWith(
        "test-signing-key"
      );
    });
  });

  describe("validateWebhookConfig", () => {
    it("should validate valid configuration", () => {
      signatureVerification.validateSignatureConfig.mockImplementation(
        () => {}
      );

      const validation = controller.validateWebhookConfig();

      expect(validation.isValid).toBe(true);
      expect(validation.issues).toHaveLength(0);
      expect(
        signatureVerification.validateSignatureConfig
      ).toHaveBeenCalledWith({
        signingKey: "test-signing-key",
      });
    });

    it("should detect missing signing key", async () => {
      const configWithoutKey = { ...mockConfig, signingKey: undefined };
      const module: TestingModule = await Test.createTestingModule({
        controllers: [InngestController],
        providers: [
          {
            provide: INNGEST_CONFIG,
            useValue: configWithoutKey,
          },
          {
            provide: FunctionRegistry,
            useValue: functionRegistry,
          },
          {
            provide: ExecutionContextService,
            useValue: executionContext,
          },
          {
            provide: SignatureVerificationService,
            useValue: signatureVerification,
          },
        ],
      }).compile();

      const controllerWithoutKey =
        module.get<InngestController>(InngestController);

      const validation = controllerWithoutKey.validateWebhookConfig();

      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain(
        "No signing key configured - webhooks are not secure"
      );
      expect(validation.recommendations).toContain(
        "Configure a signing key for webhook security"
      );
    });

    it("should detect invalid signing key", () => {
      signatureVerification.validateSignatureConfig.mockImplementation(() => {
        throw new Error("Invalid signing key");
      });

      const validation = controller.validateWebhookConfig();

      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain(
        "Signing key validation failed: Invalid signing key"
      );
    });

    it("should detect missing endpoint", async () => {
      const configWithoutEndpoint = { ...mockConfig, endpoint: undefined };
      const module: TestingModule = await Test.createTestingModule({
        controllers: [InngestController],
        providers: [
          {
            provide: INNGEST_CONFIG,
            useValue: configWithoutEndpoint,
          },
          {
            provide: FunctionRegistry,
            useValue: functionRegistry,
          },
          {
            provide: ExecutionContextService,
            useValue: executionContext,
          },
          {
            provide: SignatureVerificationService,
            useValue: signatureVerification,
          },
        ],
      }).compile();

      const controllerWithoutEndpoint =
        module.get<InngestController>(InngestController);

      const validation = controllerWithoutEndpoint.validateWebhookConfig();

      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain("No endpoint configured");
      expect(validation.recommendations).toContain(
        "Configure webhook endpoint path"
      );
    });

    it("should recommend adding functions when none are registered", () => {
      functionRegistry.getFunctionCount.mockReturnValue(0);
      signatureVerification.validateSignatureConfig.mockImplementation(
        () => {}
      );

      const validation = controller.validateWebhookConfig();

      expect(validation.recommendations).toContain(
        "No functions registered - consider adding @InngestFunction decorators"
      );
    });
  });

  describe("error handling", () => {
    it("should handle InngestWebhookError correctly", async () => {
      const webhookError = new InngestWebhookError(
        "Test webhook error",
        HttpStatus.BAD_REQUEST
      );
      signatureVerification.verifyWebhookSignature.mockRejectedValue(
        webhookError
      );

      mockRequest.body = {
        function_id: "test-function",
        event: { name: "test.event", data: {} },
        run_id: "run-123",
        attempt: 1,
      };

      await controller.handlePost(
        mockRequest as Request,
        mockResponse as Response,
        {} as Record<string, string>,
        mockRequest.body as any
      );

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          message: "Test webhook error",
          code: "INNGEST_WEBHOOK_ERROR",
        }),
      });
    });

    it("should handle InngestRuntimeError correctly", async () => {
      const runtimeError = new InngestRuntimeError(
        "Test runtime error",
        "test-function",
        "run-123"
      );

      const mockFunctionMetadata = {
        target: {},
        propertyKey: "testMethod",
        config: { id: "test-function", triggers: [{ event: "test.event" }] },
        handler: jest.fn(),
      };

      signatureVerification.verifyWebhookSignature.mockResolvedValue();
      functionRegistry.getFunction.mockReturnValue(mockFunctionMetadata);
      executionContext.createExecutionContext.mockRejectedValue(runtimeError);

      mockRequest.body = {
        function_id: "test-function",
        event: { name: "test.event", data: {} },
        run_id: "run-123",
        attempt: 1,
      };

      await controller.handlePost(
        mockRequest as Request,
        mockResponse as Response,
        {} as Record<string, string>,
        mockRequest.body as any
      );

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          message: "Test runtime error",
          code: "INNGEST_RUNTIME_ERROR",
          function_id: "test-function",
        }),
      });
    });

    it("should handle generic errors correctly", async () => {
      const genericError = new Error("Generic error");
      signatureVerification.verifyWebhookSignature.mockRejectedValue(
        genericError
      );

      mockRequest.body = {
        function_id: "test-function",
        event: { name: "test.event", data: {} },
        run_id: "run-123",
        attempt: 1,
      };

      await controller.handlePost(
        mockRequest as Request,
        mockResponse as Response,
        {} as Record<string, string>,
        mockRequest.body as any
      );

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          message: "Generic error",
          code: "WEBHOOK_ERROR",
        }),
      });
    });
  });
});
