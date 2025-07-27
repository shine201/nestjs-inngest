import { Injectable, Logger, LoggerService } from "@nestjs/common";
import { InngestError } from "../errors";

/**
 * Log levels with priority
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  LOG = 2,
  DEBUG = 3,
  VERBOSE = 4,
}

/**
 * Structured log entry interface
 */
export interface LogEntry {
  /**
   * Log level
   */
  level: LogLevel;

  /**
   * Log message
   */
  message: string;

  /**
   * Additional context data
   */
  context?: Record<string, any>;

  /**
   * Error object if applicable
   */
  error?: Error | InngestError;

  /**
   * Timestamp
   */
  timestamp: Date;

  /**
   * Logger name/category
   */
  logger: string;

  /**
   * Request/trace ID for correlation
   */
  traceId?: string;

  /**
   * Function ID for Inngest-specific logs
   */
  functionId?: string;

  /**
   * Run ID for Inngest execution tracking
   */
  runId?: string;

  /**
   * Additional tags for filtering
   */
  tags?: string[];
}

/**
 * Enhanced logger service that extends NestJS Logger with Inngest-specific features
 */
@Injectable()
export class EnhancedLogger implements LoggerService {
  private readonly nestLogger: Logger;
  private readonly context: string;
  private logLevel: LogLevel = LogLevel.LOG;
  private enableStructuredLogging: boolean = true;

  constructor(context?: string) {
    this.context = context || EnhancedLogger.name;
    this.nestLogger = new Logger(this.context);
  }

  /**
   * Set the current log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Enable or disable structured logging
   */
  setStructuredLogging(enabled: boolean): void {
    this.enableStructuredLogging = enabled;
  }

