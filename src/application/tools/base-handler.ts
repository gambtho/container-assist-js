/**
 * Base Handler - MCP SDK Compatible Version
 */

import type { Logger } from 'pino';
import type { CoreServices } from '../services/interfaces.js';
import type { SimpleToolConfig } from './simple-config';

/**
 * Tool request structure
 */
export interface ToolRequest {
  method: string;
  arguments?: Record<string, unknown>;
}

/**
 * Tool response structure
 */
export interface ToolResult {
  success: boolean;
  error?: string;
  message?: string;
  tool?: string;
  sessionId?: string;
  status?: string;
  arguments?: Record<string, unknown>;
  data?: unknown;
  nextStep?: {
    tool: string;
    reason: string | null;
  };
  [key: string]: unknown;
}

/**
 * Chain hint for tool workflows
 */
export interface ChainHint<TOutput = any> {
  nextTool: string;
  reason: string;
  paramMapper?: (output: TOutput) => Record<string, any>;
}

/**
 * Abstract base class for all tool handlers
 * Uses constructor injection instead of service locator
 */
export abstract class BaseMCPToolDescriptor<TInput = any, TOutput = any> {
  protected readonly logger: Logger;
  protected readonly config: SimpleToolConfig;

  constructor(
    protected readonly services: CoreServices,
    config: SimpleToolConfig
  ) {
    this.config = config;
    this.logger = services.logger.child({ tool: config.name });
  }

  /**
   * Input validation schema - must be implemented by subclasses
   */
  abstract get inputSchema(): unknown;

  /**
   * Output validation schema - optional
   */
  get outputSchema(): any | undefined {
    return undefined;
  }

  /**
   * Tool execution logic - must be implemented by subclasses
   */
  abstract handler(input: TInput): Promise<TOutput>;

  /**
   * Optional chain hint for workflow automation
   */
  get chainHint(): ChainHint<TOutput> | undefined {
    return undefined;
  }

  /**
   * Main entry point for tool execution
   * Handles validation, execution, and error formatting
   */
  async handle(request: ToolRequest): Promise<ToolResult> {
    const { arguments: args = {} } = request;

    this.logger.info(
      {
        tool: this.config.name,
        hasSession: !!(args.session_id ?? args.sessionId)
      },
      'Handling tool request'
    );

    try {
      // Validate input using schema
      const input = this.validateInput(args);

      // Execute the tool logic
      const result = await this.handler(input);

      // Validate output if schema provided
      if (this.outputSchema) {
        this.outputSchema.parse(result);
      }

      // Format successful response
      const toolResult = this.formatSuccess(result, args);

      // Add chain hint if available
      if (this.chainHint) {
        toolResult.nextStep = {
          tool: this.chainHint.nextTool,
          reason: this.chainHint.reason
        };

        // Apply parameter mapping if provided
        if (this.chainHint.paramMapper) {
          toolResult.nextStepParams = this.chainHint.paramMapper(result);
        }
      }

      this.logger.info(
        {
          tool: this.config.name,
          success: true
        },
        'Tool executed successfully'
      );

      return toolResult;
    } catch (error) {
      return this.formatError(error, args);
    }
  }

  /**
   * Validate input using the tool's schema'
   */
  private validateInput(args: Record<string, unknown>): TInput {
    try {
      return this.inputSchema.parse(args);
    } catch (error) {
      throw new ValidationError(
        `Input validation failed: ${error instanceof Error ? error.message : String(error)}`,
        ['input']
      );
    }
  }

  /**
   * Format successful tool response
   */
  private formatSuccess(result: TOutput, args: Record<string, unknown>): ToolResult {
    // Extract session ID from various possible locations
    const sessionId = this.extractSessionId(args, result);

    return {
      success: true,
      tool: this.config.name,
      message: `Tool ${this.config.name} executed successfully`,
      arguments: args,
      data: result,
      ...(sessionId && { sessionId })
    };
  }

  /**
   * Format error response
   */
  private formatError(error: unknown, args: Record<string, unknown>): ToolResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    this.logger.error(
      {
        error: errorMessage,
        stack: errorStack,
        tool: this.config.name
      },
      'Tool execution failed'
    );

    return {
      success: false,
      tool: this.config.name,
      error: errorMessage,
      arguments: args
    };
  }

  /**
   * Extract session ID from input or output
   */
  private extractSessionId(args: Record<string, unknown>, result?: TOutput): string | undefined {
    // Try multiple common field names
    return (
      (args.session_id as string) ||
      (args.sessionId as string) ||
      (result &&
        typeof result === 'object' &&
        result !== null &&
        ((result as unknown).sessionId ?? (result as unknown).session_id))
    );
  }

  /**
   * Helper method for progress updates
   */
  protected async emitProgress(update: {
    sessionId: string;
    step: string;
    status: 'in_progress' | 'completed' | 'failed';
    message: string;
    progress: number;
    data?: unknown;
  }): Promise<void> {
    if (this.services.progress && this.services.progress.length > 0) {
      try {
        await this.services.progress.emit(update);
      } catch (error) {
        this.logger.warn({ error }, 'Failed to emit progress update');
      }
    }
  }
}

/**
 * Validation error for input parsing
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public fields: string[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Tool configuration interface
 */
export interface ToolHandlerConfig {
  name: string;
  description: string;
  category: string;
}

// Export alias for backward compatibility
export { BaseMCPToolDescriptor as BaseToolHandler };
