import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from 'pino';
import { CancelledError } from './errors.js';
import { Failure, type Result } from '../types/core.js';

/**\n * Functional approach with composable utilities\n * Design decision: Uses functional composition over inheritance/classes for easier testing and modularity\n */
export type ProgressReporter = (progress: number, message?: string) => Promise<void>;
export type ToolContext = {
  signal: AbortSignal;
  progressReporter?: ProgressReporter | undefined;
  logger: Logger;
  sessionId?: string | undefined;
};

const createProgressReporter =
  (server: any, token: string): ProgressReporter =>
  async (progress: number, message?: string) => {
    await server.notification({
      method: 'notifications/progress',
      params: { progressToken: token, progress, total: 100, message },
    });
  };

const createToolContext = (request: any, server: any, logger: Logger): ToolContext => {
  const { _meta } = request.params;
  const progressToken = _meta?.progressToken;

  return {
    signal: request.signal || new AbortController().signal,
    progressReporter: progressToken ? createProgressReporter(server, progressToken) : undefined,
    logger: logger.child({ tool: request.params.name }),
    sessionId: request.params.arguments?.sessionId,
  };
};

const executeWithContext = async (
  tool: any,
  args: any,
  context: ToolContext,
): Promise<Result<any>> => {
  const { signal, progressReporter, logger } = context;

  try {
    // Execute tool with progress reporting
    void progressReporter?.(50, `Executing ${tool.name}...`);
    const result = await tool.execute(args, logger);
    void progressReporter?.(100, 'Complete');

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
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `Tool not found: ${name}` }),
            },
          ],
        };
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
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: result.error }),
            },
          ],
          isError: true,
        };
      }
    } catch (error: any) {
      if (error instanceof CancelledError) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ cancelled: true }),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: error.message }),
          },
        ],
        isError: true,
      };
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
