/**
 * Progress Helper Utilities
 *
 * Provides standardized progress reporting for tools
 */

import type { Logger } from 'pino';
import type { ProgressReporter } from '@mcp/context/types';

export interface ProgressToken {
  id: string;
  cancel?: () => void;
}

export interface ProgressReportOptions {
  progressToken?: ProgressToken;
  logger?: Logger;
  server?: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;
}

/**
 * Standardized 4-stage progress pattern for all tools
 */
export const STANDARD_STAGES = {
  VALIDATING: { message: 'Validating', percentage: 10 },
  EXECUTING: { message: 'Executing', percentage: 50 },
  FINALIZING: { message: 'Finalizing', percentage: 90 },
  COMPLETE: { message: 'Complete', percentage: 100 },
} as const;

/**
 * Creates a standardized progress reporter for tools
 */
export function createToolProgressReporter(
  options: ProgressReportOptions,
  toolName: string,
): ProgressReporter {
  const { progressToken, logger, server } = options;

  return async (message: string, progress?: number, total?: number): Promise<void> => {
    const progressData = {
      tool: toolName,
      progress: Math.max(0, Math.min(100, progress || 0)),
      message: message || `${toolName} progress: ${progress || 0}%`,
      timestamp: new Date().toISOString(),
    };

    // Log progress
    if (logger) {
      logger.debug(progressData, 'Tool progress update');
    }

    // Report to MCP server if available
    if (server && progressToken) {
      try {
        await (
          server as unknown as {
            sendNotification: (type: string, data: Record<string, unknown>) => Promise<void>;
          }
        ).sendNotification('notifications/progress', {
          progressToken: progressToken.id,
          progress: progressData.progress,
          total: total || 100,
        });
      } catch (error) {
        if (logger) {
          logger.warn({ error }, 'Failed to report progress to MCP server');
        }
      }
    }
  };
}

/**
 * Helper function to report progress with optional reporter
 * Works with or without a reporter instance (null-safe)
 */
export async function reportProgress(
  reporter: ProgressReporter | undefined,
  message: string,
  percentage: number,
): Promise<void> {
  if (reporter) {
    await reporter(message, percentage);
  }
}

/**
 * Creates a standardized progress handler with 4-stage pattern
 * Returns a function that accepts stage names and reports appropriate progress
 */
export function createStandardProgress(reporter?: ProgressReporter) {
  return async (stage: keyof typeof STANDARD_STAGES): Promise<void> => {
    const { message, percentage } = STANDARD_STAGES[stage];
    await reportProgress(reporter, message, percentage);
  };
}
