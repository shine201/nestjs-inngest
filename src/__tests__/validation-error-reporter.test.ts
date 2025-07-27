import {
  ValidationErrorReporter,
  ValidationResult,
  TypeChecker,
  EventValidator,
} from "../utils/validation-error-reporter";
import { InngestEventError } from "../errors";
import { InngestEvent } from "../interfaces/inngest-event.interface";

describe("ValidationErrorReporter", () => {
  let reporter: ValidationErrorReporter;

  beforeEach(() => {
    reporter = new ValidationErrorReporter();
  });

  describe("error collection", () => {
    it("should start with no errors", () => {
      const result = reporter.getResult();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should add type mismatch error", () => {
      reporter.addTypeMismatchError("user.name", "string", 123);
      
      const result = reporter.getResult();
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        path: "user.name",
        message: "Expected string, got number",
        expected: "string",
        actual: 123,
        code: "TYPE_MISMATCH",
      });
    });

    it("should add required field error", () => {
      reporter.addRequiredFieldError("user.id");
      
      const result = reporter.getResult();
      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe("REQUIRED_FIELD");
      expect(result.errors[0].path).toBe("user.id");
    });

    it("should add format error", () => {
      reporter.addFormatError("user.email", "email format", "invalid-email");
      
      const result = reporter.getResult();
      expect(result.errors[0].code).toBe("INVALID_FORMAT");
      expect(result.errors[0].expected).toBe("email format");
    });

    it("should add range error", () => {
      reporter.addRangeError("user.age", 0, 120, -5);
      
      const result = reporter.getResult();
      expect(result.errors[0].code).toBe("OUT_OF_RANGE");
      expect(result.errors[0].message).toContain("0..120");
    });

    it("should add custom error", () => {
      reporter.addCustomError("custom.field", "Custom validation failed", "CUSTOM");
      
      const result = reporter.getResult();
      expect(result.errors[0].code).toBe("CUSTOM");
      expect(result.errors[0].message).toBe("Custom validation failed");
    });
  });

  describe("result generation", () => {
    it("should generate single error summary", () => {
      reporter.addTypeMismatchError("field", "string", 123);
      
      const result = reporter.getResult();
      expect(result.summary).toContain("1 validation error at field");
    });

    it("should generate multiple errors summary", () => {
      reporter.addTypeMismatchError("field1", "string", 123);
      reporter.addRequiredFieldError("field2");
      
      const result = reporter.getResult();
      expect(result.summary).toContain("2 validation errors");
      expect(result.summary).toContain("field1, field2");
    });

    it("should generate detailed report", () => {
      reporter.addTypeMismatchError("field1", "string", 123);
      reporter.addRequiredFieldError("field2");
      
      const report = reporter.getDetailedReport();
      expect(report).toContain("Validation failed");
      expect(report).toContain("1. field1:");
      expect(report).toContain("2. field2:");
      expect(report).toContain("Expected: string");
      expect(report).toContain("Actual: 123");
    });
  });

  describe("error throwing", () => {
    it("should not throw when no errors", () => {
      expect(() => reporter.throwIfErrors()).not.toThrow();
    });

    it("should throw InngestEventError when errors exist", () => {
      reporter.addTypeMismatchError("field", "string", 123);
      
      expect(() => reporter.throwIfErrors("test.event")).toThrow(InngestEventError);
    });

    it("should include validation details in thrown error", () => {
      reporter.addTypeMismatchError("field", "string", 123);
      
      try {
        reporter.throwIfErrors("test.event");
        fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(InngestEventError);
        const inngestError = error as InngestEventError;
        expect(inngestError.context?.validationErrors).toHaveLength(1);
        expect(inngestError.context?.detailedReport).toContain("Validation failed");
      }
    });
  });

  describe("clear functionality", () => {
    it("should clear all errors", () => {
      reporter.addTypeMismatchError("field", "string", 123);
      expect(reporter.getResult().isValid).toBe(false);
      
      reporter.clear();
      expect(reporter.getResult().isValid).toBe(true);
      expect(reporter.getResult().errors).toHaveLength(0);
    });
  });
});

