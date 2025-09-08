/**
 * Progress Helper Utilities
 *
 * Provides standardized progress reporting for tools
 */

import type { Logger } from 'pino';

export interface ProgressToken {
  id: string;
  cancel?: () => void;
}

export interface ProgressReportOptions {
  progressToken?: ProgressToken;
  logger?: Logger;
  server?: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;
}

export type ProgressReporter = (progress: number, message?: string) => Promise<void>;

/**
 * Creates a standardized progress reporter for tools
 */
export function createToolProgressReporter(
  options: ProgressReportOptions,
  toolName: string,
): ProgressReporter {
  const { progressToken, logger, server } = options;

  return async (progress: number, message?: string): Promise<void> => {
    const progressData = {
      tool: toolName,
      progress: Math.max(0, Math.min(100, progress)),
      message: message || `${toolName} progress: ${progress}%`,
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
          total: 100,
        });
      } catch (error) {
        if (logger) {
          logger.warn({ error }, 'Failed to report progress to MCP server');
        }
      }
    }
  };
}
