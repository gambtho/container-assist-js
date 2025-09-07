/**
 * MCP AI Orchestrator
 *
 * Unified AI coordination using native MCP SDK patterns.
 * Consolidates all AI operations through a single interface that leverages
 * MCP Host AI capabilities and SDK-native prompt handling.
 */

import type { Logger } from 'pino';
import { Result, Success, Failure } from '../../core/types';
import {
  AIParameterValidator,
  type ValidationContext,
  type ValidationResult,
  type ParameterSuggestions,
} from '../tools/validator';
import {
  AIAugmentationService,
  type AIAugmentationContext,
  type AIAugmentationResult,
} from '../../lib/ai/ai-service';
import { SDKPromptRegistry } from '../prompts/sdk-prompt-registry';
import { createMCPHostAI, type MCPHostAI } from '../../lib/mcp-host-ai';

/**
 * AI operation types supported by the orchestrator
 */
export type AIOperationType =
  | 'validate-parameters'
  | 'suggest-parameters'
  | 'enhance-result'
  | 'analyze-context'
  | 'optimize-strategy';

/**
 * Unified AI request context using MCP patterns
 */
export interface AIOperationContext {
  operation: AIOperationType;
  toolName: string;
  targetType?: 'dockerfile' | 'kubernetes' | 'analysis' | 'general' | undefined;
  environment?: 'development' | 'staging' | 'production' | undefined;
  securityLevel?: 'basic' | 'standard' | 'strict' | undefined;
  metadata?: Record<string, unknown>;
}

/**
 * Unified AI response format
 */
export interface AIOperationResult<T = any> {
  success: boolean;
  data: T;
  aiEnhanced: boolean;
  processingTime: number;
  provider: string;
  insights: string[];
  recommendations: string[];
  warnings?: string[];
  metadata: {
    operation: AIOperationType;
    confidence: number;
    tokensUsed?: number;
    cacheHit?: boolean;
  };
}

/**
 * MCP AI Orchestrator - Central AI coordination service
 */
export class MCPAIOrchestrator {
  private logger: Logger;
  private mcpHostAI: MCPHostAI;
  private promptRegistry: SDKPromptRegistry;
  private aiAugmentationService: AIAugmentationService;
  private parameterValidator: AIParameterValidator;
  private operationCache: Map<string, { result: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    logger: Logger,
    options?: {
      promptRegistry?: SDKPromptRegistry;
      aiService?: AIAugmentationService;
      validator?: AIParameterValidator;
    },
  ) {
    this.logger = logger.child({ component: 'MCPAIOrchestrator' });

    // Initialize MCP Host AI connection
    this.mcpHostAI = createMCPHostAI(logger);

    // Initialize or use provided services
    this.promptRegistry = options?.promptRegistry || new SDKPromptRegistry(logger);
    this.aiAugmentationService =
      options?.aiService || new AIAugmentationService(this.mcpHostAI, this.promptRegistry, logger);
    this.parameterValidator = options?.validator || new AIParameterValidator(logger);

    this.logger.info(
      {
        aiAvailable: this.mcpHostAI.isAvailable(),
        hostType: this.mcpHostAI.getHostType(),
      },
      'MCP AI Orchestrator initialized',
    );
  }

  /**
   * Validate parameters using unified AI orchestration
   */
  async validateParameters(
    toolName: string,
    parameters: Record<string, any>,
    context?: ValidationContext,
  ): Promise<Result<AIOperationResult<ValidationResult>>> {
    const operationContext: AIOperationContext = {
      operation: 'validate-parameters',
      toolName,
      targetType: context?.targetType,
      environment: context?.environment,
      securityLevel: context?.securityLevel,
      metadata: { context },
    };

    return await this.processAIOperation(operationContext, async () => {
      const result = await this.parameterValidator.validateParameters(
        toolName,
        parameters,
        context,
      );

      if (result.ok) {
        return {
          success: true,
          data: result.value,
          insights:
            result.value.errors.length === 0
              ? ['Parameters validated successfully']
              : result.value.errors,
          recommendations: result.value.warnings,
        };
      }

      const errorResult: ValidationResult = {
        isValid: false,
        errors: [result.error],
        warnings: [],
        confidence: 0,
        metadata: { validationTime: 0, aiEnhanced: false, rulesApplied: [] },
      };
      return {
        success: false,
        data: errorResult,
        insights: [result.error],
        recommendations: [],
      };
    });
  }

