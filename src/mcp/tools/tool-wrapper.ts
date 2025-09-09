/**
 * Tool Wrapper Module
 *
 * Provides consistent tool execution wrapper with standardized:
 * - Progress reporting (4-stage pattern)
 * - Error handling
 * - Return shapes
 * - Logging context
 */

import { createLogger, type Logger } from '@lib/logger';
import { Success, Failure, type Result } from '../../domain/types';
import type { ToolContext } from '../context/types';
import type { ExtendedToolContext } from '../../tools/shared-types';
import { createStandardProgress } from '../utils/progress-helper';

/**
 * Tool implementation signature
 * @template TParams - Tool parameter types
 * @template TResult - Tool result types
 */
export interface ToolImplementation<TParams, TResult> {
  (params: TParams, context: ExtendedToolContext, logger: Logger): Promise<Result<TResult>>;
}

/**
 * Tool handler signature after wrapping
 * @template TParams - Tool parameter types
 * @template TResult - Tool result types
 */
export interface ToolHandler<TParams, TResult> {
  (params: TParams, context: ExtendedToolContext): Promise<Result<StandardToolResponse<TResult>>>;
}

/**
 * Standard tool response shape
 * @template T - The data type returned by the tool
 */
export interface StandardToolResponse<T = unknown> {
  ok: boolean;
  sessionId?: string;
  data?: T;
  message?: string;
}

/**
 * Format result into standardized response shape
 * @template T - The data type
 * @param result - The result to format
 * @param sessionId - Optional session ID
 * @returns Formatted standard response
 */
export function formatStandardResponse<T>(
  result: Result<T>,
  sessionId?: string,
): Result<StandardToolResponse<T>> {
  if (result.ok) {
    return Success({
      ok: true,
      ...(sessionId ? { sessionId } : {}),
      data: result.value,
      message: 'Operation completed successfully',
    });
  }
  return Failure(result.error);
}

/**
 * Consistent tool execution wrapper
 * Applies standard patterns to any tool implementation:
 * - 4-stage progress reporting (VALIDATING → EXECUTING → FINALIZING → COMPLETE)
 * - Unified error handling
 * - Consistent logging context
 * - Standardized return shapes
 *
 * @template TParams - Tool parameter types
 * @template TResult - Tool result types
 * @param toolName - Name of the tool for logging
 * @param implementation - The core tool implementation
 * @returns Wrapped tool handler with standardized behavior
 */
export function wrapTool<TParams, TResult>(
  toolName: string,
  implementation: ToolImplementation<TParams, TResult>,
): ToolHandler<TParams, TResult> {
  return async (params: TParams, context: ExtendedToolContext) => {
    // Create unified logging context
    const logger = createLogger({ name: toolName });

    // Create standardized progress reporter
    const progressReporter = (context as ToolContext)?.progress;
    const progress = createStandardProgress(progressReporter);

    try {
      // Stage 1: Validating
      logger.debug({ params }, `${toolName}: Starting validation`);
      await progress('VALIDATING');

      // Basic parameter validation - tools can add their own specific validation
      if (!params || typeof params !== 'object') {
        const error = `${toolName}: Invalid parameters provided`;
        logger.error({ params }, error);
        return Failure(error);
      }

      // Stage 2: Executing
      logger.debug(`${toolName}: Beginning execution`);
      await progress('EXECUTING');

      // Execute the actual tool implementation
      const result = await implementation(params, context, logger);

      // Stage 3: Finalizing
      logger.debug(`${toolName}: Finalizing results`);
      await progress('FINALIZING');

      // Process and format the result
      let sessionId: string | undefined;

      // Extract sessionId from result if it exists
      if (
        result.ok &&
        result.value &&
        typeof result.value === 'object' &&
        'sessionId' in result.value
      ) {
        const resultValue = result.value as Record<string, unknown>;
        if (typeof resultValue.sessionId === 'string') {
          sessionId = resultValue.sessionId;
        }
      }

      const formattedResult = formatStandardResponse(result, sessionId);

      // Stage 4: Complete
      await progress('COMPLETE');

      if (formattedResult.ok) {
        logger.info({ sessionId }, `${toolName}: Operation completed successfully`);
      } else {
        logger.error({ error: formattedResult.error }, `${toolName}: Operation failed`);
      }

      return formattedResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const fullError = `${toolName} failed: ${errorMessage}`;

      logger.error(
        { error: errorMessage, stack: error instanceof Error ? error.stack : undefined },
        fullError,
      );

      return Failure(fullError);
    }
  };
}
