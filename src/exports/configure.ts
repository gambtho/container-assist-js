/**
 * Configuration for standalone tool usage
 * Allows external MCP servers to provide their server instance for AI sampling
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createSessionManager, type SessionManager } from '../lib/session.js';
import { createLogger } from '../lib/logger.js';

// Global storage for configuration
let globalServer: Server | undefined;
let globalSessionManager: SessionManager | undefined;

/**
 * Configure the tools with an MCP server instance
 * This should be called by external MCP servers after importing the tools
 * to enable AI sampling capabilities
 *
 * @example
 * ```typescript
 * import { configureTools, analyzeRepo } from '@thgamble/containerization-assist-mcp';
 *
 * // In your MCP server initialization
 * const server = new Server(...);
 * configureTools({ server });
 *
 * // Now register the tools
 * server.addTool(analyzeRepo);
 * ```
 */
export function configureTools(config: { server: Server }): void {
  globalServer = config.server;

  // Create a shared session manager for all tools
  if (!globalSessionManager) {
    const logger = createLogger({ name: 'shared-session-manager' });
    globalSessionManager = createSessionManager(logger);
  }
}

/**
 * Get the configured server instance
 * Used internally by standalone context
 */
export function getConfiguredServer(): Server | undefined {
  return globalServer;
}

/**
 * Get the shared session manager
 * Used internally by standalone context to share sessions across tool calls
 */
export function getSharedSessionManager(): SessionManager | undefined {
  if (!globalSessionManager) {
    // Create one if it doesn't exist yet
    const logger = createLogger({ name: 'shared-session-manager' });
    globalSessionManager = createSessionManager(logger);
  }
  return globalSessionManager;
}
