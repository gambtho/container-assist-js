/**
 * Simplified ToolContext Bridge Implementation
 *
 * This is the simplified replacement for the complex bridge.ts file.
 * It reduces complexity from 310 lines to ~50 lines while maintaining
 * all necessary functionality and MCP protocol compliance.
 *
 * Key improvements:
 * - Direct property assignment instead of complex mapping
 * - Unified ToolContext interface instead of multiple types
 * - Simplified error handling
 * - Minimal configuration
 * - Clear service injection pattern
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Logger } from 'pino';
import type {
  ToolContext,
  ServiceContainer,
  ToolContextOptions,
  SamplingRequest,
  SamplingResponse,
  SamplingService,
  ProgressReporter,
} from '../../domain/types/tool-context';

/**
 * Creates a unified ToolContext with minimal complexity
 *
 * This replaces the complex createToolContext function with a simple,
 * direct approach that focuses on essential functionality.
 */
export function createUnifiedToolContext(
  services: ServiceContainer,
  options: ToolContextOptions = {},
): ToolContext {
  const { logger } = services;

  const context: ToolContext = {
    logger,
    config: {
      debug: false,
      timeout: 30000,
      maxTokens: 2048,
      workingDirectory: process.cwd(),
      ...options.config,
    },
  };

  // Only assign properties that have values
  const samplingService = services.sampling || createMCPSamplingService(services.server, logger);
  if (samplingService) {
    context.sampling = samplingService;
  }

  if (services.prompts) {
    context.prompts = services.prompts;
  }

  if (services.sessionManager) {
    context.sessionManager = services.sessionManager;
  }

  if (services.docker) {
    context.docker = services.docker;
  }

  if (services.kubernetes) {
    context.kubernetes = services.kubernetes;
  }

  if (services.resourceManager) {
    context.resourceManager = services.resourceManager;
  }

  if (options.abortSignal) {
    context.abortSignal = options.abortSignal;
  }

  if (options.progressReporter) {
    context.progressReporter = options.progressReporter;
  }

  if (services.server) {
    context.server = services.server;
  }

  if (options.progressToken) {
    context.progressToken = options.progressToken;
  }

  return context;
}

/**
 * Creates an MCP-compatible sampling service
 * Simplified version of the complex sampling logic from the original bridge
 */
function createMCPSamplingService(
  server: Server | undefined,
  logger: Logger,
): SamplingService | undefined {
  if (!server) {
    return undefined;
  }

  return {
    async createMessage(request: SamplingRequest): Promise<SamplingResponse> {
      try {
        // Convert unified format to MCP SDK format
        const sdkMessages = request.messages.map((msg) => ({
          role: msg.role,
          content: {
            type: 'text' as const,
            text: msg.content.map((c) => c.text).join('\n'),
          },
        }));

        // Make MCP request with defaults
        const response = await server.createMessage({
          maxTokens: request.maxTokens || 2048,
          stopSequences: request.stopSequences || [],
          includeContext: request.includeContext || 'thisServer',
          messages: sdkMessages,
          modelPreferences: request.modelPreferences,
        });

        // Validate response
        if (!response?.content || response.content.type !== 'text') {
          throw new Error('Invalid response from MCP sampling service');
        }

        const text = response.content.text.trim();
        if (!text) {
          throw new Error('Empty response from MCP sampling service');
        }

        // Return standardized response
        return {
          role: 'assistant',
          content: [{ type: 'text', text }],
          metadata: {
            model: (response as any)?.model,
            usage: (response as any)?.usage,
            finishReason: (response as any)?.finishReason || 'stop',
          },
        };
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Sampling failed',
        );
        throw error;
      }
    },
  };
}

/**
 * Legacy bridge compatibility function
 * Allows gradual migration from old bridge to new simplified bridge
 */
export function createLegacyCompatibleContext(
  server: Server,
  request: unknown,
  logger: Logger,
  signal?: AbortSignal,
  progress?: ProgressReporter,
): ToolContext {
  // Extract progress token from request (simplified version)
  const progressToken = extractProgressToken(request);

  const services: ServiceContainer = {
    logger,
    server,
  };

  const options: ToolContextOptions = {
    abortSignal: signal,
    progressReporter: progress,
    progressToken,
  };

  return createUnifiedToolContext(services, options);
}

/**
 * Simple progress token extraction
 * Simplified version of the complex extraction from original bridge
 */
function extractProgressToken(request: unknown): string | undefined {
  try {
    if (
      request &&
      typeof request === 'object' &&
      'params' in request &&
      request.params &&
      typeof request.params === 'object' &&
      '_meta' in request.params &&
      request.params._meta &&
      typeof request.params._meta === 'object' &&
      'progressToken' in request.params._meta
    ) {
      const token = (request.params._meta as any).progressToken;
      return typeof token === 'string' ? token : undefined;
    }
  } catch {
    // Ignore extraction errors
  }
  return undefined;
}

/**
 * Service container factory for common service combinations
 * Helps create service containers for different scenarios
 */
export function createServiceContainer(config: {
  logger: Logger;
  server?: Server;
  sessionManager?: import('../../lib/session').SessionManager;
  promptRegistry?: import('../../prompts/prompt-registry').PromptRegistry;
}): ServiceContainer {
  return {
    logger: config.logger,
    server: config.server,
    sessionManager: config.sessionManager,
    // Convert PromptRegistry to PromptService if available
    prompts: config.promptRegistry
      ? {
          async getPrompt(name: string, args?: Record<string, unknown>) {
            const prompt = await config.promptRegistry!.getPrompt(name, args);
            return {
              description: `Prompt: ${name}`,
              messages: [
                {
                  role: 'user' as const,
                  content: [{ type: 'text' as const, text: prompt }],
                },
              ],
            };
          },
        }
      : undefined,
  };
}

/**
 * Type guard to check if we're using the new unified context
 */
export function isUnifiedContext(context: unknown): context is ToolContext {
  return (
    context != null &&
    typeof context === 'object' &&
    'logger' in context &&
    typeof (context as any).logger?.info === 'function'
  );
}
