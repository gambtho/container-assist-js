/**
 * Progress notification helper for MCP tools
 * Provides a centralized, reusable pattern for progress reporting
 */

import type { ProgressToken } from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from 'pino';

/**
 * Progress reporter function type
 */
export type ProgressReporter = (
  progress: number,
  message?: string,
  total?: number,
) => Promise<void>;

/**
 * Progress notification interface for MCP server
 */
export interface ProgressNotifier {
  sendProgress(
    token: ProgressToken,
    progress: {
      progress: number;
      message?: string;
      total?: number;
    },
  ): Promise<void>;
}

/**
 * Create a progress reporter function for tools
 *
 * @param progressToken - Optional progress token from MCP request
 * @param notifier - Optional server instance with progress notification capability
 * @param logger - Logger for debugging progress messages
 * @returns Progress reporter function that handles notifications
 */
export function createProgressReporter(
  progressToken?: ProgressToken,
  notifier?: ProgressNotifier,
  logger?: Logger,
): ProgressReporter {
  return async (progress: number, message?: string, total?: number): Promise<void> => {
    // Log progress for debugging
    if (logger) {
      logger.debug({ progress, message, total }, 'Progress update');
    }

    // Send progress notification if token and notifier are available
    if (progressToken && notifier) {
      try {
        await notifier.sendProgress(progressToken, {
          progress,
          ...(message && { message }),
          ...(total && { total }),
        });
      } catch (error) {
        // Don't fail the operation if progress notification fails
        if (logger) {
          logger.warn({ error, progressToken }, 'Failed to send progress notification');
        }
      }
    }
  };
}

/**
 * Standard progress stages for common tool operations
 */
export const ProgressStages = {
  INITIALIZING: { progress: 0, message: 'Initializing...' },
  VALIDATING: { progress: 10, message: 'Validating parameters...' },
  PREPARING: { progress: 20, message: 'Preparing resources...' },
  EXECUTING: { progress: 50, message: 'Executing operation...' },
  PROCESSING: { progress: 80, message: 'Processing results...' },
  FINALIZING: { progress: 90, message: 'Finalizing...' },
  COMPLETE: { progress: 100, message: 'Complete' },
} as const;

/**
 * Helper to create staged progress reporter with predefined stages
 */
export function createStagedProgressReporter(
  progressToken?: ProgressToken,
  notifier?: ProgressNotifier,
  logger?: Logger,
): {
  reporter: ProgressReporter;
  reportStage: (stage: keyof typeof ProgressStages) => Promise<void>;
} {
  const reporter = createProgressReporter(progressToken, notifier, logger);

  const reportStage = async (stage: keyof typeof ProgressStages): Promise<void> => {
    const { progress, message } = ProgressStages[stage];
    await reporter(progress, message);
  };

  return { reporter, reportStage };
}

/**
 * Create a progress reporter that works with the MCP server context
 */
export function createToolProgressReporter(
  context: {
    progressToken?: ProgressToken;
    server?: any; // MCPServer instance
    logger?: Logger;
  },
  toolName: string,
): ProgressReporter {
  const notifier: ProgressNotifier | undefined = context.server
    ? {
        sendProgress: async (token, progress) => {
          if (context.server && typeof context.server.sendProgress === 'function') {
            await context.server.sendProgress(token, progress);
          }
        },
      }
    : undefined;

  return async (progress: number, message?: string, total?: number): Promise<void> => {
    const fullMessage = message
      ? `[${toolName}] ${message}`
      : `[${toolName}] Progress: ${progress}%`;

    const reporter = createProgressReporter(context.progressToken, notifier, context.logger);

    await reporter(progress, fullMessage, total);
  };
}
