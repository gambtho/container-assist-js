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
  MethodNotFound: -32601,
} as const;

type MCPErrorCodeType = (typeof MCPErrorCode)[keyof typeof MCPErrorCode];
import {
  ErrorCode as DomainErrorCode,
  DomainError,
  InfrastructureError,
  ServiceError,
} from '../../contracts/types/errors.js';
import { ApplicationError } from '../../errors/index.js';
import { ToolNotImplementedError, ToolValidationError, ToolExecutionError } from './tool-errors.js';

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
  [DomainErrorCode.TIMEOUT]: MCPErrorCode.InternalError,

  // Specific Docker error codes
  [DomainErrorCode.DOCKER_UNKNOWN]: MCPErrorCode.InternalError,
  [DomainErrorCode.DOCKER_INIT_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.DOCKER_TAG_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.DOCKER_LIST_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.DOCKER_REMOVE_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.DOCKER_INSPECT_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.DOCKER_LIST_CONTAINERS_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.DOCKER_HEALTH_CHECK_FAILED]: MCPErrorCode.InternalError,

  // Specific Kubernetes error codes
  [DomainErrorCode.K8S_UNKNOWN]: MCPErrorCode.InternalError,
  [DomainErrorCode.K8S_NOT_AVAILABLE]: MCPErrorCode.InternalError,
  [DomainErrorCode.K8S_DEPLOY_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.K8S_API_NOT_INITIALIZED]: MCPErrorCode.InternalError,
  [DomainErrorCode.K8S_APPLY_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.K8S_SERVICE_STATUS_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.K8S_DELETE_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.K8S_LIST_NAMESPACES_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.K8S_CREATE_NAMESPACE_FAILED]: MCPErrorCode.InternalError,

  // Specific AI error codes
  [DomainErrorCode.AI_GENERATION_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.AI_TEXT_GENERATION_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.ENHANCED_AI_GENERATION_FAILED]: MCPErrorCode.InternalError,
  [DomainErrorCode.AI_SAMPLER_UNAVAILABLE]: MCPErrorCode.InternalError,
  [DomainErrorCode.ENHANCED_AI_STRUCTURED_GENERATION_FAILED]: MCPErrorCode.InternalError,
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
          message: error.cause.message,
        }
      : undefined,
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
          message: error.cause.message,
        }
      : undefined,
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
          message: error.cause.message,
        }
      : undefined,
  });
}

/**
 * Universal error converter - handles any error type and converts to McpError
 */
export function convertToMcpError(error: unknown): MCPError {
  // Handle already converted MCP errors (check for numeric code to distinguish from DomainError)
  if (typeof error === 'object' && error != null && 'code' in error && 'message' in error) {
    const errorObj = error as { code: unknown; message: string };
    if (typeof errorObj.code === 'number') {
      return error as MCPError;
    }
  }

  // Handle tool-specific errors
  if (error instanceof ToolNotImplementedError) {
    return createMcpError(MCPErrorCode.MethodNotFound, error.message, {
      toolName: error.toolName,
      availableTools: error.availableTools,
      suggestedAlternatives: error.suggestedAlternatives,
      timestamp: error.timestamp,
    });
  }

  if (error instanceof ToolValidationError) {
    return createMcpError(MCPErrorCode.InvalidParams, error.message, {
      toolName: error.toolName,
      validationErrors: error.validationErrors,
      timestamp: error.timestamp,
    });
  }

  if (error instanceof ToolExecutionError) {
    return createMcpError(MCPErrorCode.InternalError, error.message, {
      toolName: error.toolName,
      operation: error.operation,
      originalError: error.originalError,
      timestamp: error.timestamp,
    });
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
    // Handle application errors using modern error mapping (same pattern as ServiceError)
    const mcpCode = ERROR_CODE_MAPPING[error.code as DomainErrorCode] || MCPErrorCode.InternalError;

    return createMcpError(mcpCode, error.message, {
      code: error.code,
      layer: 'application',
      context: error.context,
      timestamp: error.timestamp.toISOString(),
    });
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
      timestamp: new Date().toISOString(),
    });
  }

  // Handle non-Error objects
  return createMcpError(
    MCPErrorCode.InternalError,
    typeof error === 'string' ? error : 'Unknown error occurred',
    {
      code: DomainErrorCode.UnknownError,
      originalError: error,
      timestamp: new Date().toISOString(),
    },
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
    DomainErrorCode.StorageError,
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
