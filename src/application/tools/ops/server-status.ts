/**
 * Server Status Handler - MCP SDK Compatible Version
 * Provides detailed MCP server status and system information
 */

import * as os from 'os';
import {
  ServerStatusInput,
  type ServerStatusParams,
  ServerStatusSchema,
  type ServerStatus,
} from '../schemas';
import type { ToolDescriptor, ToolContext } from '../tool-types';

// Type aliases
type ServerStatusInputType = ServerStatusParams;
type ServerStatusOutput = ServerStatus;

/**
 * Server status tool implementation using MCP SDK pattern
 */
const serverStatusTool: ToolDescriptor<ServerStatusInputType, ServerStatusOutput> = {
  name: 'server_status',
  description: 'Get MCP server status and system information',
  category: 'utility',
  inputSchema: ServerStatusInput,
  outputSchema: ServerStatusSchema,

  handler: async (
    input: ServerStatusInputType,
    context: ToolContext,
  ): Promise<ServerStatusOutput> => {
    const { logger, sessionService, server, toolRegistry } = context;
    const { details } = input;

    logger.info({ details }, 'Server status requested');

    try {
      const uptime = Math.floor(process.uptime());
      const version = '2.0.0';
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      let sessions = 0;
      if (sessionService) {
        try {
          sessions = await sessionService.getActiveCount();
        } catch (error) {
          logger.warn({ error }, 'Failed to get session count');
        }
      }

      // Get dynamic tool count
      let toolCount = 0;
      try {
        // First try to get tools from server if it exposes listTools()
        if (
          server &&
          typeof server === 'object' &&
          'listTools' in server &&
          typeof (server as any).listTools === 'function'
        ) {
          const toolsResult = await (server as any).listTools();
          if (toolsResult && Array.isArray(toolsResult)) {
            toolCount = toolsResult.length;
          } else if (
            toolsResult &&
            typeof toolsResult === 'object' &&
            Array.isArray(toolsResult.tools)
          ) {
            toolCount = toolsResult.tools.length;
          }
        }
        // Fall back to toolRegistry if server doesn't have listTools()
        else if (toolRegistry && typeof toolRegistry.getToolCount === 'function') {
          toolCount = toolRegistry.getToolCount();
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to get dynamic tool count, defaulting to 0');
        toolCount = 0;
      }

      const status: ServerStatusOutput = {
        success: true,
        version,
        uptime,
        memory: {
          used: usedMem,
          total: totalMem,
        },
        sessions,
        tools: toolCount,
      };

      logger.info({ uptime, sessions, memoryUsed: usedMem }, 'Server status compiled');
      return status;
    } catch (error) {
      logger.error({ error }, 'Error collecting server status');
      throw error instanceof Error ? error : new Error(String(error));
    }
  },
};

// Default export for registry
export default serverStatusTool;

// Export types if needed elsewhere
export type { ServerStatusInputType, ServerStatusOutput };
