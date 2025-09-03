/**
 * MCP Error Mapper - Unified Error Mapping to MCP SDK Error Codes
 * Consolidates domain errors and application errors into proper MCP SDK responses
 */

/**
 * MCP Error structure for protocol compliance
 */
export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

// Create MCP-compatible error objects
const createMcpError = (code: number, message: string, data?: unknown): MCPError => {
  return { code, message, data };
};

// Define MCP error codes as constants to avoid 'any' type issues from SDK
const MCPErrorCode = {
  InvalidParams: -32602,
  InternalError: -32603,
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601
} as const;

type MCPErrorCodeType = (typeof MCPErrorCode)[keyof typeof MCPErrorCode];
import {
  ErrorCode as DomainErrorCode,
  DomainError,
  InfrastructureError,
  ServiceError
} from '../../contracts/types/errors.js';
import { ApplicationError } from '../../errors/index.js';

/**
 * Mapping from domain error codes to MCP SDK error codes
 */
export const ERROR_CODE_MAPPING: Record<DomainErrorCode, MCPErrorCodeType> = {
  // Domain validation errors
  [DomainErrorCode.ValidationFailed]: MCPErrorCode.InvalidParams,
  [DomainErrorCode.VALIDATION_ERROR]: MCPErrorCode.InvalidParams,
  [DomainErrorCode.InvalidInput]: MCPErrorCode.InvalidParams,
  [DomainErrorCode.InvalidOutput]: MCPErrorCode.InternalError,
  [DomainErrorCode.ParseError]: MCPErrorCode.ParseError,
  [DomainErrorCode.SerializationError]: MCPErrorCode.InternalError,

  // Session management errors
  [DomainErrorCode.SessionNotFound]: MCPErrorCode.InvalidRequest,
  [DomainErrorCode.SessionExpired]: MCPErrorCode.InvalidRequest,
  [DomainErrorCode.InvalidState]: MCPErrorCode.InvalidRequest,

  // Workflow errors
  [DomainErrorCode.WorkflowFailed]: MCPErrorCode.InternalError,
  [DomainErrorCode.WorkflowStepFailed]: MCPErrorCode.InternalError,

  // Infrastructure errors - Docker
  [DomainErrorCode.DockerError]: MCPErrorCode.InternalError,
  [DomainErrorCode.DockerNotAvailable]: MCPErrorCode.InternalError,
  [DomainErrorCode.DOCKER_CONNECTION_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.DockerBuildFailed]: MCPErrorCode.InternalError,
  [DomainErrorCode.DockerPushFailed]: MCPErrorCode.InternalError,
  [DomainErrorCode.SCANNER_NOT_AVAILABLE]: MCPErrorCode.InternalError,

  // Infrastructure errors - Kubernetes
  [DomainErrorCode.KubernetesError]: MCPErrorCode.InternalError,
  [DomainErrorCode.KubernetesNotAvailable]: MCPErrorCode.InternalError,
  [DomainErrorCode.KubernetesNotConfigured]: MCPErrorCode.InternalError,
  [DomainErrorCode.KubernetesDeploymentFailed]: MCPErrorCode.InternalError,

  // Infrastructure errors - AI
  [DomainErrorCode.AIGenerationError]: MCPErrorCode.InternalError,
  [DomainErrorCode.AINotAvailable]: MCPErrorCode.InternalError,

  // Storage errors
  [DomainErrorCode.StorageError]: MCPErrorCode.InternalError,

  // Service errors
  [DomainErrorCode.ToolNotFound]: MCPErrorCode.MethodNotFound,
  [DomainErrorCode.ToolExecutionFailed]: MCPErrorCode.InternalError,
  [DomainErrorCode.ToolTimeout]: MCPErrorCode.InternalError,
  [DomainErrorCode.DependencyNotInitialized]: MCPErrorCode.InternalError,
  [DomainErrorCode.ServiceUnavailable]: MCPErrorCode.InternalError,

  // System errors
  [DomainErrorCode.UnknownError]: MCPErrorCode.InternalError,
  [DomainErrorCode.InternalError]: MCPErrorCode.InternalError,
  [DomainErrorCode.ConfigurationError]: MCPErrorCode.InvalidRequest,
  [DomainErrorCode.PermissionDenied]: MCPErrorCode.InvalidRequest,
  [DomainErrorCode.ResourceNotFound]: MCPErrorCode.InvalidRequest,
  [DomainErrorCode.ResourceExhausted]: MCPErrorCode.InternalError,
  [DomainErrorCode.ResourceLimitExceeded]: MCPErrorCode.InternalError,

  // Additional error codes
  [DomainErrorCode.AUTHENTICATION_ERROR]: MCPErrorCode.InvalidRequest,
  [DomainErrorCode.OPERATION_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.TIMEOUT]: MCPErrorCode.InternalError
};

