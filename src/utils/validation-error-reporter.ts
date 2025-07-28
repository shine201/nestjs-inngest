import {
  InngestEvent,
  EventRegistry,
  DefaultEventRegistry,
  EventValidationSchema,
} from "../interfaces/inngest-event.interface";
import { InngestEventError } from "../errors";

/**
 * Validation error details
 */
export interface ValidationErrorDetail {
  /**
   * Field path where the error occurred
   */
  path: string;

  /**
   * Error message
   */
  message: string;

  /**
   * Expected type or format
   */
  expected?: string;

  /**
   * Actual value that caused the error
   */
  actual?: any;

  /**
   * Error code for programmatic handling
   */
  code: string;
}

/**
 * Validation result with detailed error information
 */
export interface ValidationResult {
  /**
   * Whether validation passed
   */
  isValid: boolean;

  /**
   * List of validation errors
   */
  errors: ValidationErrorDetail[];

  /**
   * Summary message
   */
  summary?: string;
}

/**
 * Type checking and validation error reporter
 */
export class ValidationErrorReporter {
  private errors: ValidationErrorDetail[] = [];

  /**
   * Clear accumulated errors
   */
  clear(): void {
    this.errors = [];
  }

  /**
   * Add a validation error
   */
  addError(detail: ValidationErrorDetail): void {
    this.errors.push(detail);
  }

  /**
   * Add a type mismatch error
   */
  addTypeMismatchError(
    path: string,
    expected: string,
    actual: any,
    message?: string,
  ): void {
    this.addError({
      path,
      message: message || `Expected ${expected}, got ${typeof actual}`,
      expected,
      actual,
      code: "TYPE_MISMATCH",
    });
  }

  /**
   * Add a required field error
   */
  addRequiredFieldError(path: string, message?: string): void {
    this.addError({
      path,
      message: message || `Required field is missing`,
      expected: "non-null value",
      actual: undefined,
      code: "REQUIRED_FIELD",
    });
  }

  /**
   * Add a format validation error
   */
  addFormatError(
    path: string,
    format: string,
    actual: any,
    message?: string,
  ): void {
    this.addError({
      path,
      message: message || `Invalid format for ${format}`,
      expected: format,
      actual,
      code: "INVALID_FORMAT",
    });
  }

  /**
   * Add a range validation error
   */
  addRangeError(
    path: string,
    min: number | undefined,
    max: number | undefined,
    actual: any,
    message?: string,
  ): void {
    const range = `${min ?? ""}..${max ?? ""}`;
    this.addError({
      path,
      message: message || `Value ${actual} is outside allowed range ${range}`,
      expected: `value in range ${range}`,
      actual,
      code: "OUT_OF_RANGE",
    });
  }

  /**
   * Add a custom validation error
   */
  addCustomError(
    path: string,
    message: string,
    code: string = "CUSTOM_VALIDATION",
    expected?: string,
    actual?: any,
  ): void {
    this.addError({
      path,
      message,
      expected,
      actual,
      code,
    });
  }

  /**
   * Get validation result
   */
  getResult(): ValidationResult {
    return {
      isValid: this.errors.length === 0,
      errors: [...this.errors],
      summary: this.errors.length > 0 ? this.generateSummary() : undefined,
    };
  }

  /**
   * Generate a summary of validation errors
   */
  private generateSummary(): string {
    const errorCount = this.errors.length;
    const pathsWithErrors = [...new Set(this.errors.map((e) => e.path))];

    if (errorCount === 1) {
      return `1 validation error at ${this.errors[0].path}: ${this.errors[0].message}`;
    }

    return `${errorCount} validation errors across ${pathsWithErrors.length} fields: ${pathsWithErrors.join(", ")}`;
  }

  /**
   * Generate detailed error report
   */
  getDetailedReport(): string {
    if (this.errors.length === 0) {
      return "Validation passed";
    }

    const lines = ["Validation failed with the following errors:"];

    this.errors.forEach((error, index) => {
      lines.push(`${index + 1}. ${error.path}: ${error.message}`);
      if (error.expected) {
        lines.push(`   Expected: ${error.expected}`);
      }
      if (error.actual !== undefined) {
        lines.push(`   Actual: ${JSON.stringify(error.actual)}`);
      }
      lines.push(`   Code: ${error.code}`);
      lines.push("");
    });

    return lines.join("\n");
  }

  /**
   * Throw validation error if there are any errors
   */
  throwIfErrors(eventName?: string): void {
    if (this.errors.length > 0) {
      const message = this.generateSummary();
      throw new InngestEventError(message, eventName, undefined, {
        validationErrors: this.errors,
        detailedReport: this.getDetailedReport(),
      });
    }
  }
}

/**
 * Type checking utilities
 */
export class TypeChecker {
  private reporter: ValidationErrorReporter;

  constructor(reporter: ValidationErrorReporter) {
    this.reporter = reporter;
  }

  /**
   * Check if value is of expected type
   */
  checkType(
    path: string,
    value: any,
    expectedType: string,
    message?: string,
  ): boolean {
    const actualType = this.getActualType(value);
    if (actualType !== expectedType) {
      this.reporter.addTypeMismatchError(path, expectedType, value, message);
      return false;
    }
    return true;
  }

  /**
   * Check if required field exists
   */
  checkRequired(path: string, value: any, message?: string): boolean {
    if (value === null || value === undefined) {
      this.reporter.addRequiredFieldError(path, message);
      return false;
    }
    return true;
  }

