/**
 * Sampling Service - Main entry point for Dockerfile sampling functionality
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../../core/types';
import type {
  SamplingConfig,
  SamplingOptions,
  SamplingResult,
  DockerfileVariant,
  ScoredVariant,
  ScoringCriteria,
} from './types';
import { VariantGenerationPipeline } from './generation-pipeline';
import { DEFAULT_SCORING_CRITERIA } from './scorer';
import { SDKPromptRegistry } from '../../mcp/prompts/sdk-prompt-registry';
import { createMCPAIOrchestrator, type MCPAIOrchestrator } from '../../mcp/ai/orchestrator';
import type { ValidationContext } from '../../mcp/tools/validator';
import {
  createSDKResourceManager,
  createResourceContext,
  type SDKResourceManager,
} from '../../mcp/resources/manager';
import { UriParser } from '../../mcp/resources/uri-schemes';

/**
 * High-level sampling service that provides the main API for Dockerfile sampling
 */
export class SamplingService {
  private pipeline: VariantGenerationPipeline;
  private aiOrchestrator: MCPAIOrchestrator;
  private resourceManager: SDKResourceManager;

  constructor(
    private logger: Logger,
    promptRegistry?: SDKPromptRegistry,
  ) {
    this.pipeline = new VariantGenerationPipeline(logger, promptRegistry);
    this.aiOrchestrator = createMCPAIOrchestrator(logger, promptRegistry ? { promptRegistry } : {});

    // Initialize resource management for sampling results
    const resourceContext = createResourceContext(
      {
        defaultTtl: 3600000, // 1 hour
        maxResourceSize: 10 * 1024 * 1024, // 10MB
        cacheConfig: { defaultTtl: 3600000 },
      },
      logger,
    );
    this.resourceManager = createSDKResourceManager(resourceContext);
  }

