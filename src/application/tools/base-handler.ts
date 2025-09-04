/**
 * Base Handler - MCP SDK Compatible Version
 */

import type { Logger } from 'pino';
import type { CoreServices } from '../services/interfaces.js';
import type { ToolConfig } from './tool-config';

/**
 * Tool request structure
 */
export interface ToolRequest {
  method: string;
  arguments?: Record<string, unknown>;
}

/**
 * Tool result using discriminated union - much cleaner than mixed interface
 */
export type ToolResult =
  | {
      success: true;
      tool: string;
      data: unknown;
      sessionId?: string;
      message?: string;
      arguments?: Record<string, unknown>;
      nextStep?: {
        tool: string;
        reason: string;
      };
    }
  | {
      success: false;
      tool: string;
      error: string;
      code?: string;
      arguments?: Record<string, unknown>;
    };

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
export abstract class BaseToolDescriptor<TInput = any, TOutput = any> {
  protected readonly logger: Logger;
  protected readonly config: ToolConfig;

  constructor(
    protected readonly services: CoreServices,
    config: ToolConfig,
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
  get outputSchema(): any {
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
        hasSession: (args.session_id ?? args.sessionId) != null,
      },
      'Handling tool request',
    );

    try {
      // Validate input using schema
      const input = this.validateInput(args);

      // Execute the tool logic
      const result = await this.handler(input);

      // Validate output if schema provided
      if (this.outputSchema) {
        const schema = this.outputSchema as { parse: (input: unknown) => void };
        schema.parse(result);
      }

      // Format successful response with chain hint if available
      const chainStep = this.chainHint
        ? {
          tool: this.chainHint.nextTool,
          reason: this.chainHint.reason,
        }
        : undefined;

      const toolResult = this.formatSuccess(result, args, chainStep);

      this.logger.info(
        {
          tool: this.config.name,
          success: true,
        },
        'Tool executed successfully',
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
      const schema = this.inputSchema as { parse: (input: unknown) => TInput };
      return schema.parse(args);
    } catch (error) {
      throw new ValidationError(
        `Input validation failed: ${error instanceof Error ? error.message : String(error)}`,
        ['input'],
      );
    }
  }

  /**
   * Format successful tool response
   */
  private formatSuccess(
    result: TOutput,
    args: Record<string, unknown>,
    nextStep?: { tool: string; reason: string },
  ): ToolResult {
    // Extract session ID from various possible locations
    const sessionId = this.extractSessionId(args, result);

    return {
      success: true,
      tool: this.config.name,
      data: result,
      message: `Tool ${this.config.name} executed successfully`,
      arguments: args,
      ...(sessionId && { sessionId }),
      ...(nextStep && { nextStep }),
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
        tool: this.config.name,
      },
      'Tool execution failed',
    );

    return {
      success: false,
      tool: this.config.name,
      error: errorMessage,
      arguments: args,
    };
  }

  /**
   * Extract session ID from input or output
   */
  private extractSessionId(args: Record<string, unknown>, result?: TOutput): string | undefined {
    // Try multiple common field names
    const sessionFromArgs = args.session_id ?? args.sessionId;
    if (typeof sessionFromArgs === 'string') {
      return sessionFromArgs;
    }

    // Check result object for session ID
    if (result && typeof result === 'object' && result !== null) {
      const resultObj = result as Record<string, unknown>;
      const sessionFromResult = resultObj.sessionId ?? resultObj.session_id;
      if (typeof sessionFromResult === 'string') {
        return sessionFromResult;
      }
    }

    return undefined;
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
    if (this.services.progress && typeof this.services.progress.emit === 'function') {
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
    public fields: string[],
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
