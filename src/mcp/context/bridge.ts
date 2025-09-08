/**
 * ToolContext Bridge Implementation
 *
 * Creates request-scoped ToolContext instances that provide AI sampling
 * and prompt access through proper MCP protocol channels instead of
 * internal client creation.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Logger } from 'pino';
import type {
  ToolContext,
  SamplingRequest,
  SamplingResponse,
  PromptWithMessages,
  ProgressReporter,
  ToolContextConfig,
} from './types';
const DEFAULT_CONFIG: Required<ToolContextConfig> = {
  debug: false,
  defaultTimeout: 30000, // 30 seconds
  defaultMaxTokens: 2048,
  defaultStopSequences: ['```', '\n\n```', '\n\n# ', '\n\n---'],
};

/**
 * Creates a request-scoped ToolContext instance
 *
 * This factory function creates a ToolContext that provides tools with
 * access to AI capabilities through proper MCP protocol channels:
 * - Uses client/sampling for AI responses
 * - Uses server/prompts for template access
 * - Forwards progress through notifications/progress
 *
 * @param server - MCP Server instance for making protocol requests
 * @param request - Original MCP request (contains metadata like progress token)
 * @param logger - Logger instance for structured logging
 * @param signal - Optional abort signal for cancellation
 * @param progress - Optional progress reporting function
 * @param config - Optional configuration overrides
 * @param promptRegistry - Optional prompt registry for prompt access
 * @returns ToolContext instance for this request
 */
