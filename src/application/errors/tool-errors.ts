/**
 * Tool-specific Error Classes
 * Provides clear error handling for tool-related issues
 */

import { ErrorCode, ErrorSeverity, ToolError } from '../../domain/types/errors.js';

/**
 * Error thrown when a tool is not implemented
 */
export class ToolNotImplementedError extends Error implements ToolError {
  code: ErrorCode;
  severity: ErrorSeverity;
  timestamp: string;
  toolName: string;
  availableTools?: string[];
  suggestedAlternatives?: string[];

  constructor(
    message: string,
    toolName: string,
    context?: {
      availableTools?: string[];
      suggestedAlternatives?: string[];
    },
  ) {
    super(message);
    this.name = 'ToolNotImplementedError';
    this.code = ErrorCode.TOOL_ERROR;
    this.severity = ErrorSeverity.HIGH;
    this.timestamp = new Date().toISOString();
    this.toolName = toolName;
    if (context?.availableTools !== undefined) {
      this.availableTools = context.availableTools;
    }
    if (context?.suggestedAlternatives !== undefined) {
      this.suggestedAlternatives = context.suggestedAlternatives;
    }

    // Maintain proper stack trace
    if (Error.captureStackTrace != null) {
      Error.captureStackTrace(this, ToolNotImplementedError);
    }
  }

  /**
   * Convert to domain error format
   */
  toDomainError(): ToolError {
    const error: ToolError = {
      code: this.code,
      message: this.message,
      severity: this.severity,
      timestamp: this.timestamp,
      toolName: this.toolName,
    };

    if (this.availableTools !== undefined || this.suggestedAlternatives !== undefined) {
      error.context = {
        availableTools: this.availableTools ?? [],
        suggestedAlternatives: this.suggestedAlternatives ?? [],
      };
    }

    if (this.stack !== undefined) {
      error.stack = this.stack;
    }

    return error;
  }
}

/**
 * Error thrown when tool validation fails
 */
export class ToolValidationError extends Error implements ToolError {
  code: ErrorCode;
  severity: ErrorSeverity;
  timestamp: string;
  toolName: string;
  validationErrors?: Record<string, unknown>;

  constructor(message: string, toolName: string, validationErrors?: Record<string, unknown>) {
    super(message);
    this.name = 'ToolValidationError';
    this.code = ErrorCode.VALIDATION;
    this.severity = ErrorSeverity.MEDIUM;
    this.timestamp = new Date().toISOString();
    this.toolName = toolName;
    if (validationErrors !== undefined) {
      this.validationErrors = validationErrors;
    }

    if (Error.captureStackTrace != null) {
      Error.captureStackTrace(this, ToolValidationError);
    }
  }

  toDomainError(): ToolError {
    const error: ToolError = {
      code: this.code,
      message: this.message,
      severity: this.severity,
      timestamp: this.timestamp,
      toolName: this.toolName,
    };

    if (this.validationErrors !== undefined) {
      error.context = {
        validationErrors: this.validationErrors,
      };
    }

    if (this.stack !== undefined) {
      error.stack = this.stack;
    }

    return error;
  }
}

/**
 * Error thrown when tool execution fails
 */
export class ToolExecutionError extends Error implements ToolError {
  code: ErrorCode;
  severity: ErrorSeverity;
  timestamp: string;
  toolName: string;
  operation?: string;
  originalError?: unknown;

  constructor(message: string, toolName: string, operation?: string, originalError?: unknown) {
    super(message);
    this.name = 'ToolExecutionError';
    this.code = ErrorCode.TOOL_ERROR;
    this.severity = ErrorSeverity.HIGH;
    this.timestamp = new Date().toISOString();
    this.toolName = toolName;
    if (operation !== undefined) {
      this.operation = operation;
    }
    if (originalError !== undefined) {
      this.originalError = originalError;
    }

    if (Error.captureStackTrace != null) {
      Error.captureStackTrace(this, ToolExecutionError);
    }
  }

  toDomainError(): ToolError {
    const error: ToolError = {
      code: this.code,
      message: this.message,
      severity: this.severity,
      timestamp: this.timestamp,
      toolName: this.toolName,
    };

    if (this.operation !== undefined || this.originalError !== undefined) {
      error.context = {
        operation: this.operation ?? '',
        originalError: this.originalError ?? null,
      };
    }

    if (this.stack !== undefined) {
      error.stack = this.stack;
    }

    return error;
  }
}

/**
 * Helper to suggest alternative tools
 */
export function suggestAlternativeTools(requestedTool: string, availableTools: string[]): string[] {
  const suggestions: string[] = [];
  const requested = requestedTool.toLowerCase();

  // Find tools with similar names
  for (const tool of availableTools) {
    const toolLower = tool.toLowerCase();

    // Exact substring match
    if (toolLower.includes(requested) || requested.includes(toolLower)) {
      suggestions.push(tool);
      continue;
    }

    // Check for similar prefixes (e.g., "build" matches "build_image")
    const requestedPrefix = requested.split('_')[0];
    const toolPrefix = toolLower.split('_')[0];
    if (requestedPrefix === toolPrefix) {
      suggestions.push(tool);
    }
  }

  return suggestions.slice(0, 3); // Return top 3 suggestions
}
