/**
 * Sampling Service - Main entry point for Dockerfile sampling functionality
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '@types';
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
import { PromptRegistry } from '@prompts/prompt-registry';
import {
  createMCPAIOrchestrator,
  type MCPAIOrchestrator,
} from '@workflows/intelligent-orchestration';
import type { ValidationContext } from '@mcp/tools/validator';
import {
  createSDKResourceManager,
  createResourceContext,
  type SDKResourceManager,
} from '@resources/manager';

interface PipelineResult {
  ok: boolean;
  value?: {
    variants: Array<{
      content: string;
      score: number;
      strategy: string;
    }>;
  };
  error?: string;
}

/**
 * High-level sampling service that provides the main API for Dockerfile sampling
 */
export class SamplingService {
  private pipeline: VariantGenerationPipeline;
  private aiOrchestrator: MCPAIOrchestrator;
  private resourceManager: SDKResourceManager;

  constructor(
    private logger: Logger,
    promptRegistry?: PromptRegistry,
  ) {
    this.pipeline = new VariantGenerationPipeline(logger, promptRegistry);
    this.aiOrchestrator = createMCPAIOrchestrator(logger, promptRegistry ? { promptRegistry } : {});

    // Initialize resource management for sampling results
    const resourceContext = createResourceContext(
      {
        defaultTtl: 3600000, // 1 hour
        maxResourceSize: 10 * 1024 * 1024, // 10MB
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

      const result = (await this.pipeline.generateSampledDockerfiles(
        samplingConfig,
      )) as PipelineResult;

      if (!result.ok) {
        return Failure(`Pipeline generation failed: ${result.error}`);
      }

      const samplingResult = result.value;
      if (!samplingResult || samplingResult.variants.length === 0) {
        return Failure('No variants generated');
      }

      const bestVariant = samplingResult.variants[0];
      if (!bestVariant) {
        return Failure('No best variant found');
      }

      return Success({
        content: bestVariant.content,
        score: bestVariant.score / 100,
        metadata: {
          approach: 'pipeline',
          environment: options.environment,
          variants: samplingResult.variants.length,
          strategy: bestVariant.strategy,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: message, sessionId: config.sessionId },
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
      config as unknown as Record<string, unknown>,
      validationContext as unknown as Record<string, unknown>,
    );

    if (validationResult.ok && !validationResult.value.isValid) {
      this.logger.warn(
        {
          sessionId: config.sessionId,
          errors: validationResult.value.errors,
          warnings: validationResult.value.warnings,
        },
        'Sampling configuration validation issues detected',
      );

      // Return validation errors if critical
      const criticalErrors = validationResult.value.errors.filter(
        (error: string) => error.includes('required') || error.includes('invalid'),
      );

      if (criticalErrors.length > 0) {
        return Failure(`Configuration validation failed: ${criticalErrors.join('; ')}`);
      }
    }

    // 2. Generate new sampling results
    const result = await this.pipeline.generateSampledDockerfiles(config);

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

      const scoredResult = await this.pipeline.scoreVariants(variants, scoringCriteria);
      if (!scoredResult.ok) {
        return Failure(`Comparison scoring failed: ${scoredResult.error}`);
      }

      const scoredData = scoredResult.value;
      if (!scoredData || scoredData.length === 0) {
        return Failure('No scored variants available');
      }

      // Map scored data back to ScoredVariant objects
      const scoredVariants: ScoredVariant[] = [];
      for (const scored of scoredData) {
        const originalVariant = variants.find((v) => v.id === scored.id);
        if (!originalVariant) {
          return Failure(`Original variant with id ${scored.id} not found`);
        }
        scoredVariants.push({
          ...originalVariant,
          score: scored.score,
          rank: scoredData.indexOf(scored) + 1,
        });
      }

      const bestVariant = scoredVariants[0];
      if (!bestVariant) {
        return Failure('No best variant found in comparison');
      }

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

      const scoredResult = await this.pipeline.scoreVariants(
        [variant],
        criteria || DEFAULT_SCORING_CRITERIA,
      );
      if (!scoredResult.ok) {
        return Failure(`Validation scoring failed: ${scoredResult.error}`);
      }

      const scoredValue = scoredResult.value;
      if (!scoredValue || scoredValue.length === 0) {
        return Failure('No validation scores available');
      }
      const scored = scoredValue[0];
      if (!scored) {
        return Failure('No validation score data found');
      }

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
   * Get sampling resource statistics
   */
  getSamplingResourceStats(): ReturnType<typeof this.resourceManager.getStats> {
    return this.resourceManager.getStats();
  }
}
