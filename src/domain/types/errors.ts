/**
 * Error Types
 * Centralized error definitions for the domain layer
 */

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Error codes for different error types
 */
export enum ErrorCode {
  // General errors
  UNKNOWN = 'UNKNOWN',
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  TIMEOUT = 'TIMEOUT',

  // Infrastructure errors
  DOCKER_CONNECTION = 'DOCKER_CONNECTION',
  KUBERNETES_CONNECTION = 'KUBERNETES_CONNECTION',
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  FILE_SYSTEM_ERROR = 'FILE_SYSTEM_ERROR',

  // Service errors
  SESSION_ERROR = 'SESSION_ERROR',
  WORKFLOW_ERROR = 'WORKFLOW_ERROR',
  TOOL_ERROR = 'TOOL_ERROR',

  // Validation errors
  SCHEMA_VALIDATION = 'SCHEMA_VALIDATION',
  INPUT_VALIDATION = 'INPUT_VALIDATION',

  // Tool-specific errors
  BUILD_ERROR = 'BUILD_ERROR',
  SCAN_ERROR = 'SCAN_ERROR',
  DEPLOYMENT_ERROR = 'DEPLOYMENT_ERROR'
}

/**
 * Base domain error interface
 */
export interface DomainError {
  code: ErrorCode;
  message: string;
  severity: ErrorSeverity;
  timestamp: string;
  context?: Record<string, unknown>;
  stack?: string;
}

/**
 * Infrastructure error
 */
export interface InfrastructureError extends DomainError {
  service: string;
  endpoint?: string;
  retryable: boolean;
}

/**
 * Service error
 */
export interface ServiceError extends DomainError {
  service: string;
  operation: string;
  sessionId?: string;
}

/**
 * Validation error
 */
export interface ValidationError extends DomainError {
  field?: string;
  value?: unknown;
  expectedType?: string;
}

/**
 * Tool error
 */
export interface ToolError extends DomainError {
  toolName: string;
  toolVersion?: string;
  input?: unknown;
}

/**
 * Workflow error
 */
export interface WorkflowError extends DomainError {
  workflowId: string;
  step: string;
  stepIndex: number;
}

/**
 * Check if an error is retryable
 */
export function isRetryable(error: DomainError): boolean {
  // Infrastructure errors with retryable flag
  if ('retryable' in error) {
    return (error as InfrastructureError).retryable;
  }

  // Timeout errors are typically retryable
  if (error.code === ErrorCode.TIMEOUT) {
    return true;
  }

  // Connection errors are typically retryable
  if (
    [
      ErrorCode.DOCKER_CONNECTION,
      ErrorCode.KUBERNETES_CONNECTION,
      ErrorCode.AI_SERVICE_ERROR
    ].includes(error.code)
  ) {
    return true;
  }

  return false;
}

/**
 * Get error severity from error code
 */
export function getErrorSeverity(code: ErrorCode): ErrorSeverity {
  switch (code) {
    case ErrorCode.UNKNOWN:
    case ErrorCode.TIMEOUT:
    case ErrorCode.FILE_SYSTEM_ERROR:
      return ErrorSeverity.HIGH;

    case ErrorCode.UNAUTHORIZED:
    case ErrorCode.DOCKER_CONNECTION:
    case ErrorCode.KUBERNETES_CONNECTION:
      return ErrorSeverity.CRITICAL;

    case ErrorCode.VALIDATION:
    case ErrorCode.SCHEMA_VALIDATION:
    case ErrorCode.INPUT_VALIDATION:
      return ErrorSeverity.MEDIUM;

    case ErrorCode.NOT_FOUND:
      return ErrorSeverity.LOW;

    default:
      return ErrorSeverity.MEDIUM;
  }
}

/**
 * Normalize different error types into DomainError
 */
export function normalizeError(error: unknown): DomainError {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return error as DomainError;
  }

  if (error instanceof Error) {
    return {
      code: ErrorCode.UNKNOWN,
      message: error.message,
      severity: ErrorSeverity.MEDIUM,
      timestamp: new Date().toISOString(),
      stack: error.stack
    };
  }

  if (typeof error === 'string') {
    return {
      code: ErrorCode.UNKNOWN,
      message: error,
      severity: ErrorSeverity.MEDIUM,
      timestamp: new Date().toISOString()
    };
  }

  return {
    code: ErrorCode.UNKNOWN,
    message: 'An unknown error occurred',
    severity: ErrorSeverity.MEDIUM,
    timestamp: new Date().toISOString(),
    context: { originalError: error }
  };
}

/**
 * Create a domain error
 */
export function createDomainError(
  code: ErrorCode,
  message: string,
  context?: Record<string, unknown>
): DomainError {
  return {
    code,
    message,
    severity: getErrorSeverity(code),
    timestamp: new Date().toISOString(),
    context
  };
}

/**
 * Create an infrastructure error
 */
export function createInfrastructureError(
  code: ErrorCode,
  message: string,
  service: string,
  retryable: boolean = true,
  endpoint?: string
): InfrastructureError {
  return {
    code,
    message,
    severity: getErrorSeverity(code),
    timestamp: new Date().toISOString(),
    service,
    endpoint,
    retryable
  };
}

/**
 * Create a validation error
 */
export function createValidationError(
  message: string,
  field?: string,
  value?: unknown,
  expectedType?: string
): ValidationError {
  return {
    code: ErrorCode.VALIDATION,
    message,
    severity: ErrorSeverity.MEDIUM,
    timestamp: new Date().toISOString(),
    field,
    value,
    expectedType
  };
}
