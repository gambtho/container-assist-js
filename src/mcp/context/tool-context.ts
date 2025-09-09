/**
 * Simplified ToolContext Implementation
 *
 * Replaces the complex bridge pattern with a direct class-based approach.
 * Provides the same ToolContext interface with much simpler implementation.
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
import { extractProgressToken, createProgressReporter } from './progress';
import { SessionManager } from '@lib/index';
import { PromptRegistry } from '../../core/prompts/registry';

const DEFAULT_CONFIG: Required<ToolContextConfig> = {
  debug: false,
  defaultTimeout: 30000,
  defaultMaxTokens: 2048,
  defaultStopSequences: ['```', '\n\n```', '\n\n# ', '\n\n---'],
};

/**
 * Simplified ToolContext class - replaces complex bridge pattern
 */
export class SimpleToolContext implements ToolContext {
  public logger: Logger;
  public sampling: {
    createMessage(request: SamplingRequest): Promise<SamplingResponse>;
  };
  public sessionManager?: SessionManager;

  constructor(
    public server: Server,
    logger: Logger,
    public promptRegistry?: PromptRegistry,
    public signal?: AbortSignal,
    public progress?: ProgressReporter,
    private config: Required<ToolContextConfig> = DEFAULT_CONFIG,
    sessionManager?: SessionManager,
  ) {
    this.logger = config.debug ? logger.child({ component: 'ToolContext' }) : logger;
    if (sessionManager) {
      this.sessionManager = sessionManager;
    }

    this.sampling = {
      createMessage: this.createMessage.bind(this),
    };
  }

  async createMessage(samplingRequest: SamplingRequest): Promise<SamplingResponse> {
    const startTime = Date.now();

    try {
      this.logger.debug(
        {
          messageCount: samplingRequest.messages.length,
          maxTokens: samplingRequest.maxTokens || this.config.defaultMaxTokens,
          includeContext: samplingRequest.includeContext || 'thisServer',
        },
        'Making sampling request',
      );

      // Convert internal message format to SDK format
      const sdkMessages = samplingRequest.messages.map((msg) => ({
        role: msg.role,
        content: {
          type: 'text' as const,
          text: msg.content.map((c) => c.text).join('\n'),
        },
      }));

      // Make the MCP request with defaults
      const requestWithDefaults = {
        maxTokens: samplingRequest.maxTokens || this.config.defaultMaxTokens,
        stopSequences: samplingRequest.stopSequences || this.config.defaultStopSequences,
        includeContext: samplingRequest.includeContext || 'thisServer',
        messages: sdkMessages,
        modelPreferences: samplingRequest.modelPreferences,
      };

      const response = await this.server.createMessage(requestWithDefaults);

      // Validate response
      if (!response?.content || response.content.type !== 'text') {
        throw new Error('Empty or invalid response from sampling - no text content found');
      }

      const text = response.content.text.trim();
      if (!text) {
        throw new Error('Empty response from sampling after processing');
      }

      const duration = Date.now() - startTime;
      this.logger.debug(
        {
          duration,
          responseLength: text.length,
        },
        'Sampling request completed',
      );

      // Return standardized response
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
      this.logger.error(
        {
          duration,
          error: error instanceof Error ? error.message : String(error),
          maxTokens: samplingRequest.maxTokens,
          messageCount: samplingRequest.messages.length,
        },
        'Sampling request failed',
      );

      if (error instanceof Error) {
        error.message = `Sampling failed: ${error.message}`;
      }
      throw error;
    }
  }

  async getPrompt(name: string, args?: Record<string, unknown>): Promise<PromptWithMessages> {
    this.logger.debug(
      {
        name,
        hasArgs: !!args,
        argCount: args ? Object.keys(args).length : 0,
      },
      'Requesting prompt',
    );

    if (!this.promptRegistry) {
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
      const result = await this.promptRegistry.getPromptWithMessages(name, args);
      this.logger.debug(
        {
          name,
          messageCount: result.messages.length,
        },
        'Prompt retrieved successfully',
      );

      return result;
    } catch (error) {
      this.logger.error(
        {
          name,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to retrieve prompt',
      );

      if (error instanceof Error) {
        error.message = `getPrompt failed for '${name}': ${error.message}`;
      }
      throw error;
    }
  }
}

/**
 * Factory function for backward compatibility - maintains existing API
 */
export function createToolContext(
  server: Server,
  _request: unknown,
  logger: Logger,
  signal?: AbortSignal,
  progress?: ProgressReporter,
  config: Partial<ToolContextConfig> = {},
  promptRegistry?: PromptRegistry,
  sessionManager?: SessionManager,
): ToolContext {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  return new SimpleToolContext(
    server,
    logger,
    promptRegistry,
    signal,
    progress,
    finalConfig,
    sessionManager,
  );
}

/**
 * Helper to create ToolContext with progress token extraction
 */
export function createToolContextWithProgress(
  server: Server,
  request: unknown,
  logger: Logger,
  signal?: AbortSignal,
  config?: Partial<ToolContextConfig>,
  promptRegistry?: PromptRegistry,
  sessionManager?: SessionManager,
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
    sessionManager,
  );
}
