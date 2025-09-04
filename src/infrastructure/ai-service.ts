/**
 * Enhanced AI Service
 * Unified service facade with integrated optimizations:
 * - AI Request Builder pattern
 * - Enhanced error recovery with context
 * - Response caching with TTL and LRU
 * - Dynamic sampling strategies
 */

import { z } from 'zod';
import type { Logger } from 'pino';
import { AIServiceError } from '../errors/index';
import { ErrorCode } from '../domain/types/errors';
import type { SampleFunction } from './ai/sampling';
import type { AIRequest } from './ai/requests';
import { AIResponseCache, type CacheOptions, type CacheStats } from './ai/response-cache';
import { executeWithRecovery } from './ai/error-handlers';

/**
 * Enhanced AI service configuration
 */
export interface EnhancedAIConfig {
  /** Model preferences for different task types */
  modelPreferences?: {
    default?: string;
    dockerfile?: string;
    kubernetes?: string;
    analysis?: string;
    optimization?: string;
  };

  /** Default sampling parameters */
  defaultSampling?: {
    temperature?: number;
    maxTokens?: number;
  };

  /** Cache configuration */
  cache?: CacheOptions;

  /** Simple error recovery configuration */
  errorRecovery?: {
    /** Maximum number of recovery attempts */
    maxAttempts?: number;
    /** Whether to enable error recovery */
    enabled?: boolean;
  };

  /** Whether to enable performance monitoring */
  enableMetrics?: boolean;

  /** Whether to enable detailed logging */
  enableDetailedLogging?: boolean;
}

/**
 * Generation options for AI requests
 */
export interface GenerationOptions {
  /** Override temperature for this request */
  temperature?: number;

  /** Override max tokens for this request */
  maxTokens?: number;

  /** Override model for this request */
  model?: string;

  /** Task complexity hint for parameter optimization */
  complexity?: 'low' | 'medium' | 'high';

  /** Time constraint for response speed optimization */
  timeConstraint?: 'fast' | 'normal' | 'thorough';

  /** Whether to bypass cache for this request */
  bypassCache?: boolean;

  /** Whether to disable error recovery for this request */
  disableRecovery?: boolean;

  /** Additional context variables */
  additionalContext?: Record<string, unknown>;
}

/**
 * Structured generation options with schema validation
 */
export interface StructuredOptions extends GenerationOptions {
  /** Maximum repair attempts for malformed responses */
  maxRepairAttempts?: number;

  /** Whether to enable strict validation */
  strictValidation?: boolean;
}

/**
 * Generation result with metadata
 */
export interface GenerationResult<T = unknown> {
  /** The generated content */
  data: T;

  /** Metadata about the generation */
  metadata: {
    /** Model used for generation */
    model?: string | undefined;

    /** Tokens consumed */
    tokensUsed?: number | undefined;

    /** Generation duration in milliseconds */
    durationMs: number;

    /** Whether result came from cache */
    fromCache: boolean;

    /** Whether error recovery was used */
    usedRecovery: boolean;

    /** Recovery details if recovery was used */
    recovery?: {
      attempts: number;
      strategies: string[];
      finalStrategy?: string;
    };

    /** Confidence in the result (0.0-1.0) */
    confidence: number;
  };
}

/**
 * Performance metrics for monitoring
 */
export interface PerformanceMetrics {
  /** Total requests processed */
  totalRequests: number;

  /** Successful requests */
  successfulRequests: number;

  /** Failed requests */
  failedRequests: number;

  /** Success rate (0.0-1.0) */
  successRate: number;

  /** Average response time in milliseconds */
  avgResponseTimeMs: number;

  /** Cache statistics */
  cache: CacheStats;

  /** Error recovery statistics */
  recovery: {
    sessionsInitiated: number;
    successfulRecoveries: number;
    recoverySuccessRate: number;
    avgRecoveryAttempts: number;
    topFailureReasons: string[];
  };

