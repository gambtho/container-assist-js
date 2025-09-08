import {
  CallToolRequestSchema,
  McpError,
  ErrorCode,
  ProgressSchema,
  type Progress,
} from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from 'pino';
// CancelledError is now defined inline
class CancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CancelledError';
  }
}
import { Failure, type Result } from '@types';

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

  // Progress updater for tool integration
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
    // SDK-native progress reporting
    await progressReporter?.({ progress: 0, message: `Starting ${tool.name}...` });

    // Execute tool with context that includes progress updating capabilities
    await progressReporter?.({ progress: 10, message: `Executing ${tool.name}...` });

    const result = await tool.execute(args, logger, context);

    await progressReporter?.({ progress: 100, message: 'Complete' });

    return result;
  } catch (error: unknown) {
    if (signal?.aborted) {
      throw new CancelledError('Operation cancelled');
    }
    const message = error instanceof Error ? error.message : String(error);
    return Failure(`Tool execution failed: ${message}`);
  }
};

export const extendServerCapabilities = (server: any): any => {
  // Replace the tool call handler with updated version
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
    } catch (error: unknown) {
      if (error instanceof CancelledError) {
        throw new McpError(ErrorCode.RequestTimeout, 'Tool execution cancelled');
      }

      // Re-throw MCP errors as-is
      if (error instanceof McpError) {
        throw error;
      }

      // Convert other errors to MCP errors
      const message = error instanceof Error ? error.message : String(error);
      throw new McpError(ErrorCode.InternalError, message || 'Unknown error occurred');
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
