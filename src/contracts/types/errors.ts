/**
 * Error types and taxonomy for the Container Kit MCP Server
 * Provides structured error handling with categorization
 */

export enum ErrorCode {
  // Domain errors
  ValidationFailed = 'VALIDATION_FAILED',
  VALIDATION_ERROR = 'VALIDATION_ERROR', // Alias for compatibility
  SessionNotFound = 'SESSION_NOT_FOUND',
  SessionExpired = 'SESSION_EXPIRED',
  WorkflowFailed = 'WORKFLOW_FAILED',
  WorkflowStepFailed = 'WORKFLOW_STEP_FAILED',
  InvalidState = 'INVALID_STATE',

  // Infrastructure errors
  DockerError = 'DOCKER_ERROR',
  DockerNotAvailable = 'DOCKER_NOT_AVAILABLE',
  DOCKER_CONNECTION_FAILED = 'DOCKER_CONNECTION_FAILED',
  DockerBuildFailed = 'DOCKER_BUILD_FAILED',
  DockerPushFailed = 'DOCKER_PUSH_FAILED',
  SCANNER_NOT_AVAILABLE = 'SCANNER_NOT_AVAILABLE',
  KubernetesError = 'KUBERNETES_ERROR',
  KubernetesNotAvailable = 'KUBERNETES_NOT_AVAILABLE',
  KubernetesNotConfigured = 'KUBERNETES_NOT_CONFIGURED',
  KubernetesDeploymentFailed = 'KUBERNETES_DEPLOYMENT_FAILED',
  AIGenerationError = 'AI_GENERATION_ERROR',
  AINotAvailable = 'AI_NOT_AVAILABLE',
  StorageError = 'STORAGE_ERROR',

  // Service errors
  ToolNotFound = 'TOOL_NOT_FOUND',
  ToolExecutionFailed = 'TOOL_EXECUTION_FAILED',
  ToolTimeout = 'TOOL_TIMEOUT',
  DependencyNotInitialized = 'DEPENDENCY_NOT_INITIALIZED',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',

  // Input/Output errors
  InvalidInput = 'INVALID_INPUT',
  InvalidOutput = 'INVALID_OUTPUT',
  ParseError = 'PARSE_ERROR',
  SerializationError = 'SERIALIZATION_ERROR',

  // System errors
  UnknownError = 'UNKNOWN_ERROR',
  InternalError = 'INTERNAL_ERROR',
  ConfigurationError = 'CONFIGURATION_ERROR',
  PermissionDenied = 'PERMISSION_DENIED',
  ResourceNotFound = 'RESOURCE_NOT_FOUND',
  ResourceExhausted = 'RESOURCE_EXHAUSTED',
  ResourceLimitExceeded = 'RESOURCE_LIMIT_EXCEEDED',

  // Additional error codes used by handlers
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  OPERATION_FAILED = 'OPERATION_FAILED',
  TIMEOUT = 'TIMEOUT',

  // Specific Docker error codes
  DOCKER_UNKNOWN = 'DOCKER_UNKNOWN',
  DOCKER_INIT_FAILED = 'DOCKER_INIT_FAILED',
  DOCKER_TAG_FAILED = 'DOCKER_TAG_FAILED',
  DOCKER_LIST_FAILED = 'DOCKER_LIST_FAILED',
  DOCKER_REMOVE_FAILED = 'DOCKER_REMOVE_FAILED',
  DOCKER_INSPECT_FAILED = 'DOCKER_INSPECT_FAILED',
  DOCKER_LIST_CONTAINERS_FAILED = 'DOCKER_LIST_CONTAINERS_FAILED',
  DOCKER_HEALTH_CHECK_FAILED = 'DOCKER_HEALTH_CHECK_FAILED',

  // Specific Kubernetes error codes
  K8S_UNKNOWN = 'K8S_UNKNOWN',
  K8S_NOT_AVAILABLE = 'K8S_NOT_AVAILABLE',
  K8S_DEPLOY_FAILED = 'K8S_DEPLOY_FAILED',
  K8S_API_NOT_INITIALIZED = 'K8S_API_NOT_INITIALIZED',
  K8S_APPLY_FAILED = 'K8S_APPLY_FAILED',
  K8S_SERVICE_STATUS_FAILED = 'K8S_SERVICE_STATUS_FAILED',
  K8S_DELETE_FAILED = 'K8S_DELETE_FAILED',
  K8S_LIST_NAMESPACES_FAILED = 'K8S_LIST_NAMESPACES_FAILED',
  K8S_CREATE_NAMESPACE_FAILED = 'K8S_CREATE_NAMESPACE_FAILED',