  /**
   * Generate parameter suggestions using unified AI orchestration
   */
  async suggestParameters(
    toolName: string,
    partialParameters: Record<string, any>,
    context?: ValidationContext,
  ): Promise<Result<AIOperationResult<ParameterSuggestions>>> {
    const operationContext: AIOperationContext = {
      operation: 'suggest-parameters',
      toolName,
      targetType: context?.targetType,
      environment: context?.environment,
      metadata: { context, partialParameters },
    };

    return await this.processAIOperation(operationContext, async () => {
      const result = await this.parameterValidator.suggestParameters(
        toolName,
        partialParameters,
        context,
      );

      if (result.ok) {
        return {
          success: true,
          data: result.value,
          insights: [
            `Generated ${Object.keys(result.value.suggestions).length} parameter suggestions`,
          ],
          recommendations: [`Confidence: ${result.value.confidence.toFixed(2)}`],
        };
      }

      return {
        success: false,
        data: {
          suggestions: {},
          confidence: 0,
          reasoning: result.error,
          alternatives: {},
          metadata: { generationTime: 0, aiProvider: 'none', contextUsed: [] },
        },
        insights: [result.error],
        recommendations: [],
      };
    });
  }

  /**
   * Enhance tool results using unified AI orchestration
   */
  async augmentToolResult(
    toolName: string,
    result: any,
    context?: Partial<AIAugmentationContext>,
  ): Promise<Result<AIOperationResult<AIAugmentationResult>>> {
    const operationContext: AIOperationContext = {
      operation: 'enhance-result',
      toolName,
      targetType: context?.target,
      metadata: { originalResult: result, context },
    };

    return await this.processAIOperation(operationContext, async () => {
      const enhancementResult = await this.aiAugmentationService.augmentTool(
        toolName,
        result,
        context,
      );

      if (enhancementResult.ok) {
        const data = enhancementResult.value;
        return {
          success: true,
          data,
          insights: data.insights || [],
          recommendations: data.recommendations || [],
        };
      }

      return {
        success: false,
        data: {
          augmented: false,
          originalValue: result,
          metadata: { aiProvider: 'none', augmentationType: 'none', confidence: 0 },
        },
        insights: [enhancementResult.error],
        recommendations: [],
      };
    });
  }

  /**
   * Analyze context for AI insights
   */
  async analyzeContext(
    context: Record<string, any>,
    analysisType: 'security' | 'performance' | 'optimization' | 'general' = 'general',
  ): Promise<Result<AIOperationResult<AIAugmentationResult>>> {
    const operationContext: AIOperationContext = {
      operation: 'analyze-context',
      toolName: 'context-analyzer',
      metadata: { context, analysisType },
    };

    return await this.processAIOperation(operationContext, async () => {
      const analysisResult = await this.aiAugmentationService.analyzeResult(context, analysisType);

      if (analysisResult.ok) {
        const data = analysisResult.value;
        return {
          success: true,
          data,
          insights: data.insights || [],
          recommendations: data.recommendations || [],
        };
      }

      return {
        success: false,
        data: {
          augmented: false,
          originalValue: context,
          metadata: { aiProvider: 'none', augmentationType: 'analysis', confidence: 0 },
        },
        insights: [analysisResult.error],
        recommendations: [],
      };
    });
  }

  /**
   * Optimize strategy using AI
   */
  async optimizeStrategy(
    strategy: string,
    context: any,
    requirements?: AIAugmentationContext['requirements'],
  ): Promise<Result<AIOperationResult<AIAugmentationResult>>> {
    const operationContext: AIOperationContext = {
      operation: 'optimize-strategy',
      toolName: 'strategy-optimizer',
      environment: requirements?.environment,
      securityLevel: requirements?.securityLevel,
      metadata: { strategy, context, requirements },
    };

    return await this.processAIOperation(operationContext, async () => {
      const optimizationResult = await this.aiAugmentationService.augmentStrategy(
        strategy,
        context,
        requirements,
      );

      if (optimizationResult.ok) {
        const data = optimizationResult.value;
        return {
          success: true,
          data,
          insights: data.insights || [],
          recommendations: data.recommendations || [],
        };
      }

      return {
        success: false,
        data: {
          augmented: false,
          originalValue: context,
          metadata: { aiProvider: 'none', augmentationType: 'strategy', confidence: 0 },
        },
        insights: [optimizationResult.error],
        recommendations: [],
      };
    });
  }

  /**
   * Check if AI capabilities are available
   */
  isAIAvailable(): boolean {
    return this.mcpHostAI.isAvailable();
  }

  /**
   * Get AI provider information
   */
  getProviderInfo(): { type: string; available: boolean; capabilities: string[] } {
    return {
      type: this.mcpHostAI.getHostType(),
      available: this.mcpHostAI.isAvailable(),
      capabilities: [
        'parameter-validation',
        'parameter-suggestions',
        'result-enhancement',
        'context-analysis',
        'strategy-optimization',
      ],
    };
  }

