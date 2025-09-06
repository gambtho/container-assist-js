/**
 * Core types for the containerization assist system
 */

/**
 * Result type - simple discriminated union for error handling
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Create a success result
 */
export const Success = <T>(value: T): Result<T> => ({ ok: true, value });

/**
 * Create a failure result
 */
export const Failure = <T>(error: string): Result<T> => ({ ok: false, error });

/**
 * Type guard to check if result is successful
 */
export const isOk = <T>(result: Result<T>): result is { ok: true; value: T } => result.ok;

/**
 * Type guard to check if result is a failure
 */
export const isFail = <T>(result: Result<T>): result is { ok: false; error: string } => !result.ok;

/**
 * Error codes for structured error handling
 */
export enum ErrorCode {
  ValidationFailed = 'VALIDATION_FAILED',
  VALIDATION_ERROR = 'VALIDATION_ERROR', // Alias for compatibility
  SessionNotFound = 'SESSION_NOT_FOUND',
  SessionExpired = 'SESSION_EXPIRED',
  WorkflowFailed = 'WORKFLOW_FAILED',
  WorkflowStepFailed = 'WORKFLOW_STEP_FAILED',
  InvalidState = 'INVALID_STATE',

  DockerError = 'DOCKER_ERROR',
  DockerNotAvailable = 'DOCKER_NOT_AVAILABLE',
  DOCKER_CONNECTION_FAILED = 'DOCKER_CONNECTION_FAILED',
  DockerBuildFailed = 'DOCKER_BUILD_FAILED',
  DockerPushFailed = 'DOCKER_PUSH_FAILED',
  SCANNER_NOT_AVAILABLE = 'SCANNER_NOT_AVAILABLE',

  KubernetesError = 'KUBERNETES_ERROR',
  K8sConnectionFailed = 'K8S_CONNECTION_FAILED',
  K8sDeploymentFailed = 'K8S_DEPLOYMENT_FAILED',
  K8sManifestInvalid = 'K8S_MANIFEST_INVALID',

  AIServiceError = 'AI_SERVICE_ERROR',
  AI_SERVICE_UNAVAILABLE = 'AI_SERVICE_UNAVAILABLE',
  AI_QUOTA_EXCEEDED = 'AI_QUOTA_EXCEEDED',

  FileSystemError = 'FILE_SYSTEM_ERROR',
  FileNotFound = 'FILE_NOT_FOUND',
  FileWriteFailed = 'FILE_WRITE_FAILED',
  DirectoryNotFound = 'DIRECTORY_NOT_FOUND',

  NetworkError = 'NETWORK_ERROR',
  TimeoutError = 'TIMEOUT_ERROR',
  ConfigurationError = 'CONFIGURATION_ERROR',
  InternalError = 'INTERNAL_ERROR',
}

/**
 * Base error class for domain errors
 */
export class DomainError extends Error {
  public code: ErrorCode;
  public override cause?: Error;

  constructor(code: ErrorCode, message: string, cause?: Error) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Infrastructure-level errors
 */

/**
 * Service-level errors
 */

/**
 * Tool error interface for structured error handling
 */
export interface ToolError {
  code: ErrorCode;
  message: string;
  tool?: string;
  timestamp?: string;
  context?: Record<string, unknown>;
}

// ===== INTERFACE TYPES =====

export interface ProgressUpdate {
  sessionId: string;
  step: string;
  status: 'starting' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface ProgressEmitter {
  emit(update: ProgressUpdate): void;
}

export interface EventPublisher {
  publish(event: string, data: unknown): void;
}
