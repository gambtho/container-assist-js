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
import { getRegisteredTools } from '../native-registry';

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
    const { logger, server } = context;
    const { details } = input;

    logger.info({ details }, 'Server status requested');

    try {
      const uptime = Math.floor(process.uptime());
      const version = '2.0.0';
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      // Session count would require implementing getActiveCount in SessionService
      const sessions = 0;

      // Get dynamic tool count
      let toolCount = 0;
      try {
        // First try to get tools from server if it exposes listTools()
        if (server && typeof server === 'object' && 'listTools' in server) {
          const serverWithListTools = server as { listTools: () => Promise<unknown> };
          const toolsResult = await serverWithListTools.listTools();
          if (toolsResult && Array.isArray(toolsResult)) {
            toolCount = toolsResult.length;
          } else if (
            toolsResult &&
            typeof toolsResult === 'object' &&
            'tools' in toolsResult &&
            Array.isArray((toolsResult as { tools: unknown[] }).tools)
          ) {
            toolCount = (toolsResult as { tools: unknown[] }).tools.length;
          }
        }
        // Fall back to getRegisteredTools() from native-registry
        else {
          toolCount = getRegisteredTools().length;
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to get dynamic tool count, using static count');
        // Use static count from native-registry as fallback
        toolCount = getRegisteredTools().length;
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
