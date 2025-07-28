// Utility exports
export * from "./config-validation";
export * from "./connection-pool";
export * from "./development-mode";
export * from "./error-handler";
export * from "./event-types";
export * from "./memory-optimizer";
export * from "./metadata-processor";
export * from "./request-optimizer";

// Re-export validation-error-reporter with explicit naming to avoid conflicts
export {
  ValidationErrorReporter,
  ValidationErrorDetail,
  ValidationResult as ValidationErrorResult,
  TypeChecker,
  EventValidator,
} from "./validation-error-reporter";
