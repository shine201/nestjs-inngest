import { Injectable } from "@nestjs/common";
import { InngestEvent } from "../../interfaces/inngest-event.interface";

/**
 * Mock step tools for testing
 */
export class MockStepTools {
  public runMock = jest.fn();
  public sleepMock = jest.fn();
  public sleepUntilMock = jest.fn();
  public waitForEventMock = jest.fn();
  public invokeMock = jest.fn();
  public sendEventMock = jest.fn();

  async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
    // Check if the mock has been configured with specific behavior
    const mockImplementation = this.runMock.getMockImplementation();

    if (mockImplementation) {
      // Custom implementation provided
      this.runMock(id, fn);
      return mockImplementation(id, fn);
    }

    // Try to call the mock and see if it returns a promise (for mockResolvedValue/mockRejectedValue)
    try {
      const mockResult = this.runMock(id, fn);
      if (mockResult && typeof mockResult.then === "function") {
        // It's a promise (from mockResolvedValue/mockRejectedValue)
        return await mockResult;
      }
      if (mockResult !== undefined) {
        // Mock returned a value
        return mockResult;
      }
    } catch (error) {
      // Mock threw an error - re-throw it
      throw error;
    }

    // Default behavior: execute the actual function
    return fn();
  }

  async sleep(id: string, duration: number): Promise<void> {
    this.sleepMock(id, duration);
    return Promise.resolve();
  }

  async sleepUntil(id: string, datetime: Date | string): Promise<void> {
    this.sleepUntilMock(id, datetime);
    return Promise.resolve();
  }

  async waitForEvent<T = any>(
    id: string,
    options: {
      event: string;
      timeout?: number;
      if?: string;
    },
  ): Promise<T> {
    this.waitForEventMock(id, options);
    // Return mock event data by default
    return { name: options.event, data: { mock: true } } as T;
  }

  async invoke<T = any>(
    id: string,
    options: {
      function: string;
      data?: any;
      timeout?: number;
    },
  ): Promise<T> {
    this.invokeMock(id, options);
    // Return mock result by default
    return { result: "mocked" } as T;
  }

  async sendEvent(
    id: string,
    events: InngestEvent | InngestEvent[],
  ): Promise<void> {
    this.sendEventMock(id, events);
    return Promise.resolve();
  }

  /**
   * Clear all mock calls and implementations
   */
  clearMocks(): void {
    this.runMock.mockClear();
    this.sleepMock.mockClear();
    this.sleepUntilMock.mockClear();
    this.waitForEventMock.mockClear();
    this.invokeMock.mockClear();
    this.sendEventMock.mockClear();
  }

  /**
   * Reset all mocks to default implementations
   */
  resetMocks(): void {
    this.runMock.mockReset();
    this.sleepMock.mockReset();
    this.sleepUntilMock.mockReset();
    this.waitForEventMock.mockReset();
    this.invokeMock.mockReset();
    this.sendEventMock.mockReset();
  }
}

/**
 * Mock execution context for testing
 */
export interface MockExecutionContext {
  functionId: string;
  runId: string;
  event: InngestEvent;
  attempt: number;
  step: MockStepTools;
  env: NodeJS.ProcessEnv;
}

/**
 * Mock implementation of ExecutionContextService for testing
 */
@Injectable()
export class MockExecutionContextService {
  private createContextMock = jest.fn();
  private executeFunctionMock = jest.fn();
  private contexts: Map<string, MockExecutionContext> = new Map();

  /**
   * Mock create execution context
   */
  async createExecutionContext(
    functionMetadata: any,
    event: InngestEvent,
    runId: string,
    attempt: number = 1,
  ): Promise<MockExecutionContext> {
    const context: MockExecutionContext = {
      functionId: functionMetadata.id,
      runId,
      event,
      attempt,
      step: new MockStepTools(),
      env: process.env,
    };

    // Store function metadata for execution
    (context as any).functionMetadata = functionMetadata;

    this.contexts.set(runId, context);
    this.createContextMock(functionMetadata, event, runId, attempt);

    return context;
  }