  // Specific AI error codes
  AI_GENERATION_FAILED = 'AI_GENERATION_FAILED',
  AI_TEXT_GENERATION_FAILED = 'AI_TEXT_GENERATION_FAILED',
  ENHANCED_AI_GENERATION_FAILED = 'ENHANCED_AI_GENERATION_FAILED',
  AI_SAMPLER_UNAVAILABLE = 'AI_SAMPLER_UNAVAILABLE',
  ENHANCED_AI_STRUCTURED_GENERATION_FAILED = 'ENHANCED_AI_STRUCTURED_GENERATION_FAILED',
}

/**
 * Base error class for domain-specific errors
 */
export class DomainError extends Error {
  public readonly code: ErrorCode;
  public override readonly cause?: Error;
  public readonly metadata?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, cause?: Error, metadata?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    if (cause) {
      this.cause = cause;
    }
    if (metadata) {
      this.metadata = metadata;
    }

    // Maintain proper stack trace for where our error was thrown
    if (Error.captureStackTrace !== undefined) {
      Error.captureStackTrace(this, DomainError);
    }
  }

  toJSON(): {
    name: string;
    code: ErrorCode;
    message: string;
    metadata?: Record<string, unknown>;
    stack?: string;
    cause?: {
      name: string;
      message: string;
      stack?: string;
    };
    } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.metadata !== undefined && { metadata: this.metadata }),
      ...(this.stack !== undefined && { stack: this.stack }),
      ...(this.cause !== undefined && {
        cause: {
          name: this.cause.name,
          message: this.cause.message,
          ...(this.cause.stack !== undefined && { stack: this.cause.stack }),
        },
      }),
    };
  }
}

/**
 * Infrastructure layer errors
 */
export class InfrastructureError extends Error {
  public readonly code: ErrorCode;
  public override readonly cause?: Error;
  public readonly metadata?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, cause?: Error, metadata?: Record<string, unknown>) {
    super(message);
    this.name = 'InfrastructureError';
    this.code = code;
    if (cause) {
      this.cause = cause;
    }
    if (metadata) {
      this.metadata = metadata;
    }

    if (Error.captureStackTrace !== undefined) {
      Error.captureStackTrace(this, InfrastructureError);
    }
  }

  toJSON(): {
    name: string;
    code: ErrorCode;
    message: string;
    metadata?: Record<string, unknown>;
    stack?: string;
    cause?: {
      name: string;
      message: string;
      stack?: string;
    };
    } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.metadata !== undefined && { metadata: this.metadata }),
      ...(this.stack !== undefined && { stack: this.stack }),
      ...(this.cause !== undefined && {
        cause: {
          name: this.cause.name,
          message: this.cause.message,
          ...(this.cause.stack !== undefined && { stack: this.cause.stack }),
        },
      }),
    };
  }
}

/**
 * Service layer errors
 */
export class ServiceError extends Error {
  public readonly code: ErrorCode;
  public override readonly cause?: Error;
  public readonly metadata?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, cause?: Error, metadata?: Record<string, unknown>) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    if (cause) {
      this.cause = cause;
    }
    if (metadata) {
      this.metadata = metadata;
    }

    if (Error.captureStackTrace !== undefined) {
      Error.captureStackTrace(this, ServiceError);
    }
  }

  toJSON(): {
    name: string;
    code: ErrorCode;
    message: string;
    metadata?: Record<string, unknown>;
    stack?: string;
    cause?: {
      name: string;
      message: string;
      stack?: string;
    };
    } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.metadata !== undefined && { metadata: this.metadata }),
      ...(this.stack !== undefined && { stack: this.stack }),
      ...(this.cause !== undefined && {
        cause: {
          name: this.cause.name,
          message: this.cause.message,
          ...(this.cause.stack !== undefined && { stack: this.cause.stack }),
        },
      }),
    };
  }
}