describe("TypeChecker", () => {
  let reporter: ValidationErrorReporter;
  let checker: TypeChecker;

  beforeEach(() => {
    reporter = new ValidationErrorReporter();
    checker = new TypeChecker(reporter);
  });

  describe("type checking", () => {
    it("should validate correct types", () => {
      expect(checker.checkType("field", "hello", "string")).toBe(true);
      expect(checker.checkType("field", 123, "number")).toBe(true);
      expect(checker.checkType("field", true, "boolean")).toBe(true);
      expect(checker.checkType("field", {}, "object")).toBe(true);
      expect(checker.checkType("field", [], "array")).toBe(true);
      expect(checker.checkType("field", null, "null")).toBe(true);
      
      expect(reporter.getResult().isValid).toBe(true);
    });

    it("should detect type mismatches", () => {
      expect(checker.checkType("field", 123, "string")).toBe(false);
      expect(checker.checkType("field", "hello", "number")).toBe(false);
      
      const errors = reporter.getResult().errors;
      expect(errors).toHaveLength(2);
      expect(errors[0].code).toBe("TYPE_MISMATCH");
    });
  });

  describe("required field checking", () => {
    it("should pass for non-null values", () => {
      expect(checker.checkRequired("field", "value")).toBe(true);
      expect(checker.checkRequired("field", 0)).toBe(true);
      expect(checker.checkRequired("field", false)).toBe(true);
      expect(checker.checkRequired("field", "")).toBe(true);
    });

    it("should fail for null/undefined", () => {
      expect(checker.checkRequired("field", null)).toBe(false);
      expect(checker.checkRequired("field", undefined)).toBe(false);
      
      const errors = reporter.getResult().errors;
      expect(errors).toHaveLength(2);
      expect(errors[0].code).toBe("REQUIRED_FIELD");
    });
  });

  describe("string format checking", () => {
    it("should validate correct formats", () => {
      const emailPattern = /^[^@]+@[^@]+\.[^@]+$/;
      expect(checker.checkStringFormat("email", "test@example.com", emailPattern, "email")).toBe(true);
    });

    it("should detect invalid formats", () => {
      const emailPattern = /^[^@]+@[^@]+\.[^@]+$/;
      expect(checker.checkStringFormat("email", "invalid-email", emailPattern, "email")).toBe(false);
      
      const errors = reporter.getResult().errors;
      expect(errors[0].code).toBe("INVALID_FORMAT");
    });
  });

  describe("range checking", () => {
    it("should validate values in range", () => {
      expect(checker.checkRange("age", 25, 0, 120)).toBe(true);
      expect(checker.checkRange("age", 0, 0, 120)).toBe(true);
      expect(checker.checkRange("age", 120, 0, 120)).toBe(true);
    });

    it("should detect out of range values", () => {
      expect(checker.checkRange("age", -1, 0, 120)).toBe(false);
      expect(checker.checkRange("age", 121, 0, 120)).toBe(false);
      
      const errors = reporter.getResult().errors;
      expect(errors).toHaveLength(2);
      expect(errors[0].code).toBe("OUT_OF_RANGE");
    });

    it("should handle partial ranges", () => {
      expect(checker.checkRange("min", 10, 5)).toBe(true);
      expect(checker.checkRange("max", 10, undefined, 15)).toBe(true);
      expect(checker.checkRange("min", 3, 5)).toBe(false);
      expect(checker.checkRange("max", 20, undefined, 15)).toBe(false);
    });
  });

  describe("object property checking", () => {
    it("should validate object with correct properties", () => {
      const obj = { required1: "value1", required2: "value2", optional1: "value3" };
      const result = checker.checkObjectProperties(
        "obj", 
        obj, 
        ["required1", "required2"], 
        ["optional1", "optional2"]
      );
      
      expect(result).toBe(true);
      expect(reporter.getResult().isValid).toBe(true);
    });

    it("should detect missing required properties", () => {
      const obj = { required1: "value1" }; // missing required2
      const result = checker.checkObjectProperties(
        "obj", 
        obj, 
        ["required1", "required2"]
      );
      
      expect(result).toBe(false);
      const errors = reporter.getResult().errors;
      expect(errors.some(e => e.path === "obj.required2" && e.code === "REQUIRED_FIELD")).toBe(true);
    });

    it("should detect unexpected properties", () => {
      const obj = { required1: "value1", unexpected: "value" };
      const result = checker.checkObjectProperties(
        "obj", 
        obj, 
        ["required1"]
      );
      
      expect(result).toBe(false);
      const errors = reporter.getResult().errors;
      expect(errors.some(e => e.path === "obj.unexpected" && e.code === "UNEXPECTED_PROPERTY")).toBe(true);
    });

    it("should handle non-object values", () => {
      const result = checker.checkObjectProperties("obj", "not-an-object", ["prop"]);
      expect(result).toBe(false);
      
      const errors = reporter.getResult().errors;
      expect(errors[0].code).toBe("TYPE_MISMATCH");
    });
  });
});

