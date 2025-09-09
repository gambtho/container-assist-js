/**
 * Context Compatibility Layer
 *
 * Provides adapter functions to help migrate from old context types to the new
 * unified ToolContext interface. This enables gradual migration without breaking
 * existing tools.
 */

import type { Logger } from 'pino';
import type {
  ToolContext,
  ServiceContainer,
  ToolContextOptions,
} from '../../domain/types/tool-context';

// Import legacy types for adaptation
import type { ToolContext as MCPToolContext } from '../../mcp/context/types';
import type { ToolContext as LegacyToolContext } from '../../tools/types';
import type { ExtendedToolContext as LegacyExtendedToolContext } from '../../tools/shared-types';

/**
 * Adapts legacy MCP ToolContext to unified ToolContext
 * @deprecated - Use unified ToolContext directly
 */
export function adaptMCPContext(
  mcpContext: MCPToolContext,
  logger: Logger,
  options: Partial<ToolContextOptions> = {},
): ToolContext {
  return {
    logger,
    sampling: mcpContext.sampling
      ? {
          createMessage: mcpContext.sampling.createMessage.bind(mcpContext.sampling),
        }
      : undefined,
    prompts: mcpContext.getPrompt
      ? {
          getPrompt: mcpContext.getPrompt.bind(mcpContext),
        }
      : undefined,
    abortSignal: mcpContext.signal || options.abortSignal,
    progressReporter: mcpContext.progress || options.progressReporter,
    progressToken: options.progressToken,
    config: options.config,
  };
}

/**
 * Adapts legacy tool ToolContext to unified ToolContext
 * @deprecated - Use unified ToolContext directly
 */
export function adaptLegacyToolContext(
  legacyContext: LegacyToolContext,
  fallbackLogger: Logger,
): ToolContext {
  return {
    logger: legacyContext.logger || fallbackLogger,
    sessionManager: legacyContext.sessionManager,
    prompts: legacyContext.promptRegistry
      ? {
          getPrompt: async (name: string, args?: Record<string, unknown>) => {
            // Adapt PromptRegistry to PromptService interface
            const prompt = await legacyContext.promptRegistry!.getPrompt(name, args);
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
    abortSignal: legacyContext.abortSignal,
    progressToken: legacyContext.progressToken,
    server: legacyContext.server,
    config: {
      debug: false,
      timeout: 30000,
      maxTokens: 2048,
    },
  };
}

/**
 * Adapts ExtendedToolContext (union type) to unified ToolContext
 * @deprecated - Use unified ToolContext directly
 */
export function adaptExtendedToolContext(
  extendedContext: LegacyExtendedToolContext,
  fallbackLogger: Logger,
): ToolContext {
  // Handle undefined case
  if (!extendedContext) {
    return {
      logger: fallbackLogger,
      config: {
        debug: false,
        timeout: 30000,
        maxTokens: 2048,
      },
    };
  }

  // Handle sessionManager-only case
  if ('sessionManager' in extendedContext && !('sampling' in extendedContext)) {
    return {
      logger: fallbackLogger,
      sessionManager: extendedContext.sessionManager,
      config: {
        debug: false,
        timeout: 30000,
        maxTokens: 2048,
      },
    };
  }

  // Handle full ToolContext case (MCP context)
  if ('sampling' in extendedContext) {
    return adaptMCPContext(extendedContext as MCPToolContext, fallbackLogger);
  }

  // Handle legacy tool context case
  if ('logger' in extendedContext || 'abortSignal' in extendedContext) {
    return adaptLegacyToolContext(extendedContext as LegacyToolContext, fallbackLogger);
  }

  // Default fallback
  return {
    logger: fallbackLogger,
    sessionManager:
      'sessionManager' in extendedContext ? extendedContext.sessionManager : undefined,
    config: {
      debug: false,
      timeout: 30000,
      maxTokens: 2048,
    },
  };
}

/**
 * Creates a unified ToolContext from a service container
 * This is the preferred way to create new contexts going forward
 */
export function createUnifiedToolContext(
  services: ServiceContainer,
  options: ToolContextOptions = {},
): ToolContext {
  return {
    logger: services.logger,
    sampling: services.sampling,
    prompts: services.prompts,
    sessionManager: services.sessionManager,
    docker: services.docker,
    kubernetes: services.kubernetes,
    resourceManager: services.resourceManager,
    server: services.server,
    abortSignal: options.abortSignal,
    progressReporter: options.progressReporter,
    progressToken: options.progressToken,
    config: {
      debug: false,
      timeout: 30000,
      maxTokens: 2048,
      ...options.config,
    },
  };
}

/**
 * Type guard to check if a context is the new unified ToolContext
 */
export function isUnifiedToolContext(context: unknown): context is ToolContext {
  return (
    typeof context === 'object' &&
    context !== null &&
    'logger' in context &&
    typeof (context as any).logger === 'object'
  );
}

/**
 * Migration helper: ensures any context type becomes a unified ToolContext
 */
export function ensureUnifiedContext(
  context: LegacyExtendedToolContext | ToolContext | unknown,
  fallbackLogger: Logger,
): ToolContext {
  if (isUnifiedToolContext(context)) {
    return context;
  }

  if (!context) {
    return createUnifiedToolContext({ logger: fallbackLogger });
  }

  return adaptExtendedToolContext(context as LegacyExtendedToolContext, fallbackLogger);
}

/**
 * Temporary bridge function for tools that need to work with both old and new contexts
 * @deprecated - Remove after migration is complete
 */
export function contextBridge(
  contextOrLogger: LegacyExtendedToolContext | ToolContext | Logger,
  fallbackLogger?: Logger,
): ToolContext {
  // If it's already a unified context, return as-is
  if (isUnifiedToolContext(contextOrLogger)) {
    return contextOrLogger;
  }

  // If it's a logger, create minimal context
  if (typeof contextOrLogger === 'object' && contextOrLogger && 'info' in contextOrLogger) {
    return createUnifiedToolContext({ logger: contextOrLogger as Logger });
  }

  // Use fallback logger if provided
  const logger = fallbackLogger || (console as any);

  return ensureUnifiedContext(contextOrLogger, logger);
}
