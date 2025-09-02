/**
 * Utils - MCP SDK Compatible Version
 */

import { z } from 'zod';
import { ErrorCode, DomainError } from '../../contracts/types/index';
import type { MCPToolContext } from './tool-types';
import type { Logger } from 'pino';

/**
 * Validate input against a Zod schema
 */
export function validateInput<T>(input: unknown, schema: z.ZodType<T>): T {
  const result = schema.safeParse(input);

  if (result.success && result.success.length > 0) {
    return result.data;
  }

  throw new DomainError(ErrorCode.InvalidInput, 'Input validation failed', result.error);
}

/**
 * Validate a required field
 */
export function validateRequired<T>(value: T | undefined | null, fieldName: string): T {
  if (value === undefined || value === null) {
    throw new DomainError(ErrorCode.InvalidInput, `Required field '${fieldName}' is missing`);
  }
  return value;
}

/**
 * Execute an operation with timeout
 */
export async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Handle errors consistently
 */
export function handleError(error: unknown, context?: string): never {
  const message = context
    ? `${context}: ${error?.message ?? String(error)}`
    : error?.message ?? String(error);

  throw new DomainError(ErrorCode.OPERATION_FAILED, message, error);
}

/**
 * Log an action with structured metadata
 */
export function logAction(logger: Logger, action: string, metadata?: Record<string, any>): void {
  logger.info({ action, ...metadata }, action);
}

/**
 * Emit progress updates
 */
export async function emitProgress(
  context: MCPToolContext,
  data: {
    step: string;
    status: string;
    progress: number;
    message: string;
    metadata?: unknown;
  }
): Promise<void> {
  if (context.progressEmitter) {
    await context.progressEmitter.emit({
      ...data,
      status: data.status as 'starting' | 'in_progress' | 'completed' | 'failed',
      sessionId: context.sessionId ?? 'system',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Create a simple tool handler from a function
 * This replaces the class-based approach with a functional one
 */
export function createMCPToolDescriptor<TInput, TOutput>(config: {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput, context: MCPToolContext) => Promise<TOutput>;
}) {
  return {
    name: config.name,
    description: config.description,
    category: 'utility' as const,
    inputSchema: config.inputSchema,
    outputSchema: z.unknown() as z.ZodType<TOutput>,

    async handler(rawInput: unknown, context: MCPToolContext): Promise<TOutput> {
      const logger = context.logger.child({ tool: config.name });

      try {
        // Validate input
        const validatedInput = validateInput(rawInput, config.inputSchema);

        // Log the action
        logAction(logger, `Executing ${config.name}`, { input: validatedInput });

        // Execute the tool logic
        const result = await config.execute(validatedInput, context);

        logAction(logger, `${config.name} completed successfully`);
        return result;
      } catch (error) {
        logger.error({ error }, `${config.name} failed`);
        handleError(error, `Tool ${config.name} execution failed`);
      }
    }
  };
}

/**
 * Retry an operation with exponential backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    logger?: Logger;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, backoffMultiplier = 2, logger } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation();
      return result;
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);

        if (logger) {
          logger.warn(
            {
              attempt,
              maxAttempts,
              delay,
              error: lastError
            },
            'Operation failed, retrying...'
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new DomainError(
    ErrorCode.OPERATION_FAILED,
    `Operation failed after ${maxAttempts} attempts`,
    lastError
  );
}

/**
 * Helper to get session from context
 */
export async function getSessionFromContext(
  context: MCPToolContext,
  sessionId: string
): Promise<any> {
  if (!context.sessionService) {
    throw new Error('Session service not available');
  }

  const result = await context.sessionService.get(sessionId);

  if (!result) {
    throw new Error('Session not found');
  }

  return result;
}
