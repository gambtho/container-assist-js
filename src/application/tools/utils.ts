/**
 * Utils - MCP SDK Compatible Version
 */

import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { ErrorCode, DomainError } from '../../contracts/types/index.js';
import type { ToolContext } from './tool-types';
import type { Logger } from 'pino';

/**
 * Validate input against a Zod schema
 */
export function validateInput<T>(input: unknown, schema: z.ZodType<T>): T {
  const result = schema.safeParse(input);

  if (result.success) {
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
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

/**
 * Handle errors consistently
 */
export function handleError(error: unknown, context?: string): never {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const message = context ? `${context}: ${errorMessage}` : errorMessage;

  throw new DomainError(
    ErrorCode.OPERATION_FAILED,
    message,
    error instanceof Error ? error : undefined,
  );
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
  context: ToolContext,
  data: {
    step: string;
    status: string;
    progress: number;
    message: string;
    metadata?: unknown;
  },
): Promise<void> {
  if (context.progressEmitter) {
    const update: any = {
      ...data,
      status: data.status as 'starting' | 'in_progress' | 'completed' | 'failed',
      sessionId: context.sessionId ?? 'system',
      timestamp: new Date().toISOString(),
    };
    if (data.metadata !== undefined) {
      update.metadata = data.metadata as Record<string, unknown>;
    }
    await context.progressEmitter.emit(update);
  }
}

/**
 * Create a simple tool handler from a function
 * This replaces the class-based approach with a functional one
 */
export function createToolDescriptor<TInput, TOutput>(config: {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
}): {
  name: string;
  description: string;
  category: 'utility';
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  handler: (rawInput: unknown, context: ToolContext) => Promise<TOutput>;
} {
  return {
    name: config.name,
    description: config.description,
    category: 'utility' as const,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,

    async handler(rawInput: unknown, context: ToolContext): Promise<TOutput> {
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
    },
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
  } = {},
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
              error: lastError,
            },
            'Operation failed, retrying...',
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new DomainError(
    ErrorCode.OPERATION_FAILED,
    `Operation failed after ${maxAttempts} attempts`,
    lastError instanceof Error ? lastError : undefined,
  );
}

/**
 * Helper to get session from context
 */
export async function getSessionFromContext(context: ToolContext, sessionId: string): Promise<any> {
  if (!context.sessionService) {
    throw new Error('Session service not available');
  }

  const result = await context.sessionService.get(sessionId);

  if (!result) {
    throw new Error('Session not found');
  }

  return result;
}

/**
 * Check if file exists
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
