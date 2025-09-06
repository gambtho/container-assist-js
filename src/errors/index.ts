/**
 * Custom error types for the containerization assist application.
 * These replace the Result<T> monad pattern with standard TypeScript error handling.
 */

import { ErrorCode } from '../types/core.js';

/**
 * Base error class for all application errors
 */
export abstract class ApplicationError extends Error {
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown> | undefined;
  public override readonly cause?: Error | undefined;

  constructor(
    message: string,
    public readonly code: ErrorCode,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.context = context ?? {};
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): {
    name: string;
    message: string;
    code: string;
    timestamp: Date;
    context?: Record<string, unknown>;
    stack?: string;
  } {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp,
      ...(this.context !== undefined && { context: this.context }),
      ...(this.stack !== undefined && { stack: this.stack }),
    };
  }
}

/**
 * Error thrown when Docker operations fail
 */
export class DockerError extends ApplicationError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.DockerError,
    public readonly operation?: string | undefined,
    public override readonly cause?: Error | undefined,
    context?: Record<string, unknown> | undefined,
  ) {
    super(message, code, { ...context, operation });
    this.name = 'DockerError';
  }
}

/**
 * Error thrown when Kubernetes operations fail
 */
export class KubernetesError extends ApplicationError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.KubernetesError,
    public readonly resource?: string | undefined,
    public readonly namespace?: string | undefined,
    public override readonly cause?: Error | undefined,
    context?: Record<string, unknown> | undefined,
  ) {
    super(message, code, { ...context, resource, namespace });
    this.name = 'KubernetesError';
  }
}

/**
 * Error thrown when AI service operations fail
 */
export class AIServiceError extends ApplicationError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.AIServiceError,
    public readonly model?: string | undefined,
    public override readonly cause?: Error | undefined,
    context?: Record<string, unknown> | undefined,
  ) {
    super(message, code, { ...context, model });
    this.name = 'AIServiceError';
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends ApplicationError {
  constructor(
    message: string,
    public readonly fields?: string[],
    public readonly violations?: Array<{ field: string; message: string }>,
    context?: Record<string, unknown>,
  ) {
    super(message, ErrorCode.ValidationFailed, { ...context, fields, violations });
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends ApplicationError {
  constructor(
    message: string,
    public readonly configKey?: string,
    public readonly expectedType?: string,
    public readonly actualValue?: unknown,
    context?: Record<string, unknown>,
  ) {
    super(message, ErrorCode.ConfigurationError, {
      ...context,
      configKey,
      expectedType,
      actualValue,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * Error thrown when a workflow operation fails
 */
export class WorkflowError extends ApplicationError {
  constructor(
    message: string,
    public readonly workflowId?: string | undefined,
    public readonly step?: string | undefined,
    public override readonly cause?: Error | undefined,
    context?: Record<string, unknown> | undefined,
  ) {
    super(message, ErrorCode.WorkflowFailed, { ...context, workflowId, step });
    this.name = 'WorkflowError';
  }
}

/**
 * Error thrown when storage operations fail
 */
export class StorageError extends ApplicationError {
  constructor(
    message: string,
    public readonly key?: string | undefined,
    public readonly operation?: 'get' | 'set' | 'delete' | 'list' | undefined,
    public override readonly cause?: Error | undefined,
    context?: Record<string, unknown> | undefined,
  ) {
    super(message, ErrorCode.FileSystemError, { ...context, key, operation });
    this.name = 'StorageError';
  }
}

/**
 * Error thrown when a resource is not found
 */
export class NotFoundError extends ApplicationError {
  constructor(
    message: string,
    public readonly resourceType?: string,
    public readonly resourceId?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, ErrorCode.FileNotFound, { ...context, resourceType, resourceId });
    this.name = 'NotFoundError';
  }
}

/**
 * Error thrown when an operation times out
 */
export class TimeoutError extends ApplicationError {
  constructor(
    message: string,
    public readonly timeoutMs?: number,
    public readonly operation?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, ErrorCode.TimeoutError, { ...context, timeoutMs, operation });
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when rate limits are exceeded
 */
export class RateLimitError extends ApplicationError {
  constructor(
    message: string,
    public readonly limit?: number,
    public readonly resetAt?: Date,
    context?: Record<string, unknown>,
  ) {
    super(message, ErrorCode.InternalError, { ...context, limit, resetAt });
    this.name = 'RateLimitError';
  }
}

/**
 * Type guard to check if an error is an ApplicationError
 */
export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}

/**
 * Helper function to convert unknown errors to our error types
 */
export function normalizeError(
  error: unknown,
  defaultMessage = 'An unexpected error occurred',
): ApplicationError {
  if (isApplicationError(error)) {
    return error;
  }

  if (error instanceof Error) {
    // Check for specific error patterns
    const message = error.message.toLowerCase();

    if (message.includes('docker')) {
      return new DockerError(error.message, ErrorCode.DockerError, undefined, error);
    }

    if (message.includes('kubernetes') || message.includes('k8s')) {
      return new KubernetesError(
        error.message,
        ErrorCode.KubernetesError,
        undefined,
        undefined,
        error,
      );
    }

    if (message.includes('timeout')) {
      return new TimeoutError(error.message);
    }

    if (message.includes('not found') || message.includes('404')) {
      return new NotFoundError(error.message);
    }

    // Generic application error
    return new ValidationError(error.message, undefined, undefined, { originalError: error });
  }

  // For non-Error objects
  return new ValidationError(
    typeof error === 'string' ? error : defaultMessage,
    undefined,
    undefined,
    { originalError: error },
  );
}
