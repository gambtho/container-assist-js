/**
 * Utils - MCP SDK Compatible Version
 */

import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { ErrorCode, DomainError } from '../../domain/types/index';
import type { ToolContext } from './tool-types';

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
 * Emit progress updates
 */
export function emitProgress(
  context: ToolContext,
  data: {
    step: string;
    status: string;
    progress: number;
    message: string;
    metadata?: unknown;
  },
): void {
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
    // EventEmitter.emit is synchronous, but we maintain async interface for compatibility
    context.progressEmitter.emit('progress', update);
  }
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
