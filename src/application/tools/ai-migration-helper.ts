/**
 * AI Migration Helper
 * Utilities to help migrate tools from direct MCPSampler usage to Enhanced AI Service
 */

import type { Logger } from 'pino';
import { AIRequestBuilder } from '../../infrastructure/ai-request-builder';
import {
  EnhancedAIService,
  createEnhancedAIService,
  type EnhancedAIConfig,
  type GenerationOptions
} from '../../infrastructure/enhanced-ai-service';
import type { MCPSampler } from '../../infrastructure/ai/mcp-sampler';
import type { ToolContext, MCPToolContext } from './tool-types';

/**
 * Get or create Enhanced AI Service from context
 */
export function getEnhancedAIService(
  context: ToolContext | MCPToolContext
): EnhancedAIService | undefined {
  // If already has Enhanced AI Service, use it
  if (context.aiService) {
    return context.aiService;
  }

  // If has MCPSampler, create Enhanced AI Service
  if (context.mcpSampler) {
    const config: EnhancedAIConfig = {
      modelPreferences: {
        default: 'claude-3-opus',
        dockerfile: 'claude-3-opus',
        kubernetes: 'claude-3-opus',
        analysis: 'claude-3-opus'
      },
      defaultSampling: {
        temperature: 0.2,
        maxTokens: 1500
      },
      cache: {
        enabled: true,
        defaultTtlMs: 15 * 60 * 1000
      },
      enableMetrics: true
    };

    return createEnhancedAIService(config, context.mcpSampler, context.logger);
  }

  return undefined;
}

/**
 * Migration wrapper for AI generation with fallback
 * Helps tools migrate from mcpSampler.sample() to Enhanced AI Service
 */
export async function generateWithAI<T = string>(
  context: ToolContext | MCPToolContext,
  templateId: string,
  variables: Record<string, any>,
  options: GenerationOptions = {}
): Promise<T | null> {
  const aiService = getEnhancedAIService(context);

  if (!aiService) {
    context.logger.warn('No AI service available for generation');
    return null;
  }

  try {
    // Build request using AIRequestBuilder
    const builder = AIRequestBuilder.for(templateId as unknown).withVariables(variables);

    // Apply options
    if (options.temperature !== undefined) {
      builder.withSampling(options.temperature);
    }
    if (options.maxTokens !== undefined) {
      builder.withSampling(undefined, options.maxTokens);
    }
    if (options.complexity) {
      builder.withComplexity(options.complexity);
    }
    if (options.timeConstraint != null) {
      builder.withTimeConstraint(options.timeConstraint);
    }

    // Generate using Enhanced AI Service
    const result = await aiService.generate<T>(builder, options);

    // Log metrics if available
    if (result.metadata.tokensUsed) {
      context.logger.debug(
        {
          templateId,
          tokensUsed: result.metadata.tokensUsed,
          durationMs: result.metadata.durationMs,
          fromCache: result.metadata.fromCache
        },
        'AI generation completed'
      );
    }

    return result.data;
  } catch (error) {
    context.logger.error(
      {
        templateId,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      'AI generation failed'
    );
    return null;
  }
}

/**
 * Parse AI response safely
 * Helper for migrating from direct response.content parsing
 */
export function parseAIResponse<T = any>(response: unknown, logger: Logger): T | null {
  try {
    // Handle string responses
    if (typeof response === 'string') {
      try {
        return JSON.parse(response) as T;
      } catch {
        // If not JSON, return as-is
        return response as T;
      }
    }

    // Handle object responses
    if (response && typeof response === 'object') {
      return response as T;
    }

    return null;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      'Failed to parse AI response'
    );
    return null;
  }
}

/**
 * Create a fallback Enhanced AI Service for tools that don't have one in context
 * This ensures backward compatibility during migration
 */
export function createFallbackAIService(
  mcpSampler: MCPSampler | undefined,
  logger: Logger
): EnhancedAIService {
  return createEnhancedAIService(
    {
      modelPreferences: {
        default: 'claude-3-opus'
      },
      defaultSampling: {
        temperature: 0.2,
        maxTokens: 1500
      },
      cache: {
        enabled: true
      },
      enableMetrics: false // Disable metrics for fallback service
    },
    mcpSampler,
    logger
  );
}

/**
 * Check if AI is available in the context
 */
export function isAIAvailable(context: ToolContext | MCPToolContext): boolean {
  return !!(context.aiService?.isAvailable() || context.mcpSampler);
}

/**
 * Migration decorator for tool handlers
 * Automatically provides Enhanced AI Service if not present
 */
export function withEnhancedAI<T extends ToolContext | MCPToolContext>(
  handler: (context: T) => Promise<any>
): (context: T) => Promise<any> {
  return async (context: T) => {
    // If no AI service but has sampler, create one
    if (!context.aiService && context.mcpSampler) {
      (context as unknown).aiService = createFallbackAIService(context.mcpSampler, context.logger);
    }

    return handler(context);
  };
}