/**
 * Convert domain error to MCP Error
 */
export function toMcpError(error: DomainError): MCPError {
  const mcpCode = ERROR_CODE_MAPPING[error.code] || MCPErrorCode.InternalError;

  return createMcpError(mcpCode, error.message, {
    code: error.code,
    metadata: error.metadata,
    timestamp: new Date().toISOString(),
    cause: error.cause
      ? {
          name: error.cause.name,
          message: error.cause.message
        }
      : undefined
  });
}

/**
 * Convert infrastructure error to MCP Error
 */
export function infrastructureErrorToMcp(error: InfrastructureError): MCPError {
  const mcpCode = ERROR_CODE_MAPPING[error.code] || MCPErrorCode.InternalError;

  return createMcpError(mcpCode, error.message, {
    code: error.code,
    layer: 'infrastructure',
    metadata: error.metadata,
    timestamp: new Date().toISOString(),
    cause: error.cause
      ? {
          name: error.cause.name,
          message: error.cause.message
        }
      : undefined
  });
}

/**
 * Convert service error to MCP Error
 */
export function serviceErrorToMcp(error: ServiceError): MCPError {
  const mcpCode = ERROR_CODE_MAPPING[error.code] || MCPErrorCode.InternalError;

  return createMcpError(mcpCode, error.message, {
    code: error.code,
    layer: 'service',
    metadata: error.metadata,
    timestamp: new Date().toISOString(),
    cause: error.cause
      ? {
          name: error.cause.name,
          message: error.cause.message
        }
      : undefined
  });
}

/**
 * Convert application error to MCP Error (from legacy error system)
 */
export function applicationErrorToMcp(error: ApplicationError): MCPError {
  // Map application error codes to domain error codes where possible
  const domainCode = mapApplicationCodeToDomain(error.code);
  const mcpCode = domainCode != null ? ERROR_CODE_MAPPING[domainCode] : MCPErrorCode.InternalError;

  return createMcpError(mcpCode, error.message, {
    code: error.code,
    layer: 'application',
    context: error.context,
    timestamp: error.timestamp.toISOString()
  });
}

/**
 * Map legacy application error codes to domain error codes
 */
function mapApplicationCodeToDomain(appCode: string): DomainErrorCode | null {
  const mapping: Record<string, DomainErrorCode> = {
    DOCKER_ERROR: DomainErrorCode.DockerError,
    DOCKER_UNKNOWN: DomainErrorCode.DockerError,
    K8S_ERROR: DomainErrorCode.KubernetesError,
    K8S_UNKNOWN: DomainErrorCode.KubernetesError,
    AI_ERROR: DomainErrorCode.AIGenerationError,
    VALIDATION_ERROR: DomainErrorCode.ValidationFailed,
    CONFIG_ERROR: DomainErrorCode.ConfigurationError,
    WORKFLOW_ERROR: DomainErrorCode.WorkflowFailed,
    STORAGE_ERROR: DomainErrorCode.StorageError,
    NOT_FOUND: DomainErrorCode.ResourceNotFound,
    TIMEOUT: DomainErrorCode.ToolTimeout,
    RATE_LIMIT: DomainErrorCode.ResourceExhausted,
    UNKNOWN_ERROR: DomainErrorCode.UnknownError
  };

  return mapping[appCode] ?? null;
}