  /**
   * Generate multiple Dockerfile variants and select the best one
   * This is the main method used by the workflow
   */
  async generateBestDockerfile(
    config: { sessionId: string; repoPath: string },
    options: SamplingOptions,
    logger: Logger,
  ): Promise<Result<{ content: string; score: number; metadata: Record<string, unknown> }>> {
    try {
      // 1. Validate parameters using AI orchestrator
      const validationContext: ValidationContext = {
        toolName: 'dockerfile-sampling',
        repositoryPath: config.repoPath,
        environment: options.environment || 'development',
        targetType: 'dockerfile',
      };

      const validationResult = await this.aiOrchestrator.validateParameters(
        'dockerfile-best',
        { ...config, ...options },
        validationContext,
      );

      if (validationResult.ok && !validationResult.value.data.isValid) {
        logger.warn(
          {
            errors: validationResult.value.data.errors,
            warnings: validationResult.value.data.warnings,
          },
          'Parameter validation failed, proceeding with warnings',
        );
      }

      const samplingConfig: SamplingConfig = {
        sessionId: config.sessionId,
        repoPath: config.repoPath,
        variantCount: 5,
        enableCaching: true,
        timeout: 60000,
        criteria: this.buildScoringCriteria(options),
      };

      if (options.optimization) {
        samplingConfig.constraints = { preferredOptimization: options.optimization };
      }

      const result = await this.pipeline.generateSampledDockerfiles(samplingConfig);

      if (!result.ok) {
        return Failure(`Sampling failed: ${result.error}`);
      }

      const samplingResult = result.value;
      const bestVariant = samplingResult.bestVariant;

      logger.info(
        {
          sessionId: config.sessionId,
          variantsGenerated: samplingResult.variants.length,
          bestStrategy: bestVariant.strategy,
          bestScore: bestVariant.score.total,
        },
        'Best Dockerfile generated via sampling',
      );

      return Success({
        content: bestVariant.content,
        score: bestVariant.score.total / 100, // Normalize to 0-1 range for compatibility
        metadata: {
          approach: 'sampling',
          environment: options.environment,
          variants: samplingResult.variants.length,
          strategy: bestVariant.strategy,
          optimization: bestVariant.metadata.optimization,
          features: bestVariant.metadata.features,
          rank: bestVariant.rank,
          scoreBreakdown: bestVariant.score.breakdown,
          recommendations: bestVariant.score.recommendations,
          warnings: bestVariant.score.warnings,
          estimatedSize: bestVariant.metadata.estimatedSize,
          buildComplexity: bestVariant.metadata.buildComplexity,
          generatedAt: samplingResult.generated.toISOString(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          error: message,
          sessionId: config.sessionId,
        },
        'Dockerfile sampling service failed',
      );

      return Failure(`Sampling service error: ${message}`);
    }
  }

  /**
   * Generate and score multiple variants (for detailed analysis)
   */
  async generateVariants(config: SamplingConfig): Promise<Result<SamplingResult>> {
    // 1. Validate sampling configuration parameters
    const validationContext: ValidationContext = {
      toolName: 'dockerfile-sampling',
      repositoryPath: config.repoPath,
      environment: config.environment || 'development',
      targetType: 'dockerfile',
    };

    const validationResult = await this.aiOrchestrator.validateParameters(
      'dockerfile-sampling',
      config,
      validationContext,
    );

    if (validationResult.ok && !validationResult.value.data.isValid) {
      this.logger.warn(
        {
          sessionId: config.sessionId,
          errors: validationResult.value.data.errors,
          warnings: validationResult.value.data.warnings,
        },
        'Sampling configuration validation issues detected',
      );

      // Return validation errors if critical
      const criticalErrors = validationResult.value.data.errors.filter(
        (error) => error.includes('required') || error.includes('invalid'),
      );

      if (criticalErrors.length > 0) {
        return Failure(`Configuration validation failed: ${criticalErrors.join('; ')}`);
      }
    }

    // 2. Check if sampling results are already cached
    const cacheUri = UriParser.build('sampling', `${config.sessionId}/variants`);
    const cachedResult = await this.resourceManager.readResource(cacheUri);

    if (cachedResult.ok && cachedResult.value) {
      this.logger.info({ sessionId: config.sessionId }, 'Using cached sampling results');

      try {
        const text = cachedResult.value.contents?.[0]?.text ?? '{}';
        const cachedData = JSON.parse(typeof text === 'string' ? text : '{}');
        return Success(cachedData as SamplingResult);
      } catch (error) {
        this.logger.warn(
          { sessionId: config.sessionId, error },
          'Failed to parse cached sampling results, generating new ones',
        );
      }
    }

    // 3. Generate new sampling results
    const result = await this.pipeline.generateSampledDockerfiles(config);

    // 4. Cache successful results for future use
    if (result.ok) {
      const cacheResult = await this.resourceManager.publishEnhanced(
        cacheUri,
        result.value,
        {
          category: 'sampling-result',
          name: `sampling-${config.sessionId}`,
          description: `Sampling results for session ${config.sessionId}`,
          annotations: {
            tags: ['dockerfile', 'sampling', config.sessionId],
            priority: 1,
          },
        },
        3600000, // 1 hour TTL
      );

      if (cacheResult.ok) {
        this.logger.info(
          { sessionId: config.sessionId, cacheUri },
          'Sampling results cached successfully',
        );
      } else {
        this.logger.warn(
          { sessionId: config.sessionId, error: cacheResult.error },
          'Failed to cache sampling results',
        );
      }
    }

    return result;
  }

  /**
   * Compare multiple Dockerfile variants
   */
  async compareDockerfiles(
    dockerfiles: { id: string; content: string; strategy?: string }[],
    criteria?: ScoringCriteria,
  ): Promise<
    Result<{
      variants: ScoredVariant[];
      bestVariant: ScoredVariant;
      comparison: {
        summary: string;
        advantages: Record<string, string[]>;
        tradeoffs: Record<string, string[]>;
      };
    }>
  > {
    try {
      // Convert input to DockerfileVariant format
      const variants: DockerfileVariant[] = dockerfiles.map((df, index) => ({
        id: df.id || `comparison-${index}`,
        content: df.content,
        strategy: df.strategy || 'unknown',
        metadata: {
          baseImage: this.extractBaseImage(df.content),
          optimization: 'balanced',
          features: [],
          estimatedSize: 'unknown',
          buildComplexity: 'medium',
          securityFeatures: [],
        },
        generated: new Date(),
      }));

      // Score all variants
      const scoringCriteria = criteria || DEFAULT_SCORING_CRITERIA;
      const scorer = (this.pipeline as any).scorer;

      const scoredResult = await scorer.scoreVariants(variants, scoringCriteria);
      if (!scoredResult.ok) {
        return Failure(`Comparison scoring failed: ${scoredResult.error}`);
      }

      const scoredVariants = scoredResult.value;
      const bestVariant = scoredVariants[0];

      // Generate comparison analysis
      const comparison = this.generateComparisonAnalysis(scoredVariants);

      this.logger.info(
        {
          variantsCompared: scoredVariants.length,
          bestVariant: bestVariant.id,
          bestScore: bestVariant.score.total,
        },
        'Dockerfile comparison completed',
      );

      return Success({
        variants: scoredVariants,
        bestVariant,
        comparison,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: message }, 'Dockerfile comparison failed');
      return Failure(`Comparison failed: ${message}`);
    }
  }

  /**
   * Get available sampling strategies
   */
  getAvailableStrategies(): string[] {
    return this.pipeline.getAvailableStrategies();
  }

  /**
   * Validate a Dockerfile against best practices
   */
  async validateDockerfile(
    content: string,
    criteria?: ScoringCriteria,
  ): Promise<
    Result<{
      score: number;
      breakdown: Record<string, number>;
      issues: string[];
      recommendations: string[];
      isValid: boolean;
    }>
  > {
    try {
      const variant: DockerfileVariant = {
        id: `validation-${Date.now()}`,
        content,
        strategy: 'validation',
        metadata: {
          baseImage: this.extractBaseImage(content),
          optimization: 'balanced',
          features: [],
          estimatedSize: 'unknown',
          buildComplexity: 'medium',
          securityFeatures: [],
        },
        generated: new Date(),
      };

      const scorer = (this.pipeline as any).scorer;

      const scoredResult = await scorer.scoreVariants(
        [variant],
        criteria || DEFAULT_SCORING_CRITERIA,
      );
      if (!scoredResult.ok) {
        return Failure(`Validation scoring failed: ${scoredResult.error}`);
      }

      const scored = scoredResult.value[0];
      const isValid = scored.score.total >= 60; // Minimum acceptable score

      return Success({
        score: scored.score.total,
        breakdown: scored.score.breakdown,
        issues: scored.score.warnings,
        recommendations: scored.score.recommendations,
        isValid,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: message }, 'Dockerfile validation failed');
      return Failure(`Validation failed: ${message}`);
    }
  }

  // Private helper methods

  private buildScoringCriteria(options: SamplingOptions): Partial<ScoringCriteria> {
    if (options.customCriteria) {
      return options.customCriteria;
    }

    // Environment-based defaults
    const environmentWeights: Record<string, Partial<ScoringCriteria>> = {
      production: { security: 0.4, performance: 0.3, size: 0.2, maintainability: 0.1 },
      staging: { security: 0.3, performance: 0.3, size: 0.2, maintainability: 0.2 },
      development: { security: 0.1, performance: 0.2, size: 0.2, maintainability: 0.5 },
    };

    return environmentWeights[options.environment] || {};
  }

  private extractBaseImage(content: string): string {
    const lines = content.split('\n');
    const fromLine = lines.find((line) => line.trim().toLowerCase().startsWith('from '));

    if (fromLine) {
      const parts = fromLine.trim().split(/\s+/);
      if (parts.length >= 2 && parts[1]) {
        return parts[1];
      }
    }

    return 'unknown';
  }

  private generateComparisonAnalysis(scoredVariants: ScoredVariant[]): {
    summary: string;
    advantages: Record<string, string[]>;
    tradeoffs: Record<string, string[]>;
  } {
    const best = scoredVariants[0];
    if (!best) {
      return {
        summary: 'No variants available',
        advantages: {},
        tradeoffs: {},
      };
    }
    const summary = `Best variant: ${best.id} (${best.strategy}) with score ${best.score.total}/100`;

    const advantages: Record<string, string[]> = {};
    const tradeoffs: Record<string, string[]> = {};

    scoredVariants.forEach((variant) => {
      advantages[variant.id] = variant.score.reasons;
      tradeoffs[variant.id] = variant.score.warnings;
    });

    return { summary, advantages, tradeoffs };
  }

  /**
   * Clean up sampling resources for a session
   */
  async cleanupSamplingResources(sessionId: string): Promise<Result<number>> {
    try {
      const pattern = `sampling://${sessionId}/*`;
      const cleanupResult = await this.resourceManager.invalidateResource(pattern);

      if (cleanupResult.ok) {
        this.logger.info({ sessionId, pattern }, 'Sampling resources cleaned up successfully');
        return Success(1); // Return count of cleaned resources
      } else {
        return Failure(`Failed to clean up sampling resources: ${cleanupResult.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ sessionId, error: message }, 'Sampling resource cleanup failed');
      return Failure(`Sampling resource cleanup error: ${message}`);
    }
  }

  /**
   * Get cached sampling results for a session
   */
  async getCachedSamplingResults(sessionId: string): Promise<Result<SamplingResult | null>> {
    try {
      const cacheUri = UriParser.build('sampling', `${sessionId}/variants`);
      const cachedResult = await this.resourceManager.readResource(cacheUri);

      if (cachedResult.ok && cachedResult.value) {
        try {
          const text = cachedResult.value.contents?.[0]?.text ?? '{}';
          const cachedData = JSON.parse(typeof text === 'string' ? text : '{}');
          return Success(cachedData as SamplingResult);
        } catch (error) {
          this.logger.warn({ sessionId, error }, 'Failed to parse cached sampling results');
          return Success(null);
        }
      }

      return Success(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ sessionId, error: message }, 'Failed to get cached sampling results');
      return Failure(`Failed to get cached results: ${message}`);
    }
  }

  /**
   * Get sampling resource statistics
   */
  getSamplingResourceStats(): ReturnType<typeof this.resourceManager.getStats> {
    return this.resourceManager.getStats();
  }
}