  /**
   * Check string format
   */
  checkStringFormat(
    path: string,
    value: string,
    pattern: RegExp,
    formatName: string,
    message?: string,
  ): boolean {
    if (!pattern.test(value)) {
      this.reporter.addFormatError(path, formatName, value, message);
      return false;
    }
    return true;
  }

  /**
   * Check numeric range
   */
  checkRange(
    path: string,
    value: number,
    min?: number,
    max?: number,
    message?: string,
  ): boolean {
    if (
      (min !== undefined && value < min) ||
      (max !== undefined && value > max)
    ) {
      this.reporter.addRangeError(path, min, max, value, message);
      return false;
    }
    return true;
  }

  /**
   * Check if object has specific properties
   */
  checkObjectProperties(
    path: string,
    obj: any,
    requiredProps: string[],
    optionalProps: string[] = [],
  ): boolean {
    if (!this.checkType(path, obj, "object")) {
      return false;
    }

    let isValid = true;
    const allowedProps = [...requiredProps, ...optionalProps];

    // Check required properties
    for (const prop of requiredProps) {
      if (!this.checkRequired(`${path}.${prop}`, obj[prop])) {
        isValid = false;
      }
    }

    // Check for unexpected properties
    const actualProps = Object.keys(obj);
    for (const prop of actualProps) {
      if (!allowedProps.includes(prop)) {
        this.reporter.addCustomError(
          `${path}.${prop}`,
          `Unexpected property "${prop}"`,
          "UNEXPECTED_PROPERTY",
        );
        isValid = false;
      }
    }

    return isValid;
  }

  /**
   * Get the actual type of a value
   */
  private getActualType(value: any): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }
}

/**
 * Event-specific validation utilities
 */
export class EventValidator {
  /**
   * Validate core event structure
   */
  static validateEventStructure(
    event: any,
    reporter: ValidationErrorReporter,
  ): boolean {
    const checker = new TypeChecker(reporter);
    let isValid = true;

    // Check if event is an object
    if (
      !checker.checkType("event", event, "object", "Event must be an object")
    ) {
      return false;
    }

    // Check required fields
    if (!checker.checkRequired("event.name", event.name)) {
      isValid = false;
    } else if (!checker.checkType("event.name", event.name, "string")) {
      isValid = false;
    } else if (event.name.trim() === "") {
      reporter.addFormatError("event.name", "non-empty string", event.name);
      isValid = false;
    }

    // Check data field (required)
    if (!checker.checkRequired("event.data", event.data)) {
      isValid = false;
    }

    // Check optional fields
    if (event.user !== undefined) {
      if (checker.checkType("event.user", event.user, "object")) {
        if (!checker.checkRequired("event.user.id", event.user.id)) {
          isValid = false;
        } else if (
          !checker.checkType("event.user.id", event.user.id, "string")
        ) {
          isValid = false;
        } else if (
          typeof event.user.id === "string" &&
          event.user.id.trim() === ""
        ) {
          reporter.addFormatError(
            "event.user.id",
            "non-empty string",
            event.user.id,
            "user.id must be a non-empty string",
          );
          isValid = false;
        }

        if (
          event.user.email !== undefined &&
          !checker.checkType("event.user.email", event.user.email, "string")
        ) {
          isValid = false;
        }
      } else {
        isValid = false;
      }
    }

    if (event.ts !== undefined) {
      if (!checker.checkType("event.ts", event.ts, "number")) {
        isValid = false;
      } else if (!checker.checkRange("event.ts", event.ts, 0)) {
        isValid = false;
      }
    }

    if (
      event.id !== undefined &&
      !checker.checkType("event.id", event.id, "string")
    ) {
      isValid = false;
    }

    if (
      event.v !== undefined &&
      !checker.checkType("event.v", event.v, "string")
    ) {
      isValid = false;
    }

    return isValid;
  }

  /**
   * Validate event name format
   */
  static validateEventNameFormat(
    eventName: string,
    reporter: ValidationErrorReporter,
    strict: boolean = false,
  ): boolean {
    const checker = new TypeChecker(reporter);

    if (strict) {
      // Strict mode: kebab-case with dots
      const pattern = /^[a-z0-9]+(\.[a-z0-9]+)*$/;
      return checker.checkStringFormat(
        "event.name",
        eventName,
        pattern,
        "kebab-case with dots (e.g., 'user.created')",
        "Event name must be in kebab-case format with dot separators",
      );
    } else {
      // Basic validation: no whitespace or special characters except dots and hyphens
      const pattern = /^[a-zA-Z0-9._-]+$/;
      return checker.checkStringFormat(
        "event.name",
        eventName,
        pattern,
        "alphanumeric with dots, underscores, and hyphens",
        "Event name contains invalid characters",
      );
    }
  }

  /**
   * Validate event data serialization
   */
  static validateEventDataSerialization(
    data: any,
    reporter: ValidationErrorReporter,
    maxSizeBytes: number = 1024 * 1024,
  ): boolean {
    try {
      const serialized = JSON.stringify(data);
      const sizeBytes = new TextEncoder().encode(serialized).length;

      if (sizeBytes > maxSizeBytes) {
        reporter.addCustomError(
          "event.data",
          `Event data size (${sizeBytes} bytes) exceeds maximum allowed size (${maxSizeBytes} bytes)`,
          "DATA_TOO_LARGE",
          `max ${maxSizeBytes} bytes`,
          `${sizeBytes} bytes`,
        );
        return false;
      }

      return true;
    } catch (error) {
      reporter.addCustomError(
        "event.data",
        `Event data is not JSON serializable: ${error instanceof Error ? error.message : String(error)}`,
        "NOT_SERIALIZABLE",
      );
      return false;
    }
  }
}
