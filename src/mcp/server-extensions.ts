import {
  CallToolRequestSchema,
  McpError,
  ErrorCode,
  ProgressSchema,
  type Progress,
} from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from 'pino';
import { CancelledError } from './errors.js';
import { Failure, type Result } from '../types/core';

/**\n * Functional approach with composable utilities\n * Design decision: Uses functional composition over inheritance/classes for easier testing and modularity\n */
export type ProgressReporter = (progress: Progress) => Promise<void>;
export type ToolContext = {
  signal: AbortSignal;
  progressReporter?: ProgressReporter;
  progressUpdater?: (progress: number, message?: string, total?: number) => Promise<void>;
  logger: Logger;
  sessionId?: string;
};

const createProgressReporter =
  (server: any, token: string): ProgressReporter =>
  async (progress: Progress) => {
    // Use SDK-native progress notification format
    await server.notification({
      method: 'notifications/progress',
      params: {
        progressToken: token,
        ...ProgressSchema.parse(progress),
      },
    });
  };

const createToolContext = (request: any, server: any, logger: Logger): ToolContext => {
  const { _meta } = request.params;
  const progressToken = _meta?.progressToken;
  const progressReporter = progressToken
    ? createProgressReporter(server, progressToken)
    : undefined;

  // Enhanced progress updater for simplified tool integration
  const progressUpdater = progressReporter
    ? (progress: number, message?: string, total?: number) =>
        progressReporter({ progress, message, total })
    : undefined;

  return {
    signal: request.signal || new AbortController().signal,
    ...(progressReporter && { progressReporter }),
    ...(progressUpdater && { progressUpdater }),
    logger: logger.child({ tool: request.params.name }),
    ...(request.params.arguments?.sessionId && { sessionId: request.params.arguments.sessionId }),
  };
};

const executeWithContext = async (
  tool: any,
  args: any,
  context: ToolContext,
): Promise<Result<any>> => {
  const { signal, progressReporter, logger } = context;

  try {
    // Enhanced SDK-native progress reporting
    await progressReporter?.({ progress: 0, message: `Starting ${tool.name}...` });

    // Execute tool with enhanced context that includes progress updating capabilities
    await progressReporter?.({ progress: 10, message: `Executing ${tool.name}...` });

    const result = await tool.execute(args, logger, context);

    await progressReporter?.({ progress: 100, message: 'Complete' });

    return result;
  } catch (error: any) {
    if (signal?.aborted) {
      throw new CancelledError();
    }
    return Failure(`Tool execution failed: ${error.message}`);
  }
};

export const extendServerCapabilities = (server: any): any => {
  // Replace the tool call handler with enhanced version
  server.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const { name, arguments: args } = request.params;
    const context = createToolContext(request, server.server, server.logger);

    try {
      const tool = server.registry.getTool(name);
      if (!tool) {
        throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
      }

      const result = await executeWithContext(tool, args ?? {}, context);

      if (result.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result.value, null, 2),
            },
          ],
        };
      } else {
        throw new McpError(ErrorCode.InternalError, result.error);
      }
    } catch (error: any) {
      if (error instanceof CancelledError) {
        throw new McpError(ErrorCode.RequestTimeout, 'Tool execution cancelled');
      }

      // Re-throw MCP errors as-is
      if (error instanceof McpError) {
        throw error;
      }

      // Convert other errors to MCP errors
      throw new McpError(ErrorCode.InternalError, error.message || 'Unknown error occurred');
    }
  });

  // Add progress notification support
  server.server.notification =
    server.server.notification ||
    (async (notification: any) => {
      server.logger.debug({ notification }, 'Sending notification');
    });

  return server;
};
