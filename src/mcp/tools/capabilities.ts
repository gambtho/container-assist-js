/**
 * Tool Enhancement Functions
 *
 * Provides functional composition patterns for enhancing tools
 * instead of using wrapper classes or inheritance.
 */

import type { Logger } from 'pino';
import {
  Success,
  Failure,
  type Result,
  type Tool,
  type AIService,
  type SessionManager,
  type MetricsCollector,
  type ToolParameters,
  type ToolResult,
} from '@types';
// CancelledError is now defined inline
class CancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CancelledError';
  }
}
import type { ToolContext } from '@mcp/server/middleware';
import { pipe } from '@lib/composition';
import type { AIAugmentationService } from '@lib/ai/ai-service';

export interface IntelligentTool extends Tool {
  executeEnhanced?: (params: ToolParameters, context: ToolContext) => Promise<Result<ToolResult>>;
}

/**
 * Add AI validation to a tool
 */
export function withAIValidation(aiService: AIService, sessionManager: SessionManager) {
  return <T extends Tool>(tool: T): T => ({
    ...tool,
    execute: async (params: ToolParameters, logger: Logger) => {
      // Pre-execution validation if session is available
      if (params.sessionId && aiService && sessionManager) {
        const validation = await aiService.validateParameters?.(params);

        if (validation && !validation.ok) {
          return Failure(`Parameter validation failed: ${validation.error}`);
        }

        // Log warnings
        if (validation?.value.warnings && validation.value.warnings.length > 0) {
          logger.warn(
            {
              tool: tool.name,
              warnings: validation.value.warnings,
            },
            'Parameter validation warnings',
          );
        }

        // Apply optimizations if suggested
        if (validation?.value.suggestions && validation.value.suggestions.length > 0) {
          params = applyOptimizations(params, validation.value.suggestions);
          logger.info(
            {
              tool: tool.name,
              suggestions: validation.value.suggestions,
            },
            'Applied AI parameter optimizations',
          );
        }
      }

      // Execute original tool
      return tool.execute(params, logger);
    },
  });
}

/**
 * Add centralized AI enhancement to a tool (Modern - using centralized service)
 */
export function withCentralizedAI(aiAugmentationService: AIAugmentationService) {
  return <T extends Tool>(tool: T): T => ({
    ...tool,
    execute: async (params: ToolParameters, logger: Logger) => {
      const result = await tool.execute(params, logger);

      // Only enhance successful results when AI is requested
      if (!result.ok || params.enableAI === false || !aiAugmentationService.isAvailable()) {
        return result;
      }

      try {
        const enhancementResult = await aiAugmentationService.augmentTool(tool.name, result.value, {
          metadata: (params.context || {}) as Record<string, unknown>,
          requirements: {
            securityLevel: params.securityLevel as any,
            optimization: params.optimization as any,
            environment: params.environment as any,
          },
        });

        if (enhancementResult.ok && enhancementResult.value.augmented) {
          const aiResult = enhancementResult.value;

          const toolResult = result.value as any;
          return Success({
            ...toolResult,
            aiInsights: aiResult.insights,
            aiRecommendations: aiResult.recommendations,
            aiWarnings: aiResult.warnings,
            metadata: {
              ...toolResult.metadata,
              aiEnhanced: true,
              aiProvider: aiResult.metadata.aiProvider,
              augmentationType: aiResult.metadata.augmentationType,
              processingTime: aiResult.metadata.processingTime,
              confidence: aiResult.metadata.confidence,
            },
          });
        }
      } catch (error) {
        logger.warn({ tool: tool.name, error }, 'Centralized AI enhancement failed');
      }

      return result;
    },
  });
}

/**
 * Add metrics tracking to a tool
 */
export function withMetrics(metricsCollector?: MetricsCollector) {
  return <T extends Tool>(tool: T): T => ({
    ...tool,
    execute: async (params: ToolParameters, logger: Logger) => {
      const startTime = Date.now();

      try {
        const result = await tool.execute(params, logger);
        const duration = Date.now() - startTime;

        metricsCollector?.recordToolExecution(tool.name, duration, result.ok);

        logger.info(
          {
            tool: tool.name,
            duration_ms: duration,
            success: result.ok,
          },
          `Tool ${tool.name} executed in ${duration}ms`,
        );

        if (result.ok) {
          const toolResult = result.value as any;
          return Success({
            ...toolResult,
            metadata: {
              ...toolResult.metadata,
              executionTime: duration,
            },
          });
        }

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        metricsCollector?.recordToolExecution(tool.name, duration, false);
        throw error;
      }
    },
  });
}