export function createToolContext(
  server: Server,
  _request: unknown, // MCP request object (unused for now, reserved for future use)
  logger: Logger,
  signal?: AbortSignal,
  progress?: ProgressReporter,
  config: Partial<ToolContextConfig> = {},
  promptRegistry?: import('@prompts/prompt-registry').PromptRegistry,
): ToolContext {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const contextLogger = finalConfig.debug ? logger.child({ component: 'ToolContext' }) : logger;

  return {
    sampling: {
      async createMessage(samplingRequest: SamplingRequest): Promise<SamplingResponse> {
        const startTime = Date.now();

        try {
          contextLogger.debug(
            {
              messageCount: samplingRequest.messages.length,
              maxTokens: samplingRequest.maxTokens || finalConfig.defaultMaxTokens,
              includeContext: samplingRequest.includeContext || 'thisServer',
            },
            'Making sampling request',
          );

          // Convert our TextMessage format to SDK format
          const sdkMessages = samplingRequest.messages.map((msg) => ({
            role: msg.role,
            content: {
              type: 'text' as const,
              text: msg.content.map((c) => c.text).join('\n'),
            },
          }));

          // Prepare the request with defaults
          const requestWithDefaults = {
            maxTokens: samplingRequest.maxTokens || finalConfig.defaultMaxTokens,
            stopSequences: samplingRequest.stopSequences || finalConfig.defaultStopSequences,
            includeContext: samplingRequest.includeContext || 'thisServer',
            messages: sdkMessages,
            modelPreferences: samplingRequest.modelPreferences,
          };

          // Make the MCP client/sampling request using createMessage
          const response = await server.createMessage(requestWithDefaults);

          // Extract text from MCP response content (SDK format)
          if (!response?.content || response.content.type !== 'text') {
            throw new Error('Empty or invalid response from sampling - no text content found');
          }

          const text = response.content.text.trim();

          if (!text) {
            throw new Error('Empty response from sampling after processing');
          }

          const duration = Date.now() - startTime;
          contextLogger.debug(
            {
              duration,
              responseLength: text.length,
            },
            'Sampling request completed',
          );

          // Return standardized response with content array
          return {
            role: 'assistant',
            content: [{ type: 'text', text }],
            metadata: {
              ...((
                response as {
                  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
                }
              )?.usage && {
                usage: (
                  response as {
                    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
                  }
                )?.usage,
              }),
              ...((response as { model?: string })?.model && {
                model: (response as { model?: string })?.model,
              }),
              finishReason: ((response as { finishReason?: string })?.finishReason || 'stop') as
                | 'stop'
                | 'length'
                | 'content_filter'
                | 'tool_calls',
            },
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          contextLogger.error(
            {
              duration,
              error: error instanceof Error ? error.message : String(error),
              maxTokens: samplingRequest.maxTokens,
              messageCount: samplingRequest.messages.length,
            },
            'Sampling request failed',
          );

          // Re-throw with context
          if (error instanceof Error) {
            error.message = `Sampling failed: ${error.message}`;
          }
          throw error;
        }
      },
    },

    async getPrompt(name: string, args?: Record<string, unknown>): Promise<PromptWithMessages> {
      contextLogger.debug(
        {
          name,
          hasArgs: !!args,
          argCount: args ? Object.keys(args).length : 0,
        },
        'Requesting prompt',
      );

      if (!promptRegistry) {
        return {
          description: 'Prompt not available - no registry',
          messages: [
            {
              role: 'user' as const,
              content: [
                {
                  type: 'text' as const,
                  text: `Error: No prompt registry available for prompt '${name}'`,
                },
              ],
            },
          ],
        };
      }

      try {
        // Use the prompt registry's getPromptWithMessages method for ToolContext compatibility
        const result = await promptRegistry.getPromptWithMessages(name, args);
        contextLogger.debug(
          {
            name,
            messageCount: result.messages.length,
          },
          'Prompt retrieved successfully',
        );

        return result;
      } catch (error) {
        contextLogger.error(
          {
            name,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to retrieve prompt',
        );

        // Re-throw with context
        if (error instanceof Error) {
          error.message = `getPrompt failed for '${name}': ${error.message}`;
        }
        throw error;
      }
    },

    signal,
    progress,
  };
}

/**
 * Extracts progress token from MCP request metadata
 * Used to enable progress reporting for tools
 */
export function extractProgressToken(request: unknown): string | undefined {
  if (request && typeof request === 'object' && request !== null) {
    const req = request as Record<string, unknown>;
    const params = req.params;
    if (params && typeof params === 'object' && params !== null) {
      const p = params as Record<string, unknown>;
      const meta = p._meta;
      if (meta && typeof meta === 'object' && meta !== null) {
        const m = meta as Record<string, unknown>;
        return typeof m.progressToken === 'string' ? m.progressToken : undefined;
      }
    }
  }
  return undefined;
}

/**
 * Creates a progress reporter function that sends MCP progress notifications
 * Returns undefined if no progress token is available
 */
export function createProgressReporter(
  _server: Server, // Reserved for future use when progress notifications are implemented
  progressToken?: string,
  logger?: Logger,
): ProgressReporter | undefined {
  if (!progressToken) {
    return undefined;
  }

  return async (message: string, progress?: number, total?: number) => {
    try {
      // Send MCP progress notification
      // Note: MCP SDK Server doesn't have built-in notification sending
      // This would need to be implemented through the transport layer
      logger?.debug(
        {
          progressToken,
          message,
          progress,
          total,
        },
        'Progress notification sent',
      );

      // For now, we log the progress as the MCP server doesn't expose
      // a direct notification method. In a full implementation, this would
      // send notifications through the transport layer.
    } catch (error) {
      // Log but don't throw - progress notifications are non-critical
      logger?.warn(
        {
          progressToken,
          message,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to send progress notification',
      );
    }
  };
}

/**
 * Helper to create ToolContext with progress token extraction
 * Convenience function that handles common pattern of extracting progress
 * token from request and creating appropriate reporter
 */
export function createToolContextWithProgress(
  server: Server,
  request: unknown,
  logger: Logger,
  signal?: AbortSignal,
  config?: Partial<ToolContextConfig>,
  promptRegistry?: import('@prompts/prompt-registry').PromptRegistry,
): ToolContext {
  const progressToken = extractProgressToken(request);
  const progressReporter = createProgressReporter(server, progressToken, logger);

  return createToolContext(
    server,
    request,
    logger,
    signal,
    progressReporter,
    config,
    promptRegistry,
  );
}
