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
  const context: ToolContext = { logger };
  
  if (mcpContext.sampling) {
    context.sampling = {
      createMessage: mcpContext.sampling.createMessage.bind(mcpContext.sampling),
    };
  }
  
  if (mcpContext.getPrompt) {
    context.prompts = {
      getPrompt: mcpContext.getPrompt.bind(mcpContext),
    };
  }
  
  const abortSignal = mcpContext.signal || options.abortSignal;
  if (abortSignal) {
    context.abortSignal = abortSignal;
  }
  
  const progressReporter = mcpContext.progress || options.progressReporter;
  if (progressReporter) {
    context.progressReporter = progressReporter;
  }
  
  if (options.progressToken) {
    context.progressToken = options.progressToken;
  }
  
  if (options.config) {
    context.config = options.config;
  }
  
  return context;
}

/**
 * Adapts legacy tool ToolContext to unified ToolContext
 * @deprecated - Use unified ToolContext directly
 */
export function adaptLegacyToolContext(
  legacyContext: LegacyToolContext,
  fallbackLogger: Logger,
): ToolContext {
  const context: ToolContext = {
    logger: legacyContext.logger || fallbackLogger,
    config: {
      debug: false,
      timeout: 30000,
      maxTokens: 2048,
    },
  };
  
  if (legacyContext.sessionManager) {
    context.sessionManager = legacyContext.sessionManager;
  }
  
  if (legacyContext.promptRegistry) {
    context.prompts = {
      getPrompt: async (name: string, args?: Record<string, unknown>) => {
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
    };
  }
  
  if (legacyContext.abortSignal) {
    context.abortSignal = legacyContext.abortSignal;
  }
  
  if (legacyContext.progressToken) {
    context.progressToken = legacyContext.progressToken;
  }
  
  if (legacyContext.server) {
    context.server = legacyContext.server;
  }
  
  return context;
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
  const context: ToolContext = {
    logger: fallbackLogger,
    config: {
      debug: false,
      timeout: 30000,
      maxTokens: 2048,
    },
  };
  
  if ('sessionManager' in extendedContext && extendedContext.sessionManager) {
    context.sessionManager = extendedContext.sessionManager;
  }
  
  return context;
}

/**
 * Creates a unified ToolContext from a service container
 * This is the preferred way to create new contexts going forward
 */
export function createUnifiedToolContext(
  services: ServiceContainer,
  options: ToolContextOptions = {},
): ToolContext {
  const context: ToolContext = {
    logger: services.logger,
    config: {
      debug: false,
      timeout: 30000,
      maxTokens: 2048,
      ...options.config,
    },
  };
  
  if (services.sampling) {
    context.sampling = services.sampling;
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
  
  if (services.server) {
    context.server = services.server;
  }
  
  if (options.abortSignal) {
    context.abortSignal = options.abortSignal;
  }
  
  if (options.progressReporter) {
    context.progressReporter = options.progressReporter;
  }
  
  if (options.progressToken) {
    context.progressToken = options.progressToken;
  }
  
  return context;
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
