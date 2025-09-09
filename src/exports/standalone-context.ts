/**
 * Standalone ToolContext for use outside of MCP server
 * Reuses existing context implementation but works without server dependency
 */

import { createLogger } from '../lib/logger.js';
import { SimpleToolContext } from '../mcp/context/tool-context.js';
import { createSessionManager } from '../lib/session.js';
import { getConfiguredServer, getSharedSessionManager } from './configure.js';
import type { ToolContext } from '../mcp/context/types.js';
import type { Logger } from 'pino';

/**
 * Create a standalone ToolContext for use when tools are imported into external MCP servers
 * @param params - Parameters including sessionId
 * @param customLogger - Optional custom logger
 */
export function createStandaloneContext(
  params?: { sessionId?: string },
  customLogger?: Logger,
): ToolContext {
  const logger = customLogger || createLogger({ name: 'standalone-tool' });
  // Use the shared SessionManager to maintain state across tool invocations
  const sessionManager = getSharedSessionManager() || createSessionManager(logger);

  // Use the globally configured server if available
  const server = getConfiguredServer();

  // Create context with configured server
  const context = new SimpleToolContext(
    server as any,
    logger,
    undefined, // No prompt registry in standalone
    undefined, // No signal
    undefined, // Progress will be created below
    {
      debug: false,
      defaultTimeout: 30000,
      defaultMaxTokens: 2048,
      defaultStopSequences: ['```', '\n\n```', '\n\n# ', '\n\n---'],
    },
    sessionManager,
  );

  // Simple progress reporter that just logs
  context.progress = async (message: string, progress?: number, total?: number) => {
    if (progress !== undefined && total !== undefined) {
      logger.info({ progress, total }, message);
    } else {
      logger.info(message);
    }
  };

  // If sessionId provided, ensure session exists
  // Note: Session operations are async but we handle them in the background
  if (params?.sessionId && sessionManager) {
    const sessionId = params.sessionId;
    sessionManager
      .getSession(sessionId)
      .then((session) => {
        if (!session.ok) {
          // Create session if it doesn't exist
          sessionManager.createSession(sessionId).catch((err) => {
            logger.warn({ sessionId, error: err }, 'Failed to create session');
          });
        }
      })
      .catch((err) => {
        logger.warn({ sessionId, error: err }, 'Failed to get session');
      });
  }

  return context;
}
