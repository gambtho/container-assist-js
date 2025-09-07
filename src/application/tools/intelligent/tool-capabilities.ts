/**
 * Tool Enhancement Functions
 *
 * Provides functional composition patterns for enhancing tools
 * instead of using wrapper classes or inheritance.
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../../../types/core/index.js';
import { CancelledError } from '../../../mcp/errors.js';
import type { ToolContext } from '../../../mcp/server-extensions.js';
import { pipe } from '../../../lib/composition.js';

export interface Tool {
  name: string;
  description: string;
  schema?: any;
  execute: (params: any, logger: Logger) => Promise<Result<any>>;
}

export interface IntelligentTool extends Tool {
  executeEnhanced?: (params: any, context: ToolContext) => Promise<Result<any>>;
}

/**
 * Add AI validation to a tool
 */
export function withAIValidation(aiService: any, sessionManager: any) {
  return <T extends Tool>(tool: T): T => ({
    ...tool,
    execute: async (params: any, logger: Logger) => {
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
        if (validation.value.warnings?.length > 0) {
          logger.warn(
            {
              tool: tool.name,
              warnings: validation.value.warnings,
            },
            'Parameter validation warnings',
          );
        }

        // Apply optimizations if suggested
        if (validation.value.suggestions?.length > 0) {
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
 * Add AI result analysis to a tool
 */
export function withAIAnalysis(aiService: any, sessionManager: any) {
  return <T extends Tool>(tool: T): T => ({
    ...tool,
    execute: async (params: any, logger: Logger) => {
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
          insights: analysis.value.insights,
          recommendations: analysis.value.nextSteps,
          timestamp: new Date().toISOString(),
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
 * Add metrics tracking to a tool
 */
export function withMetrics(metricsCollector?: any) {
  return <T extends Tool>(tool: T): T => ({
    ...tool,
    execute: async (params: any, logger: Logger) => {
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
    execute: async (params: any, logger: Logger) => {
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
    execute: async (params: any, _logger: Logger) => {
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
export function withSessionTracking(sessionManager: any) {
  return <T extends Tool>(tool: T): T => ({
    ...tool,
    execute: async (params: any, logger: Logger) => {
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
    executeEnhanced: async (params: any, context: ToolContext) => {
      const { progressReporter } = context;

      void progressReporter?.(0, `Starting ${tool.name}...`);
      void progressReporter?.(30, `Executing ${tool.name}...`);

      const result = tool.executeEnhanced
        ? await tool.executeEnhanced(params, context)
        : await tool.execute(params, context.logger);

      void progressReporter?.(100, 'Complete');

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
    executeEnhanced: async (params: any, context: ToolContext) => {
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
 * Create a fully enhanced tool with all features
 */
export function createIntelligentTool<T extends Tool>(
  tool: T,
  options: {
    aiService?: any;
    sessionManager?: any;
    metricsCollector?: any;
    logger?: Logger;
    retry?: { attempts?: number; delay?: number; backoff?: boolean };
    enableProgress?: boolean;
    enableCancellation?: boolean;
  } = {},
): T {
  const enhancers: Array<(tool: T) => T> = [];

  // Add enhancers based on options
  if (options.logger) {
    enhancers.push(withLogging(options.logger) as any);
  }

  if (options.sessionManager) {
    enhancers.push(withSessionTracking(options.sessionManager) as any);
  }

  if (options.aiService && options.sessionManager) {
    enhancers.push(withAIValidation(options.aiService, options.sessionManager) as any);
    enhancers.push(withAIAnalysis(options.aiService, options.sessionManager) as any);
  }

  if (options.metricsCollector) {
    enhancers.push(withMetrics(options.metricsCollector) as any);
  }

  if (options.retry) {
    enhancers.push(withRetry(options.retry) as any);
  }

  // Apply all enhancers
  return pipe(...enhancers)(tool);
}

// Helper functions
function applyOptimizations(params: any, suggestions: string[]): any {
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