/**
 * Validation error with field-specific details
 */
export class ValidationError extends DomainError {
  constructor(
    message: string,
    public readonly fields?: Record<string, string[]>,
    cause?: Error,
  ) {
    super(ErrorCode.ValidationFailed, message, cause, { fields });
    this.name = 'ValidationError';
  }
}

/**
 * Tool execution error with context
 */
export class ToolError extends ServiceError {
  constructor(
    public readonly toolName: string,
    message: string,
    code: ErrorCode = ErrorCode.ToolExecutionFailed,
    cause?: Error,
    metadata?: Record<string, unknown>,
  ) {
    super(code, message, cause, { ...metadata, toolName });
    this.name = 'ToolError';
  }
}

/**
 * Workflow error with step context
 */
export class WorkflowError extends DomainError {
  constructor(
    public readonly workflowId: string,
    public readonly step: string,
    message: string,
    cause?: Error,
    metadata?: Record<string, unknown>,
  ) {
    super(ErrorCode.WorkflowStepFailed, message, cause, { ...metadata, workflowId, step });
    this.name = 'WorkflowError';
  }
}

/**
 * Helper function to determine if an error is retryable
 */
export function isRetryable(error: Error): boolean {
  if (error instanceof InfrastructureError) {
    return [
      ErrorCode.DockerError,
      ErrorCode.KubernetesError,
      ErrorCode.ServiceUnavailable,
      ErrorCode.ResourceExhausted,
    ].includes(error.code);
  }

  if (error instanceof ServiceError) {
    return error.code === ErrorCode.ToolTimeout;
  }

  return false;
}

/**
 * Helper function to get error severity
 */
export function getErrorSeverity(error: Error): 'low' | 'medium' | 'high' | 'critical' {
  if (error instanceof DomainError) {
    switch (error.code) {
      case ErrorCode.ValidationFailed:
      case ErrorCode.InvalidInput:
        return 'low';
      case ErrorCode.SessionNotFound:
      case ErrorCode.SessionExpired:
        return 'medium';
      case ErrorCode.WorkflowFailed:
      case ErrorCode.InvalidState:
        return 'high';
      default:
        return 'medium';
    }
  }

  if (error instanceof InfrastructureError) {
    switch (error.code) {
      case ErrorCode.AINotAvailable:
        return 'low';
      case ErrorCode.DockerError:
      case ErrorCode.KubernetesError:
        return 'high';
      case ErrorCode.StorageError:
        return 'critical';
      default:
        return 'medium';
    }
  }

  if (error instanceof ServiceError) {
    switch (error.code) {
      case ErrorCode.ToolTimeout:
        return 'medium';
      case ErrorCode.DependencyNotInitialized:
      case ErrorCode.ServiceUnavailable:
        return 'critical';
      default:
        return 'medium';
    }
  }

  return 'high';
}

/**
 * Convert any error to our structured error format
 */
export function normalizeError(error: unknown): DomainError | InfrastructureError | ServiceError {
  if (
    error instanceof DomainError ||
    error instanceof InfrastructureError ||
    error instanceof ServiceError
  ) {
    return error;
  }

  if (error instanceof Error) {
    // Try to categorize based on error message or name
    const message = error.message.toLowerCase();

    if (message.includes('docker')) {
      return new InfrastructureError(ErrorCode.DockerError, error.message, error);
    }

    if (message.includes('kubernetes') || message.includes('k8s')) {
      return new InfrastructureError(ErrorCode.KubernetesError, error.message, error);
    }

    if (message.includes('validation') || message.includes('invalid')) {
      return new DomainError(ErrorCode.ValidationFailed, error.message, error);
    }

    if (message.includes('not found')) {
      return new ServiceError(ErrorCode.ResourceNotFound, error.message, error);
    }

    if (message.includes('permission') || message.includes('denied')) {
      return new ServiceError(ErrorCode.PermissionDenied, error.message, error);
    }

    // Default to InternalError
    return new ServiceError(ErrorCode.InternalError, error.message, error);
  }

  // Handle non-Error objects
  return new ServiceError(ErrorCode.UnknownError, String(error), undefined, {
    originalError: error,
  });
}