/**
 * Add retry logic to a tool
 */
export function withRetry(
  options: { attempts?: number; delay?: number; backoff?: boolean } = {},
): <T extends Tool>(tool: T) => T {
  const { attempts = 3, delay = 1000, backoff = true } = options;

  return <T extends Tool>(tool: T): T => ({
    ...tool,
    execute: async (params: ToolParameters, logger: Logger) => {
      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await tool.execute(params, logger);
        } catch (error) {
          lastError = error as Error;

          if (attempt < attempts) {
            const waitTime = backoff ? delay * attempt : delay;
            logger.warn(
              {
                tool: tool.name,
                attempt,
                maxAttempts: attempts,
                nextRetryIn: waitTime,
                error: lastError.message,
              },
              `Tool execution failed, retrying in ${waitTime}ms`,
            );

            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }
      }

      return Failure(`Tool execution failed after ${attempts} attempts: ${lastError?.message}`);
    },
  });
}

/**
 * Add logging enhancement to a tool
 */
export function withLogging(logger: Logger) {
  return <T extends Tool>(tool: T): T => ({
    ...tool,
    execute: async (params: ToolParameters, _logger: Logger) => {
      logger.debug({ tool: tool.name, params }, `Executing tool: ${tool.name}`);

      try {
        const result = await tool.execute(params, logger);

        if (result.ok) {
          logger.info(
            { tool: tool.name, success: true },
            `Tool executed successfully: ${tool.name}`,
          );
        } else {
          logger.warn(
            { tool: tool.name, error: result.error },
            `Tool execution failed: ${tool.name}`,
          );
        }

        return result;
      } catch (error) {
        logger.error({ tool: tool.name, error }, `Tool execution threw error: ${tool.name}`);
        throw error;
      }
    },
  });
}

/**
 * Add session tracking to a tool
 */
export function withSessionTracking(sessionManager: SessionManager) {
  return <T extends Tool>(tool: T): T => ({
    ...tool,
    execute: async (params: ToolParameters, logger: Logger) => {
      const sessionId = params.sessionId;

      if (!sessionId || !sessionManager) {
        return tool.execute(params, logger);
      }

      // Track execution start
      await sessionManager?.trackToolStart?.(sessionId, tool.name);

      try {
        const result = await tool.execute(params, logger);

        // Track execution end
        await sessionManager?.trackToolEnd?.(sessionId, tool.name, result);

        if (result.ok) {
          const toolResult = result.value as any;
          return Success({
            ...toolResult,
            metadata: {
              ...toolResult.metadata,
              sessionTracked: true,
            },
          });
        }

        return result;
      } catch (error) {
        // Track execution error
        await sessionManager?.trackToolError?.(
          sessionId,
          tool.name,
          error instanceof Error ? error : new Error(String(error)),
        );
        throw error;
      }
    },
  });
}

/**
 * Add progress reporting to a tool
 */
export function withProgressReporting() {
  return <T extends IntelligentTool>(tool: T): T => ({
    ...tool,
    executeEnhanced: async (params: ToolParameters, context: ToolContext) => {
      const { progressReporter } = context;

      void progressReporter?.({ progress: 0 });
      void progressReporter?.({ progress: 30 });

      const result = tool.executeEnhanced
        ? await tool.executeEnhanced(params, context)
        : await tool.execute(params, context.logger);

      void progressReporter?.({ progress: 100 });

      return result;
    },
  });
}

/**
 * Add cancellation support to a tool
 */
export function withCancellation() {
  return <T extends IntelligentTool>(tool: T): T => ({
    ...tool,
    executeEnhanced: async (params: ToolParameters, context: ToolContext) => {
      const { signal } = context;

      // Check if already cancelled
      if (signal?.aborted) {
        throw new CancelledError('Tool cancelled');
      }

      // Set up cancellation listener
      const checkCancellation = (): void => {
        if (signal?.aborted) {
          throw new CancelledError('Tool cancelled');
        }
      };

      // Check periodically during execution
      const interval = setInterval(checkCancellation, 100);

      try {
        const result = tool.executeEnhanced
          ? await tool.executeEnhanced(params, context)
          : await tool.execute(params, context.logger);

        return result;
      } finally {
        clearInterval(interval);
      }
    },
  });
}

