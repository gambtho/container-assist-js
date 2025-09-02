/**
 * Centralized Tool Handler Error Flow
 * Provides unified error handling, validation, timeout management, and progress reporting
 */

import type { Logger } from 'pino';
// import type { Server } from '@modelcontextprotocol/sdk/types''; // Server not exported'
import { convertToMcpError } from '../errors/mcp-error-mapper';
import { createValidationHandler } from '../errors/validation';
// import { withRetry as recoveryWithRetry, withTimeout as recoveryWithTimeout } from '../errors/recovery''; // Unused imports'
import type { MCPToolDescriptor, MCPToolContext, MCPToolHandler } from './tool-types';

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  progressReporting?: boolean;
}

/**
 * Tool execution result wrapper
 */
export interface ToolExecutionResult<T> {
  success: true;
  data: T;
  executionTime: number;
  metadata?: Record<string, unknown>;
}

/**
 * Progress reporting utility
 */
// Since Server type is not exported from SDK, define a minimal interface
interface MCPServer {
  notification(params: { method: string; params: Record<string, unknown> }): Promise<void>;
}

export class ToolProgressReporter {
  constructor(
    private server: MCPServer,
    private progressToken?: string,
    private logger?: Logger
  ) {}

  async reportProgress(current: number, total?: number, message?: string): Promise<void> {
    if (!this.progressToken) return;

    try {
      await this.server.notification({
        method: 'notifications/progress',
        params: {
          progressToken: this.progressToken,
          progress: {
            current,
            total,
            message
          }
        }
      });
    } catch (error) {
      this.logger?.warn({ error }, 'Failed to report progress');
    }
  }

  async reportStage(stageName: string, current: number, total: number): Promise<void> {
    return this.reportProgress(current, total, `${stageName} (${current}/${total})`);
  }

  async reportCompletion(message = 'Complete'): Promise<void> {
    return this.reportProgress(100, 100, message);
  }
}

/**
 * Enhanced tool context with progress reporting
 */
export function createProgressContext(
  baseContext: MCPToolContext,
  progressReporter: ToolProgressReporter
): MCPToolContext & { progress: ToolProgressReporter } {
  return {
    ...baseContext,
    progress: progressReporter
  };
}

/**
 * Execute a tool with comprehensive error handling
 */
export async function executeToolSafely<TInput, TOutput>(
  tool: MCPToolDescriptor<TInput, TOutput>,
  params: TInput,
  context: MCPToolContext,
  options: ToolExecutionOptions = {}
): Promise<TOutput> {
  const { timeout = 30000, retries = 0, retryDelay = 1000, progressReporting = true } = options;

  const logger = context.logger.child({ tool: tool.name });
  const progressReporter = new ToolProgressReporter(context.server, context.progressToken, logger);

  // Create enhanced context with progress reporting
  const enhancedContext = progressReporting
    ? createProgressContext(context, progressReporter)
    : context;

  // Validate input
  try {
    const validateInput = createValidationHandler(tool.inputSchema);
    const validatedInput = validateInput(params);

    logger.debug({ params: validatedInput }, 'Input validation passed');

    // Execute with timeout and retry logic
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        if (progressReporting && context.progressToken) {
          await progressReporter.reportStage('Starting', 1, 4);
        }

        // Create timeout controller
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // Add signal to context
        const contextWithSignal = {
          ...enhancedContext,
          signal: controller.signal
        };

        try {
          logger.debug({ attempt, timeout }, 'Executing tool handler');
          const startTime = Date.now();

          if (progressReporting && context.progressToken) {
            await progressReporter.reportStage('Executing', 2, 4);
          }

          // Execute the tool handler
          const result = await tool.handler(validatedInput, contextWithSignal);

          const executionTime = Date.now() - startTime;
          logger.info({ executionTime }, 'Tool execution completed');

          if (progressReporting && context.progressToken) {
            await progressReporter.reportStage('Validating output', 3, 4);
          }

          // Validate output
          const validatedOutput = tool.outputSchema.parse(result);

          if (progressReporting && context.progressToken) {
            await progressReporter.reportCompletion();
          }

          clearTimeout(timeoutId);
          return validatedOutput as TOutput;
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        logger.warn(
          {
            attempt,
            maxAttempts: retries + 1,
            error: error instanceof Error ? error.message : String(error)
          },
          'Tool execution attempt failed'
        );

        // If this is the last attempt or error is not retryable, throw
        if (attempt === retries + 1 ?? !isRetryableError(error)) {
          throw convertToMcpError(error);
        }

        // Wait before retrying
        if (retryDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }
  } catch (error) {
    logger.error({ error }, 'Tool execution failed');
    throw convertToMcpError(error);
  }

  // This should never be reached, but TypeScript needs it
  throw new Error('Unreachable code');
}

/**
 * Create a validated tool handler with built-in error handling
 */
export function createValidatedTool<TInput, TOutput>(
  descriptor: Omit<MCPToolDescriptor<TInput, TOutput>, 'handler'> & {
    handler: MCPToolHandler<TInput, TOutput>;
  },
  options: ToolExecutionOptions = {}
): MCPToolDescriptor<TInput, TOutput> {
  return {
    ...descriptor,
    handler: async (params: TInput, context: MCPToolContext): Promise<TOutput> => {
      return executeToolSafely(
        { ...descriptor, handler: descriptor.handler },
        params,
        context,
        options
      );
    }
  };
}

/**
 * Create a tool handler with automatic timeout
 */
export function withTimeout<TInput, TOutput>(
  handler: MCPToolHandler<TInput, TOutput>,
  timeoutMs: number = 30000
): MCPToolHandler<TInput, TOutput> {
  return async (params: TInput, context: MCPToolContext): Promise<TOutput> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await handler(params, {
        ...context,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw convertToMcpError(error);
    }
  };
}

/**
 * Create a tool handler with automatic retry logic
 */
export function withRetry<TInput, TOutput>(
  handler: MCPToolHandler<TInput, TOutput>,
  maxRetries: number = 3,
  retryDelay: number = 1000
): MCPToolHandler<TInput, TOutput> {
  return async (params: TInput, context: MCPToolContext): Promise<TOutput> => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await handler(params, context);
      } catch (error) {
        lastError = error;

        context.logger?.warn(
          {
            attempt,
            maxRetries,
            error: error instanceof Error ? error.message : String(error)
          },
          'Tool handler attempt failed'
        );

        // If this is the last attempt or error is not retryable, throw
        if (attempt === maxRetries ?? !isRetryableError(error)) {
          throw convertToMcpError(error);
        }

        // Wait before retrying
        if (retryDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }

    throw convertToMcpError(lastError);
  };
}

