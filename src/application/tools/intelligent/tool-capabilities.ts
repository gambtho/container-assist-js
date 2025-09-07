/**
 * Tool Enhancement Functions
 *
 * Provides functional composition patterns for enhancing tools
 * instead of using wrapper classes or inheritance.
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../../../types/core.js';
import { CancelledError } from '../../../mcp/errors.js';
import type { ToolContext } from '../../../mcp/server-extensions.js';
import { pipe } from '../../../lib/composition.js';
import type { Tool as BaseTool } from '../../../types/tools.js';
import type {
  AIService,
  SessionManager,
  MetricsCollector,
  ToolParameters,
  ToolResult,
} from '../../../types/ai-service.js';
import type { AIEnhancementService } from '../../ai/enhancement-service.js';

// Extended Tool interface for intelligent capabilities
export interface Tool extends BaseTool {
  description: string; // Make description required for intelligent tools
  execute: (params: ToolParameters, logger: Logger) => Promise<Result<ToolResult>>;
}

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
      if (params.sessionId && aiService) {
        const toolHistory = (await sessionManager?.getToolHistory(params.sessionId)) || [];
        const validation = await aiService.validateParameters(tool.name, params, {
          sessionId: params.sessionId,
          toolHistory,
        });

        if (!validation.ok) {
          return Failure(`Parameter validation failed: ${validation.error}`);
        }

        // Log warnings
        if (validation.value.warnings && validation.value.warnings.length > 0) {
          logger.warn(
            {
              tool: tool.name,
              warnings: validation.value.warnings,
            },
            'Parameter validation warnings',
          );
        }

        // Apply optimizations if suggested
        if (validation.value.suggestions && validation.value.suggestions.length > 0) {
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
 * Add AI result analysis to a tool (Legacy - for backward compatibility)
 */
export function withAIAnalysis(aiService: AIService, sessionManager: SessionManager) {
  return <T extends Tool>(tool: T): T => ({
    ...tool,
    execute: async (params: ToolParameters, logger: Logger) => {
      const result = await tool.execute(params, logger);

      if (!result.ok || !params.sessionId || !aiService) {
        return result;
      }

      // Analyze results with AI
      const sessionState = await sessionManager?.getState(params.sessionId);
      const analysis = await aiService.analyzeResults({
        toolName: tool.name,
        parameters: params,
        result: result.value,
        sessionId: params.sessionId,
        context: sessionState,
      });

      if (analysis.ok) {
        // Store in session history
        await sessionManager?.addToolExecution(params.sessionId, {
          toolName: tool.name,
          parameters: params,
          result: result.value,
          timestamp: new Date().toISOString(),
          context: {
            insights: analysis.value.insights,
            recommendations: analysis.value.nextSteps,
          },
        });

        // Return enhanced result
        return Success({
          ...result.value,
          aiInsights: analysis.value.insights,
          recommendations: analysis.value.nextSteps,
          metadata: {
            ...result.value.metadata,
            aiAnalyzed: true,
          },
        });
      }

      return result;
    },
  });
}

/**
 * Add centralized AI enhancement to a tool (Modern - using centralized service)
 */