  /**
   * Log an error message
   */
  error(message: any, context?: Record<string, any>, error?: Error): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.logStructured({
        level: LogLevel.ERROR,
        message: this.formatMessage(message),
        context,
        error,
        timestamp: new Date(),
        logger: this.context,
      });
    }
  }

  /**
   * Log a warning message
   */
  warn(message: any, context?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.logStructured({
        level: LogLevel.WARN,
        message: this.formatMessage(message),
        context,
        timestamp: new Date(),
        logger: this.context,
      });
    }
  }

  /**
   * Log an info/log message
   */
  log(message: any, context?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.LOG)) {
      this.logStructured({
        level: LogLevel.LOG,
        message: this.formatMessage(message),
        context,
        timestamp: new Date(),
        logger: this.context,
      });
    }
  }

  /**
   * Log a debug message
   */
  debug(message: any, context?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.logStructured({
        level: LogLevel.DEBUG,
        message: this.formatMessage(message),
        context,
        timestamp: new Date(),
        logger: this.context,
      });
    }
  }

  /**
   * Log a verbose message
   */
  verbose(message: any, context?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.VERBOSE)) {
      this.logStructured({
        level: LogLevel.VERBOSE,
        message: this.formatMessage(message),
        context,
        timestamp: new Date(),
        logger: this.context,
      });
    }
  }

  /**
   * Log Inngest function execution start
   */
  logFunctionStart(
    functionId: string,
    runId: string,
    attempt: number,
    context?: Record<string, any>
  ): void {
    this.log(`Function ${functionId} execution started`, {
      ...context,
      functionId,
      runId,
      attempt,
      phase: 'start',
      tags: ['function-execution', 'start'],
    });
  }

  /**
   * Log Inngest function execution success
   */
  logFunctionSuccess(
    functionId: string,
    runId: string,
    attempt: number,
    duration: number,
    result?: any,
    context?: Record<string, any>
  ): void {
    this.log(`Function ${functionId} executed successfully`, {
      ...context,
      functionId,
      runId,
      attempt,
      duration,
      phase: 'success',
      resultType: result ? typeof result : 'void',
      tags: ['function-execution', 'success'],
    });
  }

  /**
   * Log Inngest function execution failure
   */
  logFunctionError(
    functionId: string,
    runId: string,
    attempt: number,
    duration: number,
    error: Error | InngestError,
    context?: Record<string, any>
  ): void {
    this.error(`Function ${functionId} execution failed`, {
      ...context,
      functionId,
      runId,
      attempt,
      duration,
      phase: 'error',
      errorCode: error instanceof InngestError ? error.code : 'UNKNOWN',
      errorType: error.constructor.name,
      tags: ['function-execution', 'error'],
    }, error);
  }

  /**
   * Log step execution
   */
  logStep(
    stepId: string,
    stepType: string,
    functionId: string,
    runId: string,
    status: 'start' | 'success' | 'error',
    context?: Record<string, any>,
    error?: Error
  ): void {
    const level = status === 'error' ? LogLevel.ERROR : LogLevel.LOG;
    const message = `Step ${stepId} (${stepType}) ${status}`;

    this.logStructured({
      level,
      message,
      context: {
        ...context,
        stepId,
        stepType,
        functionId,
        runId,
        stepStatus: status,
        tags: ['step-execution', status],
      },
      error,
      timestamp: new Date(),
      logger: this.context,
      functionId,
      runId,
    });
  }

  /**
   * Log event processing
   */
  logEvent(
    eventName: string,
    eventId: string,
    action: 'received' | 'validated' | 'processed' | 'failed',
    context?: Record<string, any>,
    error?: Error
  ): void {
    const level = action === 'failed' ? LogLevel.ERROR : LogLevel.LOG;
    const message = `Event ${eventName} ${action}`;

    this.logStructured({
      level,
      message,
      context: {
        ...context,
        eventName,
        eventId,
        eventAction: action,
        tags: ['event-processing', action],
      },
      error,
      timestamp: new Date(),
      logger: this.context,
    });
  }

  /**
   * Log webhook processing
   */
  logWebhook(
    method: string,
    functionId: string,
    status: 'received' | 'processed' | 'failed',
    statusCode?: number,
    context?: Record<string, any>,
    error?: Error
  ): void {
    const level = status === 'failed' ? LogLevel.ERROR : LogLevel.LOG;
    const message = `Webhook ${method} for ${functionId} ${status}`;

    this.logStructured({
      level,
      message,
      context: {
        ...context,
        method,
        functionId,
        webhookStatus: status,
        statusCode,
        tags: ['webhook', status],
      },
      error,
      timestamp: new Date(),
      logger: this.context,
      functionId,
    });
  }

  /**
   * Log configuration events
   */
  logConfig(
    action: 'loaded' | 'validated' | 'error',
    context?: Record<string, any>,
    error?: Error
  ): void {
    const level = action === 'error' ? LogLevel.ERROR : LogLevel.LOG;
    const message = `Configuration ${action}`;

    this.logStructured({
      level,
      message,
      context: {
        ...context,
        configAction: action,
        tags: ['configuration', action],
      },
      error,
      timestamp: new Date(),
      logger: this.context,
    });
  }

  /**
   * Log performance metrics
   */
  logPerformance(
    operation: string,
    duration: number,
    functionId?: string,
    runId?: string,
    context?: Record<string, any>
  ): void {
    this.debug(`Performance: ${operation} took ${duration}ms`, {
      ...context,
      operation,
      duration,
      functionId,
      runId,
      tags: ['performance'],
    });
  }

  /**
   * Log with custom trace ID for request correlation
   */
  logWithTrace(
    level: LogLevel,
    message: string,
    traceId: string,
    context?: Record<string, any>,
    error?: Error
  ): void {
    if (this.shouldLog(level)) {
      this.logStructured({
        level,
        message,
        context,
        error,
        timestamp: new Date(),
        logger: this.context,
        traceId,
      });
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, any>): EnhancedLogger {
    const childLogger = new EnhancedLogger(this.context);
    childLogger.setLogLevel(this.logLevel);
    childLogger.setStructuredLogging(this.enableStructuredLogging);
    
    // Override log methods to include additional context
    const originalLogStructured = childLogger.logStructured.bind(childLogger);
    childLogger.logStructured = (entry: LogEntry) => {
      originalLogStructured({
        ...entry,
        context: { ...context, ...entry.context },
      });
    };

    return childLogger;
  }

  /**
   * Check if we should log at the given level
   */
  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  /**
   * Format message consistently
   */
  private formatMessage(message: any): string {
    if (typeof message === 'string') {
      return message;
    }
    
    if (message instanceof Error) {
      return message.message;
    }

    return JSON.stringify(message);
  }

  /**
   * Log with structured format
   */
  private logStructured(entry: LogEntry): void {
    if (this.enableStructuredLogging) {
      // Use structured logging format
      const structuredLog = {
        timestamp: entry.timestamp.toISOString(),
        level: LogLevel[entry.level],
        logger: entry.logger,
        message: entry.message,
        ...(entry.traceId && { traceId: entry.traceId }),
        ...(entry.functionId && { functionId: entry.functionId }),
        ...(entry.runId && { runId: entry.runId }),
        ...(entry.context && { context: entry.context }),
        ...(entry.error && {
          error: {
            name: entry.error.name,
            message: entry.error.message,
            stack: entry.error.stack,
            ...(entry.error instanceof InngestError && {
              code: entry.error.code,
              context: entry.error.context,
            }),
          },
        }),
        ...(entry.tags && { tags: entry.tags }),
      };

      // Output to console in JSON format for external log processors
      console.log(JSON.stringify(structuredLog));
    }

    // Also use NestJS logger for console output
    switch (entry.level) {
      case LogLevel.ERROR:
        this.nestLogger.error(entry.message, entry.error?.stack);
        break;
      case LogLevel.WARN:
        this.nestLogger.warn(entry.message);
        break;
      case LogLevel.LOG:
        this.nestLogger.log(entry.message);
        break;
      case LogLevel.DEBUG:
        this.nestLogger.debug(entry.message);
        break;
      case LogLevel.VERBOSE:
        this.nestLogger.verbose(entry.message);
        break;
    }
  }
}

/**
 * Logger factory for creating context-specific loggers
 */
@Injectable()
export class LoggerFactory {
  /**
   * Create a logger for a specific context
   */
  createLogger(context: string): EnhancedLogger {
    return new EnhancedLogger(context);
  }

  /**
   * Create a function-specific logger
   */
  createFunctionLogger(functionId: string, runId?: string): EnhancedLogger {
    const context = runId ? `${functionId}:${runId}` : functionId;
    const logger = new EnhancedLogger(context);
    
    return logger.child({
      functionId,
      ...(runId && { runId }),
      tags: ['function-logger'],
    });
  }

  /**
   * Create a service-specific logger
   */
  createServiceLogger(serviceName: string): EnhancedLogger {
    return new EnhancedLogger(serviceName);
  }
}