  /**
   * Get orchestrator statistics
   */
  getStats(): {
    operationsProcessed: number;
    cacheEntries: number;
    aiProvider: string;
    capabilities: string[];
  } {
    return {
      operationsProcessed: this.operationCache.size,
      cacheEntries: this.operationCache.size,
      aiProvider: this.mcpHostAI.getHostType(),
      capabilities: this.getProviderInfo().capabilities,
    };
  }

  /**
   * Clear operation cache
   */
  clearCache(): void {
    this.operationCache.clear();
    this.logger.debug('AI operation cache cleared');
  }

  /**
   * Private helper methods
   */

  private async processAIOperation<T>(
    context: AIOperationContext,
    operation: () => Promise<{
      success: boolean;
      data: T;
      insights: string[];
      recommendations: string[];
    }>,
  ): Promise<Result<AIOperationResult<T>>> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(context);
      const cached = this.getCachedResult(cacheKey);

      if (cached) {
        this.logger.debug({ operation: context.operation }, 'Using cached AI result');
        return Success(cached as AIOperationResult<T>);
      }

      // Execute operation
      this.logger.debug(
        {
          operation: context.operation,
          toolName: context.toolName,
          aiAvailable: this.mcpHostAI.isAvailable(),
        },
        'Processing AI operation',
      );

      const operationResult = await operation();
      const processingTime = Date.now() - startTime;

      // Build unified result
      const result: AIOperationResult<T> = {
        success: operationResult.success,
        data: operationResult.data,
        aiEnhanced: this.mcpHostAI.isAvailable() && operationResult.success,
        processingTime,
        provider: this.mcpHostAI.getHostType(),
        insights: operationResult.insights,
        recommendations: operationResult.recommendations,
        metadata: {
          operation: context.operation,
          confidence: this.calculateOperationConfidence(operationResult.success, processingTime),
          cacheHit: false,
        },
      };

      // Cache successful results
      if (operationResult.success) {
        this.cacheResult(cacheKey, result);
      }

      this.logger.info(
        {
          operation: context.operation,
          toolName: context.toolName,
          success: result.success,
          processingTime: result.processingTime,
          aiEnhanced: result.aiEnhanced,
        },
        'AI operation completed',
      );

      return Success(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        {
          operation: context.operation,
          toolName: context.toolName,
          error: message,
        },
        'AI operation failed',
      );

      return Failure(`AI operation failed: ${message}`);
    }
  }

  private generateCacheKey(context: AIOperationContext): string {
    const keyData = {
      operation: context.operation,
      toolName: context.toolName,
      targetType: context.targetType,
      environment: context.environment,
      securityLevel: context.securityLevel,
      // Hash metadata to avoid huge cache keys
      metadataHash: context.metadata ? this.hashObject(context.metadata) : undefined,
    };

    return JSON.stringify(keyData);
  }

  private hashObject(obj: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(obj)).toString('base64').substring(0, 16);
  }

  private getCachedResult<T>(cacheKey: string): AIOperationResult<T> | null {
    const cached = this.operationCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      // Create a properly typed copy of the cached result
      const cachedResult = cached.result as AIOperationResult<unknown>;
      const result: AIOperationResult<T> = {
        ...cachedResult,
        data: cachedResult.data as T,
        metadata: { ...cachedResult.metadata, cacheHit: true },
      };
      return result;
    }

    if (cached) {
      this.operationCache.delete(cacheKey);
    }

    return null;
  }

  private cacheResult<T>(cacheKey: string, result: AIOperationResult<T>): void {
    // Clean old cache entries periodically
    if (this.operationCache.size > 100) {
      this.cleanupCache();
    }

    this.operationCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });
  }

  private cleanupCache(): void {
    const now = Date.now();
    const entriesToRemove: string[] = [];

    for (const [key, value] of this.operationCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        entriesToRemove.push(key);
      }
    }

    entriesToRemove.forEach((key) => this.operationCache.delete(key));

    this.logger.debug(
      {
        removed: entriesToRemove.length,
        remaining: this.operationCache.size,
      },
      'AI cache cleaned up',
    );
  }

  private calculateOperationConfidence(success: boolean, processingTime: number): number {
    let confidence = success ? 0.8 : 0.2;

    // Adjust confidence based on processing time (faster = higher confidence)
    if (processingTime < 1000) confidence += 0.1;
    else if (processingTime > 5000) confidence -= 0.1;

    // Adjust for AI availability
    if (this.mcpHostAI.isAvailable()) confidence += 0.1;

    return Math.max(0.1, Math.min(1.0, confidence));
  }
}

/**
 * Create MCP AI Orchestrator instance
 */
export const createMCPAIOrchestrator = (
  logger: Logger,
  options?: {
    promptRegistry?: SDKPromptRegistry;
    aiService?: AIAugmentationService;
    validator?: AIParameterValidator;
  },
): MCPAIOrchestrator => {
  return new MCPAIOrchestrator(logger, options);
};
