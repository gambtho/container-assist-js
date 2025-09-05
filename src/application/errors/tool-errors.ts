/**
 * Tool-specific Error Classes
 * Provides clear error handling for tool-related issues
 */

import { ErrorCode, ToolError } from '../../domain/types/errors';

/**
 * Error thrown when a tool is not implemented
 */
export class ToolNotImplementedError extends ToolError {
  override toolName: string;
  timestamp: string;
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
    super(toolName, message, ErrorCode.ToolNotFound);
    this.name = 'ToolNotImplementedError';
    this.toolName = toolName;
    this.timestamp = new Date().toISOString();
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
}

/**
 * Error thrown when tool validation fails
 */
export class ToolValidationError extends ToolError {
  timestamp: string;
  validationErrors?: Record<string, unknown>;

  constructor(message: string, toolName: string, validationErrors?: Record<string, unknown>) {
    super(toolName, message, ErrorCode.ValidationFailed);
    this.name = 'ToolValidationError';
    this.timestamp = new Date().toISOString();
    if (validationErrors !== undefined) {
      this.validationErrors = validationErrors;
    }

    if (Error.captureStackTrace != null) {
      Error.captureStackTrace(this, ToolValidationError);
    }
  }
}

/**
 * Error thrown when tool execution fails
 */
export class ToolExecutionError extends ToolError {
  timestamp: string;
  operation?: string;
  originalError?: unknown;

  constructor(message: string, toolName: string, operation?: string, originalError?: unknown) {
    super(toolName, message, ErrorCode.ToolExecutionFailed);
    this.name = 'ToolExecutionError';
    this.timestamp = new Date().toISOString();
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
