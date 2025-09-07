/**
 * Sampling Service - Main entry point for Dockerfile sampling functionality
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../../types/core';
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

/**
 * High-level sampling service that provides the main API for Dockerfile sampling
 */
export class SamplingService {
  private pipeline: VariantGenerationPipeline;

  constructor(private logger: Logger) {
    this.pipeline = new VariantGenerationPipeline(logger);
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
        constraints: options.optimization
          ? { preferredOptimization: options.optimization }
          : undefined,
      };

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
    return this.pipeline.generateSampledDockerfiles(config);
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
      const pipeline = new VariantGenerationPipeline(this.logger);
      const scorer = (pipeline as any).scorer;

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

      const pipeline = new VariantGenerationPipeline(this.logger);
      const scorer = (pipeline as any).scorer;

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
      if (parts.length >= 2) {
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
    const summary = `Best variant: ${best.id} (${best.strategy}) with score ${best.score.total}/100`;

    const advantages: Record<string, string[]> = {};
    const tradeoffs: Record<string, string[]> = {};

    scoredVariants.forEach((variant) => {
      advantages[variant.id] = variant.score.reasons;
      tradeoffs[variant.id] = variant.score.warnings;
    });

    return { summary, advantages, tradeoffs };
  }
}