describe("EventValidator", () => {
  let reporter: ValidationErrorReporter;

  beforeEach(() => {
    reporter = new ValidationErrorReporter();
  });

  describe("event structure validation", () => {
    it("should validate correct event structure", () => {
      const event: InngestEvent = {
        name: "user.created",
        data: { userId: "123", email: "test@example.com" },
        user: { id: "user-123", email: "user@example.com" },
        ts: Date.now(),
        id: "event-123",
        v: "1.0",
      };

      const result = EventValidator.validateEventStructure(event, reporter);
      expect(result).toBe(true);
      expect(reporter.getResult().isValid).toBe(true);
    });

    it("should detect invalid event types", () => {
      const result = EventValidator.validateEventStructure("not-an-object", reporter);
      expect(result).toBe(false);
      
      const errors = reporter.getResult().errors;
      expect(errors[0].code).toBe("TYPE_MISMATCH");
      expect(errors[0].path).toBe("event");
    });

    it("should detect missing required fields", () => {
      const event = { data: {} }; // missing name
      const result = EventValidator.validateEventStructure(event, reporter);
      expect(result).toBe(false);
      
      const errors = reporter.getResult().errors;
      expect(errors.some(e => e.path === "event.name" && e.code === "REQUIRED_FIELD")).toBe(true);
    });

    it("should validate event name type and format", () => {
      const event = { name: "", data: {} }; // empty name
      const result = EventValidator.validateEventStructure(event, reporter);
      expect(result).toBe(false);
      
      const errors = reporter.getResult().errors;
      expect(errors.some(e => e.path === "event.name" && e.code === "INVALID_FORMAT")).toBe(true);
    });

    it("should detect missing data field", () => {
      const event = { name: "test.event" }; // missing data
      const result = EventValidator.validateEventStructure(event, reporter);
      expect(result).toBe(false);
      
      const errors = reporter.getResult().errors;
      expect(errors.some(e => e.path === "event.data" && e.code === "REQUIRED_FIELD")).toBe(true);
    });

    it("should validate optional user object", () => {
      const event = {
        name: "test.event",
        data: {},
        user: { email: "test@example.com" }, // missing required id
      };
      
      const result = EventValidator.validateEventStructure(event, reporter);
      expect(result).toBe(false);
      
      const errors = reporter.getResult().errors;
      expect(errors.some(e => e.path === "event.user.id" && e.code === "REQUIRED_FIELD")).toBe(true);
    });

    it("should validate optional timestamp", () => {
      const event = {
        name: "test.event",
        data: {},
        ts: -1, // invalid timestamp
      };
      
      const result = EventValidator.validateEventStructure(event, reporter);
      expect(result).toBe(false);
      
      const errors = reporter.getResult().errors;
      expect(errors.some(e => e.path === "event.ts" && e.code === "OUT_OF_RANGE")).toBe(true);
    });
  });

  describe("event name format validation", () => {
    it("should validate basic event names", () => {
      const validNames = ["user.created", "order.completed", "system.health"];
      
      validNames.forEach(name => {
        reporter.clear();
        const result = EventValidator.validateEventNameFormat(name, reporter, false);
        expect(result).toBe(true);
        expect(reporter.getResult().isValid).toBe(true);
      });
    });

    it("should validate strict event names", () => {
      const validNames = ["user.created", "order.completed", "system.health"];
      
      validNames.forEach(name => {
        reporter.clear();
        const result = EventValidator.validateEventNameFormat(name, reporter, true);
        expect(result).toBe(true);
        expect(reporter.getResult().isValid).toBe(true);
      });
    });

    it("should reject invalid basic event names", () => {
      const invalidNames = ["user created", "order@completed", "system/health"];
      
      invalidNames.forEach(name => {
        reporter.clear();
        const result = EventValidator.validateEventNameFormat(name, reporter, false);
        expect(result).toBe(false);
        expect(reporter.getResult().isValid).toBe(false);
      });
    });

    it("should reject invalid strict event names", () => {
      const invalidNames = ["User.Created", "order_completed", "SYSTEM.HEALTH"];
      
      invalidNames.forEach(name => {
        reporter.clear();
        const result = EventValidator.validateEventNameFormat(name, reporter, true);
        expect(result).toBe(false);
        expect(reporter.getResult().isValid).toBe(false);
      });
    });
  });

  describe("event data serialization validation", () => {
    it("should validate serializable data", () => {
      const validData = [
        { simple: "value" },
        { nested: { array: [1, 2, 3], boolean: true } },
        { numbers: 123, strings: "test", nulls: null },
      ];

      validData.forEach(data => {
        reporter.clear();
        const result = EventValidator.validateEventDataSerialization(data, reporter);
        expect(result).toBe(true);
        expect(reporter.getResult().isValid).toBe(true);
      });
    });

    it("should detect non-serializable data", () => {
      const circularObj: any = { name: "test" };
      circularObj.self = circularObj;

      const result = EventValidator.validateEventDataSerialization(circularObj, reporter);
      expect(result).toBe(false);
      
      const errors = reporter.getResult().errors;
      expect(errors[0].code).toBe("NOT_SERIALIZABLE");
    });

    it("should detect data size exceeding limit", () => {
      const largeData = { data: "x".repeat(1024 * 1024 + 1) }; // > 1MB
      
      const result = EventValidator.validateEventDataSerialization(largeData, reporter, 1024 * 1024);
      expect(result).toBe(false);
      
      const errors = reporter.getResult().errors;
      expect(errors[0].code).toBe("DATA_TOO_LARGE");
    });

    it("should allow data within size limit", () => {
      const smallData = { data: "x".repeat(1000) }; // small data
      
      const result = EventValidator.validateEventDataSerialization(smallData, reporter, 1024 * 1024);
      expect(result).toBe(true);
      expect(reporter.getResult().isValid).toBe(true);
    });
  });
});