/**
 * Create a tool handler with progress reporting
 */
export function withProgress<TInput, TOutput>(
  handler: MCPToolHandler<TInput, TOutput>,
  progressStages: string[] = ['Starting', 'Processing', 'Completing']
): MCPToolHandler<TInput, TOutput> {
  return async (params: TInput, context: MCPToolContext): Promise<TOutput> => {
    const progressReporter = new ToolProgressReporter(
      context.server,
      context.progressToken,
      context.logger
    );

    const enhancedContext = createProgressContext(context, progressReporter);

    try {
      for (let i = 0; i < progressStages.length - 1; i++) {
        const stage = progressStages[i];
        if (stage) {
          await progressReporter.reportStage(stage, i + 1, progressStages.length);
        }
      }

      const result = await handler(params, enhancedContext);

      const finalStage = progressStages[progressStages.length - 1];
      if (finalStage) {
        await progressReporter.reportStage(
          finalStage,
          progressStages.length,
          progressStages.length
        );
      }

      return result;
    } catch (error) {
      throw convertToMcpError(error);
    }
  };
}

/**
 * Compose multiple tool handler decorators
 */
export function composeTool<TInput, TOutput>(
  baseHandler: MCPToolHandler<TInput, TOutput>,
  ...decorators: Array<
    (handler: MCPToolHandler<TInput, TOutput>) => MCPToolHandler<TInput, TOutput>
  >
): MCPToolHandler<TInput, TOutput> {
  return decorators.reduce((handler, decorator) => decorator(handler), baseHandler);
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network/connection related errors are usually retryable
    return (
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('network') ||
      message.includes('unavailable') ||
      message.includes('temporary') ||
      message.includes('retry') ||
      error.name === 'AbortError'
    );
  }

  return false;
}

/**
 * Create a complete tool with all safety measures
 */
export function createSafeTool<TInput, TOutput>(
  descriptor: Omit<MCPToolDescriptor<TInput, TOutput>, 'handler'> & {
    handler: MCPToolHandler<TInput, TOutput>;
  },
  options: ToolExecutionOptions & {
    progressStages?: string[];
  } = {}
): MCPToolDescriptor<TInput, TOutput> {
  const {
    timeout = 30000,
    retries = 2,
    retryDelay = 1000,
    progressReporting = true,
    progressStages = ['Starting', 'Processing', 'Completing']
  } = options;

  let handler = descriptor.handler;

  // Apply decorators in order
  if (timeout > 0) {
    handler = withTimeout(handler, timeout);
  }

  if (retries > 0) {
    handler = withRetry(handler, retries + 1, retryDelay);
  }

  if (progressReporting) {
    handler = withProgress(handler, progressStages);
  }

  return {
    ...descriptor,
    handler
  };
}