/**
 * Compose multiple enhancers into a single enhancer
 */
export function composeEnhancers<T extends Tool>(
  ...enhancers: Array<(tool: T) => T>
): (tool: T) => T {
  return (tool: T) => enhancers.reduce((current, enhancer) => enhancer(current), tool);
}

/**
 * Create tool with basic logging and session tracking
 */
export const enhanceWithDefaults = <T extends Tool>(
  tool: T,
  logger: Logger,
  sessionManager?: SessionManager,
): T => {
  const enhancers = [withLogging(logger)];

  if (sessionManager) {
    enhancers.push(withSessionTracking(sessionManager));
  }

  return pipe(...enhancers)(tool);
};

/**
 * Create standardized production tool with centralized AI enhancement
 */
export const createProductionTool = <T extends Tool>(
  tool: T,
  config: {
    logger: Logger;
    aiAugmentationService?: AIAugmentationService;
    metricsCollector?: MetricsCollector;
    sessionManager?: SessionManager;
    retry?: { attempts?: number; delay?: number; backoff?: boolean };
  },
): T => {
  const enhancers = [withLogging(config.logger)];

  // Add metrics if available
  if (config.metricsCollector) {
    enhancers.push(withMetrics(config.metricsCollector));
  }

  // Add retry with default settings
  const retryConfig = config.retry || { attempts: 3, delay: 1000, backoff: true };
  enhancers.push(withRetry(retryConfig));

  // Add session tracking if available
  if (config.sessionManager) {
    enhancers.push(withSessionTracking(config.sessionManager));
  }

  // Add centralized AI enhancement if available
  if (config.aiAugmentationService) {
    enhancers.push(withCentralizedAI(config.aiAugmentationService));
  }

  return pipe(...enhancers)(tool);
};

/**
 * Create tool with all modern capabilities
 */
export const createModernTool = <T extends Tool>(
  baseTool: T,
  config: {
    logger: Logger;
    aiAugmentationService?: AIAugmentationService;
    metricsCollector?: MetricsCollector;
    sessionManager?: SessionManager;
    enableRetry?: boolean;
    enableProgressReporting?: boolean;
    enableCancellation?: boolean;
  },
): T => {
  let tool = baseTool;

  // Apply capabilities in order
  tool = pipe(
    withLogging(config.logger),
    ...(config.metricsCollector ? [withMetrics(config.metricsCollector)] : []),
    ...(config.enableRetry ? [withRetry({ attempts: 3, delay: 1000, backoff: true })] : []),
    ...(config.sessionManager ? [withSessionTracking(config.sessionManager)] : []),
    ...(config.aiAugmentationService ? [withCentralizedAI(config.aiAugmentationService)] : []),
  )(tool);

  // Apply intelligent tool capabilities if requested
  if (config.enableProgressReporting || config.enableCancellation) {
    const intelligentTool = tool as IntelligentTool;

    if (config.enableProgressReporting) {
      tool = withProgressReporting()(intelligentTool) as T;
    }

    if (config.enableCancellation) {
      tool = withCancellation()(intelligentTool) as T;
    }
  }

  return tool;
};

// Helper functions
function applyOptimizations(params: ToolParameters, suggestions: string[]): ToolParameters {
  const optimized = { ...params };

  suggestions.forEach((suggestion) => {
    if (suggestion.includes('base image') && !params.baseImage) {
      const match = suggestion.match(/using ([\w:.-]+)/);
      if (match) optimized.baseImage = match[1];
    }
    if (suggestion.includes('context path') && !params.contextPath) {
      optimized.contextPath = '.';
    }
    if (suggestion.includes('severity threshold') && !params.severity) {
      optimized.severity = 'MEDIUM';
    }
    if (suggestion.includes('semantic version') && !params.tags) {
      optimized.tags = ['latest'];
    }
  });

  return optimized;
}