/**
 * Universal error converter - handles any error type and converts to McpError
 */
export function convertToMcpError(error: unknown): MCPError {
  // Handle already converted MCP errors
  if (typeof error === 'object' && error != null && 'code' in error && 'message' in error) {
    return error as MCPError;
  }

  // Handle our typed errors
  if (error instanceof DomainError) {
    return toMcpError(error);
  }

  if (error instanceof InfrastructureError) {
    return infrastructureErrorToMcp(error);
  }

  if (error instanceof ServiceError) {
    return serviceErrorToMcp(error);
  }

  if (error instanceof ApplicationError) {
    return applicationErrorToMcp(error);
  }

  // Handle generic Error objects
  if (error instanceof Error) {
    // Try to categorize based on message content
    const message = error.message.toLowerCase();
    let code: MCPErrorCodeType = MCPErrorCode.InternalError;
    let domainCode = DomainErrorCode.UnknownError;

    if (message.includes('validation') || message.includes('invalid')) {
      code = MCPErrorCode.InvalidParams;
      domainCode = DomainErrorCode.ValidationFailed;
    } else if (message.includes('not found') || message.includes('404')) {
      code = MCPErrorCode.InvalidRequest;
      domainCode = DomainErrorCode.ResourceNotFound;
    } else if (message.includes('timeout')) {
      code = MCPErrorCode.InternalError;
      domainCode = DomainErrorCode.ToolTimeout;
    } else if (message.includes('docker')) {
      code = MCPErrorCode.InternalError;
      domainCode = DomainErrorCode.DockerError;
    } else if (message.includes('kubernetes') || message.includes('k8s')) {
      code = MCPErrorCode.InternalError;
      domainCode = DomainErrorCode.KubernetesError;
    }

    return createMcpError(code, error.message, {
      code: domainCode,
      originalError: error.name,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }

  // Handle non-Error objects
  return createMcpError(
    MCPErrorCode.InternalError,
    typeof error === 'string' ? error : 'Unknown error occurred',
    {
      code: DomainErrorCode.UnknownError,
      originalError: error,
      timestamp: new Date().toISOString()
    }
  );
}

/**
 * Check if an error is retryable based on its type and code
 */
export function isRetryableError(error: MCPError): boolean {
  const details = (error as { data?: { code?: DomainErrorCode } }).data;
  const code = details?.code;

  if (code == null) return false;

  // Retryable error codes
  const retryableCodes = [
    DomainErrorCode.DockerError,
    DomainErrorCode.KubernetesError,
    DomainErrorCode.ServiceUnavailable,
    DomainErrorCode.ResourceExhausted,
    DomainErrorCode.ToolTimeout,
    DomainErrorCode.StorageError
  ];

  return retryableCodes.includes(code);
}

/**
 * Get error severity level
 */
export function getErrorSeverity(error: MCPError): 'low' | 'medium' | 'high' | 'critical' {
  const details = (error as { data?: { code?: DomainErrorCode } }).data;
  const code = details?.code;

  if (code == null) return 'high';

  switch (code) {
    case DomainErrorCode.ValidationFailed:
    case DomainErrorCode.InvalidInput:
    case DomainErrorCode.AINotAvailable:
      return 'low';

    case DomainErrorCode.SessionNotFound:
    case DomainErrorCode.SessionExpired:
    case DomainErrorCode.ToolTimeout:
    case DomainErrorCode.ResourceNotFound:
      return 'medium';

    case DomainErrorCode.WorkflowFailed:
    case DomainErrorCode.InvalidState:
    case DomainErrorCode.DockerError:
    case DomainErrorCode.KubernetesError:
    case DomainErrorCode.UnknownError:
      return 'high';

    case DomainErrorCode.StorageError:
    case DomainErrorCode.DependencyNotInitialized:
    case DomainErrorCode.ServiceUnavailable:
      return 'critical';

    default:
      return 'medium';
  }
}