  /**
   * Mock execute function
   */
  async executeFunction(context: MockExecutionContext): Promise<any> {
    this.executeFunctionMock(context);

    // If a mock implementation is provided, use it
    const mockImpl = this.executeFunctionMock.getMockImplementation();
    if (mockImpl) {
      return mockImpl(context);
    }

    // Otherwise, try to execute the actual handler if available
    const functionMetadata =
      (context as any).handler || (context as any).functionMetadata;
    if (functionMetadata && typeof functionMetadata.handler === "function") {
      try {
        return await functionMetadata.handler(context.event, context);
      } catch (error) {
        throw error;
      }
    }

    // Fallback to mock result
    return {
      result: "mock execution result",
      functionId: context.functionId,
      runId: context.runId,
    };
  }

  /**
   * Get context by run ID for testing
   */
  getContext(runId: string): MockExecutionContext | undefined {
    return this.contexts.get(runId);
  }

  /**
   * Get all created contexts
   */
  getAllContexts(): MockExecutionContext[] {
    return Array.from(this.contexts.values());
  }

  /**
   * Clear all contexts and mocks
   */
  clearContexts(): void {
    this.contexts.clear();
    this.createContextMock.mockClear();
    this.executeFunctionMock.mockClear();
  }

  /**
   * Get mock for createExecutionContext
   */
  getCreateContextMock(): jest.Mock {
    return this.createContextMock;
  }

  /**
   * Get mock for executeFunction
   */
  getExecuteFunctionMock(): jest.Mock {
    return this.executeFunctionMock;
  }

  /**
   * Configure mock to throw error on context creation
   */
  mockCreateContextError(error: Error): void {
    this.createContextMock.mockRejectedValue(error);
  }

  /**
   * Configure mock to throw error on function execution
   */
  mockExecutionError(error: Error): void {
    this.executeFunctionMock.mockRejectedValue(error);
  }

  /**
   * Configure mock to return specific result
   */
  mockExecutionResult(result: any): void {
    this.executeFunctionMock.mockResolvedValue(result);
  }

  /**
   * Configure mock execution with delay
   */
  mockExecutionDelay(delay: number, result?: any): void {
    this.executeFunctionMock.mockImplementation(async (context) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return (
        result || {
          result: "delayed mock result",
          functionId: context.functionId,
          runId: context.runId,
        }
      );
    });
  }

  /**
   * Reset all mocks to default behavior
   */
  resetMocks(): void {
    this.createContextMock.mockReset();
    this.executeFunctionMock.mockReset();
    this.clearContexts();

    // Restore default implementations
    this.createContextMock.mockImplementation(
      async (functionMetadata, event, runId, attempt = 1) => {
        const context: MockExecutionContext = {
          functionId: functionMetadata.id,
          runId,
          event,
          attempt,
          step: new MockStepTools(),
          env: process.env,
        };
        this.contexts.set(runId, context);
        return context;
      },
    );

    this.executeFunctionMock.mockImplementation(async (context) => {
      return {
        result: "mock execution result",
        functionId: context.functionId,
        runId: context.runId,
      };
    });
  }

  /**
   * Assert that context was created for specific function
   */
  expectContextCreated(functionId: string, runId?: string): void {
    if (runId) {
      const context = this.getContext(runId);
      expect(context).toBeDefined();
      expect(context!.functionId).toBe(functionId);
    } else {
      const contexts = this.getAllContexts();
      const matchingContext = contexts.find(
        (ctx) => ctx.functionId === functionId,
      );
      expect(matchingContext).toBeDefined();
    }
  }

  /**
   * Assert that function was executed
   */
  expectFunctionExecuted(times: number = 1): void {
    expect(this.executeFunctionMock).toHaveBeenCalledTimes(times);
  }

  /**
   * Assert that step method was called
   */
  expectStepCalled(
    runId: string,
    stepMethod: keyof MockStepTools,
    ...args: any[]
  ): void {
    const context = this.getContext(runId);
    expect(context).toBeDefined();

    const stepMock = context!.step[stepMethod] as jest.Mock;
    expect(stepMock).toHaveBeenCalledWith(...args);
  }
}