describe("Integration tests", () => {
  it("should validate complete event with all validators", () => {
    const reporter = new ValidationErrorReporter();
    
    const validEvent: InngestEvent = {
      name: "user.created",
      data: {
        userId: "user-123",
        email: "test@example.com",
        profile: {
          name: "John Doe",
          age: 30,
        },
      },
      user: { id: "admin-123" },
      ts: Date.now(),
    };

    // Run all validations
    const structureValid = EventValidator.validateEventStructure(validEvent, reporter);
    const nameValid = EventValidator.validateEventNameFormat(validEvent.name, reporter, true);
    const dataValid = EventValidator.validateEventDataSerialization(validEvent.data, reporter);

    expect(structureValid).toBe(true);
    expect(nameValid).toBe(true);
    expect(dataValid).toBe(true);
    expect(reporter.getResult().isValid).toBe(true);
  });

  it("should collect multiple validation errors", () => {
    const reporter = new ValidationErrorReporter();
    
    const invalidEvent = {
      name: "", // invalid name
      data: undefined, // missing data
      user: { email: "test@example.com" }, // missing user.id
      ts: -1, // invalid timestamp
    };

    EventValidator.validateEventStructure(invalidEvent, reporter);
    
    const result = reporter.getResult();
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
    
    // Check that we have various error types
    const errorCodes = result.errors.map(e => e.code);
    expect(errorCodes).toContain("REQUIRED_FIELD");
    expect(errorCodes).toContain("INVALID_FORMAT");
    expect(errorCodes).toContain("OUT_OF_RANGE");
  });

  it("should generate comprehensive error report", () => {
    const reporter = new ValidationErrorReporter();
    
    const invalidEvent = {
      name: "Invalid Name",
      data: null,
      user: {},
    };

    EventValidator.validateEventStructure(invalidEvent, reporter);
    EventValidator.validateEventNameFormat(invalidEvent.name, reporter, true);
    
    const report = reporter.getDetailedReport();
    expect(report).toContain("Validation failed");
    expect(report).toContain("event.name");
    expect(report).toContain("event.data");
    expect(report).toContain("event.user.id");
  });
});