export function withCentralizedAI(aiEnhancementService: AIEnhancementService) {
  return <T extends Tool>(tool: T): T => ({
    ...tool,
    execute: async (params: ToolParameters, logger: Logger) => {
      const result = await tool.execute(params, logger);

      // Only enhance successful results when AI is requested
      if (!result.ok || params.enableAI === false || !aiEnhancementService.isAvailable()) {
        return result;
      }

      try {
        const enhancementResult = await aiEnhancementService.enhanceTool(tool.name, result.value, {
          metadata: (params.context || {}) as Record<string, unknown>,
          requirements: {
            securityLevel: params.securityLevel as any,
            optimization: params.optimization as any,
            environment: params.environment as any,
          },
        });

        if (enhancementResult.ok && enhancementResult.value.enhanced) {
          const enhancement = enhancementResult.value;

          return Success({
            ...result.value,
            aiInsights: enhancement.insights,
            aiRecommendations: enhancement.recommendations,
            aiWarnings: enhancement.warnings,
            metadata: {
              ...result.value.metadata,
              aiEnhanced: true,
              aiProvider: enhancement.metadata.aiProvider,
              enhancementType: enhancement.metadata.enhancementType,
              processingTime: enhancement.metadata.processingTime,
              confidence: enhancement.metadata.confidence,
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
          return Success({
            ...result.value,
            metadata: {
              ...result.value.metadata,
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
      await sessionManager.trackToolStart(sessionId, tool.name, params);

      try {
        const result = await tool.execute(params, logger);

        // Track execution end
        await sessionManager.trackToolEnd(sessionId, tool.name, result);

        if (result.ok) {
          return Success({
            ...result.value,
            metadata: {
              ...result.value.metadata,
              sessionTracked: true,
            },
          });
        }

        return result;
      } catch (error) {
        // Track execution error
        await sessionManager.trackToolError(sessionId, tool.name, error);
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
        throw new CancelledError();
      }

      // Set up cancellation listener
      const checkCancellation = (): void => {
        if (signal?.aborted) {
          throw new CancelledError();
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
  return (tool: T) => enhancers.reduce((enhanced, enhancer) => enhancer(enhanced), tool);
}

/**
 * Create enhanced tool with basic logging and session tracking
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
 * Create AI-enhanced tool with validation and analysis
 */
export const enhanceForAI = <T extends Tool>(
  tool: T,
  aiService: AIService,
  sessionManager: SessionManager,
  logger: Logger,
): T => {
  return pipe(
    withLogging(logger),
    withSessionTracking(sessionManager),
    withAIValidation(aiService, sessionManager),
    withAIAnalysis(aiService, sessionManager),
  )(tool);
};

/**
 * Create production-ready tool with all enhancements (Legacy)
 */
export const enhanceForProduction = <T extends Tool>(
  tool: T,
  logger: Logger,
  metricsCollector?: MetricsCollector,
  retry?: { attempts?: number; delay?: number; backoff?: boolean },
): T => {
  const enhancers = [withLogging(logger)];

  if (metricsCollector) {
    enhancers.push(withMetrics(metricsCollector));
  }

  if (retry) {
    enhancers.push(withRetry(retry));
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
    aiEnhancementService?: AIEnhancementService;
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
  if (config.aiEnhancementService) {
    enhancers.push(withCentralizedAI(config.aiEnhancementService));
  }

  return pipe(...enhancers)(tool);
};

/**
 * Create enhanced tool with all modern capabilities
 */
export const createEnhancedTool = <T extends Tool>(
  baseTool: T,
  config: {
    logger: Logger;
    aiEnhancementService?: AIEnhancementService;
    metricsCollector?: MetricsCollector;
    sessionManager?: SessionManager;
    enableRetry?: boolean;
    enableProgressReporting?: boolean;
    enableCancellation?: boolean;
  },
): T => {
  let enhanced = baseTool;

  // Apply enhancements in order
  enhanced = pipe(
    withLogging(config.logger),
    ...(config.metricsCollector ? [withMetrics(config.metricsCollector)] : []),
    ...(config.enableRetry ? [withRetry({ attempts: 3, delay: 1000, backoff: true })] : []),
    ...(config.sessionManager ? [withSessionTracking(config.sessionManager)] : []),
    ...(config.aiEnhancementService ? [withCentralizedAI(config.aiEnhancementService)] : []),
  )(enhanced);

  // Apply intelligent tool enhancements if requested
  if (config.enableProgressReporting || config.enableCancellation) {
    const intelligentTool = enhanced as IntelligentTool;

    if (config.enableProgressReporting) {
      enhanced = withProgressReporting()(intelligentTool) as T;
    }

    if (config.enableCancellation) {
      enhanced = withCancellation()(intelligentTool) as T;
    }
  }

  return enhanced;
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