  /** Token usage statistics */
  tokenUsage: {
    totalTokens: number;
    avgTokensPerRequest: number;
    tokensSavedByCache: number;
  };
}

/**
 * Enhanced AI Service with integrated optimizations
 */
export class EnhancedAIService {
  private cache: AIResponseCache;
  private metrics: Omit<PerformanceMetrics, 'successRate' | 'cache' | 'recovery' | 'tokenUsage'> = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    avgResponseTimeMs: 0,
  };
  private recoveryMetrics = {
    sessionsInitiated: 0,
    successfulRecoveries: 0,
    totalRecoveryAttempts: 0,
    failureReasons: new Map<string, number>(),
  };
  private tokenMetrics = {
    totalTokens: 0,
    tokensSavedByCache: 0,
  };

  private logger: Logger;
  private sampler: SampleFunction | undefined;
  private config: Required<EnhancedAIConfig>;

  constructor(config: EnhancedAIConfig, sampler: SampleFunction | undefined, logger: Logger) {
    this.logger = logger.child({ service: 'enhanced-ai-service' });
    this.sampler = sampler;

    // Set default configuration
    this.config = {
      modelPreferences: {
        default: 'claude-3-opus',
        dockerfile: 'claude-3-opus',
        kubernetes: 'claude-3-opus',
        analysis: 'claude-3-opus',
        optimization: 'claude-3-opus',
        ...config.modelPreferences,
      },
      defaultSampling: {
        temperature: 0.2,
        maxTokens: 1500,
        ...config.defaultSampling,
      },
      cache: {
        enabled: true,
        defaultTtlMs: 15 * 60 * 1000, // 15 minutes
        maxSize: 100,
        enableDetailedLogging: config.enableDetailedLogging ?? false,
        ...config.cache,
      },
      errorRecovery: {
        maxAttempts: 3,
        enabled: true,
        ...config.errorRecovery,
      },
      enableMetrics: config.enableMetrics !== false,
      enableDetailedLogging: config.enableDetailedLogging ?? false,
    };

    // Initialize subsystems
    this.cache = new AIResponseCache(logger, this.config.cache);

    this.logger.info(
      {
        cacheEnabled: this.config.cache.enabled,
        errorRecoveryEnabled: true,
        metricsEnabled: this.config.enableMetrics,
      },
      'Enhanced AI Service initialized',
    );
  }

  /**
   * Generate content using AI with all optimizations
   * @param request - AI request object
   * @param options - Generation options
   */
  async generate<T = string>(
    request: AIRequest,
    options: GenerationOptions = {},
  ): Promise<GenerationResult<T>> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      const finalRequest = this.buildFinalRequest(request, options);
      const templateId = this.extractTemplateId(finalRequest);
      if (!options.bypassCache) {
        const cached = await this.cache.get<T>(finalRequest);
        if (cached !== null) {
          return this.createSuccessResult(cached, {
            durationMs: Date.now() - startTime,
            fromCache: true,
            usedRecovery: false,
            confidence: 1.0,
          });
        }
      }

      const result = await this.executeGeneration<T>(request, templateId, options);
      if (result.metadata.confidence > 0.7 && !options.bypassCache) {
        await this.cache.set(request, result.data, true, result.metadata.tokensUsed);
      }

      return result;
    } catch (error) {
      this.metrics.failedRequests++;

      if (error instanceof AIServiceError) {
        throw error;
      }

      throw new AIServiceError(
        `AI generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.ENHANCED_AI_GENERATION_FAILED,
        undefined,
        error instanceof Error ? error : undefined,
        { options },
      );
    }
  }

  /**
   * Generate structured content with schema validation
   * @param request - AI request object
   * @param schema - Zod schema for validation
   * @param options - Structured generation options
   */
  async generateStructured<T>(
    request: AIRequest,
    schema: z.ZodSchema<T>,
    options: StructuredOptions = {},
  ): Promise<GenerationResult<T>> {
    const finalRequest = this.buildFinalRequest(request, options);
    const templateId = this.extractTemplateId(finalRequest);

    // Add schema information to context for better prompts
    const enhancedRequest = {
      ...finalRequest,
      context: {
        ...finalRequest.context,
        _schemaHint: this.generateSchemaHint(schema),
        _structuredMode: true,
        _maxRepairAttempts: options.maxRepairAttempts ?? 3,
      },
    };

    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Try cache first
      if (!options.bypassCache) {
        const cached = await this.cache.get<T>(enhancedRequest);
        if (cached !== null) {
          // Validate cached result against schema
          const validation = schema.safeParse(cached);
          if (validation.success) {
            return this.createSuccessResult(validation.data, {
              durationMs: Date.now() - startTime,
              fromCache: true,
              usedRecovery: false,
              confidence: 1.0,
            });
          }
          // Invalid cached result - remove from cache
          this.cache.delete(enhancedRequest);
        }
      }

      // Execute structured generation with enhanced error recovery
      const executor = async (
        req: AIRequest,
      ): Promise<{ data: T; tokensUsed?: number; model?: string }> => {
        if (!this.sampler) {
          throw new AIServiceError(
            'AI sampler not available',
            ErrorCode.AI_SAMPLER_UNAVAILABLE,
            undefined,
            undefined,
            { operation: 'generateStructured' },
          );
        }

        const result = await this.sampler(req);

        if (!result.success) {
          throw new Error(result.error);
        }

        // Parse and validate result
        let parsed: unknown;
        try {
          parsed = typeof result.text === 'string' ? JSON.parse(result.text) : result.text;
        } catch (parseError) {
          throw new Error(
            `JSON parsing failed: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`,
          );
        }

        const validation = schema.safeParse(parsed);
        if (!validation.success) {
          throw new Error(`Schema validation failed: ${validation.error.message}`);
        }

        return {
          data: validation.data,
          ...(result.tokenCount !== undefined && { tokensUsed: result.tokenCount }),
          ...(req.model !== undefined && { model: req.model }),
        };
      };

      if (options.disableRecovery) {
        const result = await executor(enhancedRequest);
        const metadata: Partial<GenerationResult<typeof result.data>['metadata']> = {
          durationMs: Date.now() - startTime,
          fromCache: false,
          usedRecovery: false,
          confidence: 0.9,
        };

        if (result.model) {
          metadata.model = result.model;
        }
        if (result.tokensUsed !== undefined) {
          metadata.tokensUsed = result.tokensUsed;
        }

        return this.createSuccessResult(result.data, metadata);
      } else {
        // Add template context to request for better error handling
        const requestWithContext = {
          ...enhancedRequest,
          context: {
            ...enhancedRequest.context,
            _templateId: templateId,
            _variables: enhancedRequest.context ?? {},
          },
        };

        const result = await executeWithRecovery(
          executor,
          requestWithContext,
          this.config.errorRecovery?.maxAttempts ?? 3,
        );

        const metadata: Partial<GenerationResult<typeof result.data>['metadata']> = {
          durationMs: Date.now() - startTime,
          fromCache: false,
          usedRecovery: false,
          confidence: 0.8,
        };

        if (result.model) {
          metadata.model = result.model;
        }
        if (result.tokensUsed !== undefined) {
          metadata.tokensUsed = result.tokensUsed;
        }

        return this.createSuccessResult(result.data, metadata);
      }
    } catch (error) {
      this.metrics.failedRequests++;

      throw new AIServiceError(
        `Structured AI generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.ENHANCED_AI_STRUCTURED_GENERATION_FAILED,
        undefined,
        error instanceof Error ? error : undefined,
        { templateId, options },
      );
    }
  }

  /**
   * Generate with automatic fallback to simpler approach
   * @param primaryRequest - Primary request object
   * @param fallbackRequest - Fallback request object
   * @param options - Generation options
   */
  async generateWithFallback<T>(
    primaryRequest: AIRequest,
    fallbackRequest: AIRequest,
    options: GenerationOptions = {},
  ): Promise<GenerationResult<T>> {
    try {
      return await this.generate<T>(primaryRequest, options);
    } catch (primaryError) {
      this.logger.warn(
        {
          error: primaryError instanceof Error ? primaryError.message : 'Unknown error',
        },
        'Primary generation failed, trying fallback',
      );

      return await this.generate<T>(fallbackRequest, {
        ...options,
        additionalContext: {
          _fallbackMode: true,
          _primaryFailure: primaryError instanceof Error ? primaryError.message : 'Unknown error',
        },
      });
    }
  }

  /**
   * Check if AI service is available
   */
  isAvailable(): boolean {
    return !!this.sampler;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const cacheStats = this.cache.getStats();

    return {
      ...this.metrics,
      successRate:
        this.metrics.totalRequests > 0
          ? this.metrics.successfulRequests / this.metrics.totalRequests
          : 0,
      cache: cacheStats,
      recovery: {
        sessionsInitiated: this.recoveryMetrics.sessionsInitiated,
        successfulRecoveries: this.recoveryMetrics.successfulRecoveries,
        recoverySuccessRate:
          this.recoveryMetrics.sessionsInitiated > 0
            ? this.recoveryMetrics.successfulRecoveries / this.recoveryMetrics.sessionsInitiated
            : 0,
        avgRecoveryAttempts:
          this.recoveryMetrics.sessionsInitiated > 0
            ? this.recoveryMetrics.totalRecoveryAttempts / this.recoveryMetrics.sessionsInitiated
            : 0,
        topFailureReasons: Array.from(this.recoveryMetrics.failureReasons.entries())
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([reason]) => reason),
      },
      tokenUsage: {
        totalTokens: this.tokenMetrics.totalTokens,
        avgTokensPerRequest:
          this.metrics.totalRequests > 0
            ? this.tokenMetrics.totalTokens / this.metrics.totalRequests
            : 0,
        tokensSavedByCache: this.tokenMetrics.tokensSavedByCache,
      },
    };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTimeMs: 0,
    };
    this.recoveryMetrics = {
      sessionsInitiated: 0,
      successfulRecoveries: 0,
      totalRecoveryAttempts: 0,
      failureReasons: new Map(),
    };
    this.tokenMetrics = {
      totalTokens: 0,
      tokensSavedByCache: 0,
    };
    this.cache.resetStats();
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Destroy service and cleanup resources
   */
  destroy(): void {
    this.cache.destroy();
  }

  /**
   * Build final AI request with all optimizations applied
   */
  private buildFinalRequest(request: AIRequest, options: GenerationOptions): AIRequest {
    // Apply generation options to the request
    const finalRequest = {
      ...request,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.maxTokens !== undefined && { maxTokens: options.maxTokens }),
      ...(options.model !== undefined && { model: options.model }),
      context: {
        ...request.context,
        ...(options.complexity && { _complexity: options.complexity }),
        ...(options.additionalContext && options.additionalContext),
      },
    };

    // Apply model preferences if no model specified
    if (!finalRequest.model) {
      const templateId = this.extractTemplateId(finalRequest);
      finalRequest.model = this.getModelPreference(templateId);
    }

    return finalRequest;
  }

  /**
   * Execute generation with optional error recovery
   */
  private async executeGeneration<T>(
    request: AIRequest,
    templateId: string,
    options: GenerationOptions,
  ): Promise<GenerationResult<T>> {
    const startTime = Date.now();

    const executor = async (
      req: AIRequest,
    ): Promise<{ data: T; tokensUsed?: number; model?: string }> => {
      if (!this.sampler) {
        throw new AIServiceError(
          'AI sampler not available',
          ErrorCode.AI_SAMPLER_UNAVAILABLE,
          undefined,
          undefined,
          { operation: 'generate' },
        );
      }

      const result = await this.sampler(req);

      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        data: result.text as T,
        ...(result.tokenCount !== undefined && { tokensUsed: result.tokenCount }),
        ...(req.model !== undefined && { model: req.model }),
      };
    };

    if (options.disableRecovery) {
      const result = await executor(request);
      const metadata: Partial<GenerationResult<typeof result.data>['metadata']> = {
        durationMs: Date.now() - startTime,
        fromCache: false,
        usedRecovery: false,
        confidence: 0.9,
      };

      if (result.model) {
        metadata.model = result.model;
      }
      if (result.tokensUsed !== undefined) {
        metadata.tokensUsed = result.tokensUsed;
      }

      return this.createSuccessResult(result.data, metadata);
    } else {
      // Add template context to request for better error handling
      const requestWithContext = {
        ...request,
        context: {
          ...request.context,
          _templateId: templateId,
          _variables: request.context ?? {},
        },
      };

      const result = await executeWithRecovery(
        executor,
        requestWithContext,
        this.config.errorRecovery?.maxAttempts ?? 3,
      );

      const metadata: Partial<GenerationResult<typeof result.data>['metadata']> = {
        durationMs: Date.now() - startTime,
        fromCache: false,
        usedRecovery: false,
        confidence: 0.8,
      };

      if (result.model) {
        metadata.model = result.model;
      }
      if (result.tokensUsed !== undefined) {
        metadata.tokensUsed = result.tokensUsed;
      }

      return this.createSuccessResult(result.data, metadata);
    }
  }

  /**
   * Create success result with metadata
   */
  private createSuccessResult<T>(
    data: T,
    metadata: Partial<GenerationResult<T>['metadata']>,
  ): GenerationResult<T> {
    this.metrics.successfulRequests++;

    // Update token metrics
    if (metadata.tokensUsed) {
      this.tokenMetrics.totalTokens += metadata.tokensUsed;
    }
    if (metadata.fromCache) {
      // Estimate tokens saved by cache (rough estimate)
      this.tokenMetrics.tokensSavedByCache += metadata.tokensUsed ?? 1000;
    }

    return {
      data,
      metadata: {
        model: this.config.modelPreferences.default,
        tokensUsed: 0,
        durationMs: 0,
        fromCache: false,
        usedRecovery: false,
        confidence: 0.8,
        ...metadata,
      },
    };
  }

  /**
   * Extract template ID from request
   */
  private extractTemplateId(request: AIRequest): string {
    return (
      (request.context?._templateId as string) ??
      ((request.context?._originalTemplate as string) || 'unknown')
    );
  }

  /**
   * Get model preference for template type
   */
  private getModelPreference(templateId: string): string {
    if (templateId.includes('dockerfile')) {
      return (
        this.config.modelPreferences.dockerfile ??
        this.config.modelPreferences.default ??
        'claude-3-5-sonnet-latest'
      );
    }
    if (templateId.includes('k8s') || templateId.includes('kubernetes')) {
      return (
        this.config.modelPreferences.kubernetes ??
        this.config.modelPreferences.default ??
        'claude-3-5-sonnet-latest'
      );
    }
    if (templateId.includes('analysis')) {
      return (
        this.config.modelPreferences.analysis ??
        this.config.modelPreferences.default ??
        'claude-3-5-sonnet-latest'
      );
    }
    if (templateId.includes('optimization')) {
      return (
        this.config.modelPreferences.optimization ??
        this.config.modelPreferences.default ??
        'claude-3-5-sonnet-latest'
      );
    }

    return this.config.modelPreferences.default ?? 'claude-3-5-sonnet-latest';
  }

  /**
   * Generate schema hint for better structured responses
   */
  private generateSchemaHint(_schema: z.ZodSchema): string {
    // This is a simplified schema hint generator
    // In a full implementation, you'd want more sophisticated schema introspection'
    return 'Valid JSON object with required fields';
  }
}

/**
 * Factory function to create enhanced AI service
 */
export function createEnhancedAIService(
  config: EnhancedAIConfig,
  sampler: SampleFunction | undefined,
  logger: Logger,
): EnhancedAIService {
  return new EnhancedAIService(config, sampler, logger);
}
