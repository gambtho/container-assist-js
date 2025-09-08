/**
 * Analysis Sampling Service
 *
 * Main API entry point for analysis sampling functionality.
 * Provides high-level methods for generating optimal repository analysis
 * using multiple strategies and intelligent selection.
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '@types';
import type {
  AnalysisContext,
  AnalysisVariant,
  AnalysisScoringCriteria,
  AnalysisSamplingResult,
  AnalysisSamplingConfig,
} from './analysis-types';
import { AnalysisGenerationPipeline, AnalysisValidator } from './analysis-generation-pipeline';
import { AnalysisVariantScorer } from './analysis-scorer';

/**
 * Configuration options for Analysis Sampling Service
 */
export interface AnalysisSamplingServiceConfig {
  /** Default scoring criteria presets */
  defaultCriteria?: AnalysisScoringCriteria;
  /** Default sampling configuration */
  defaultSamplingConfig?: AnalysisSamplingConfig;
  /** Enable caching of analysis results */
  enableCaching?: boolean;
  /** Maximum number of variants to generate */
  maxVariants?: number;
}

/**
 * Analysis comparison result
 */
export interface AnalysisComparisonResult {
  variants: Array<{
    strategy: string;
    score: number;
    strengths: string[];
    weaknesses: string[];
    recommendation: 'recommended' | 'acceptable' | 'not-recommended';
  }>;
  summary: {
    bestStrategy: string;
    worstStrategy: string;
    averageScore: number;
    recommendedCount: number;
  };
}

/**
 * Main analysis sampling service
 */
export class AnalysisSamplingService {
  private pipeline: AnalysisGenerationPipeline;
  private validator: AnalysisValidator;
  private scorer: AnalysisVariantScorer;
  private config: AnalysisSamplingServiceConfig;

  constructor(
    private logger: Logger,
    config: AnalysisSamplingServiceConfig = {},
  ) {
    this.config = {
      maxVariants: 5,
      enableCaching: false,
      ...config,
    };

    this.pipeline = new AnalysisGenerationPipeline(logger);
    this.validator = new AnalysisValidator(logger);
    this.scorer = new AnalysisVariantScorer(logger);
  }

  /**
   * Generate the best analysis for a repository using intelligent sampling
   */
  async generateBestAnalysis(
    context: AnalysisContext,
    criteria?: AnalysisScoringCriteria,
    samplingConfig?: AnalysisSamplingConfig,
  ): Promise<Result<AnalysisSamplingResult>> {
    const effectiveCriteria = criteria || this.getDefaultCriteria(context);
    const effectiveConfig = { ...this.config.defaultSamplingConfig, ...samplingConfig };

    this.logger.info(
      {
        repoPath: context.repoPath,
        language: context.language,
        criteria: Object.keys(effectiveCriteria),
      },
      'Generating best analysis using sampling',
    );

    try {
      const result = await this.pipeline.executePipeline(
        context,
        effectiveCriteria,
        effectiveConfig,
      );

      if (result.ok) {
        this.logger.info(
          {
            strategy: result.value.bestVariant.strategy,
            score: result.value.bestVariant.score,
            executionTime: result.value.metadata.executionTime,
          },
          'Best analysis generated successfully',
        );
      }

      return result;
    } catch (error) {
      this.logger.error({ error, context }, 'Analysis generation failed');
      return Failure(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Compare multiple analysis variants
   */
  async compareAnalysisVariants(
    variants: AnalysisVariant[],
    criteria?: AnalysisScoringCriteria,
  ): Promise<Result<AnalysisComparisonResult>> {
    if (variants.length === 0) {
      return Failure('No variants provided for comparison');
    }

    this.logger.info(
      {
        variantCount: variants.length,
        strategies: variants.map((v) => v.strategy),
      },
      'Comparing analysis variants',
    );

    try {
      // Use default criteria if none provided
      const effectiveCriteria = criteria || {
        accuracy: { weight: 0.3, minScore: 0.6 },
        completeness: { weight: 0.25, minScore: 0.5 },
        relevance: { weight: 0.25, minScore: 0.5 },
        actionability: { weight: 0.2, minScore: 0.4 },
      };

      // Score all variants
      const scoringResult = await this.scorer.scoreAnalysisVariants(variants, effectiveCriteria);
      if (!scoringResult.ok) {
        return scoringResult;
      }

      const scoredVariants = scoringResult.value;

      // Analyze each variant
      const comparisonVariants = scoredVariants.map((variant) => {
        const strengths: string[] = [];
        const weaknesses: string[] = [];

        // Analyze scores to determine strengths and weaknesses
        if (variant.score.breakdown.accuracy >= 0.8) strengths.push('High accuracy analysis');
        if (variant.score.breakdown.completeness >= 0.8) strengths.push('Comprehensive coverage');
        if (variant.score.breakdown.relevance >= 0.8) strengths.push('Highly relevant insights');
        if (variant.score.breakdown.actionability >= 0.8)
          strengths.push('Clear actionable recommendations');

        if (variant.score.breakdown.accuracy < 0.6) weaknesses.push('Lower accuracy');
        if (variant.score.breakdown.completeness < 0.6) weaknesses.push('Limited coverage');
        if (variant.score.breakdown.relevance < 0.6) weaknesses.push('Less relevant');
        if (variant.score.breakdown.actionability < 0.6) weaknesses.push('Vague recommendations');

        // Determine recommendation level
        let recommendation: 'recommended' | 'acceptable' | 'not-recommended';
        if (variant.score.total >= 80) {
          recommendation = 'recommended';
        } else if (variant.score.total >= 60) {
          recommendation = 'acceptable';
        } else {
          recommendation = 'not-recommended';
        }

        return {
          strategy: variant.strategy,
          score: variant.score.total,
          strengths,
          weaknesses,
          recommendation,
        };
      });

      // Calculate summary statistics
      const scores = scoredVariants.map((v) => v.score.total);
      const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      const recommendedCount = comparisonVariants.filter(
        (v) => v.recommendation === 'recommended',
      ).length;

      const sortedVariants = [...comparisonVariants].sort((a, b) => b.score - a.score);
      const bestStrategy = sortedVariants[0]?.strategy ?? 'none';
      const worstStrategy = sortedVariants[sortedVariants.length - 1]?.strategy ?? 'none';

      const result: AnalysisComparisonResult = {
        variants: comparisonVariants,
        summary: {
          bestStrategy,
          worstStrategy,
          averageScore,
          recommendedCount,
        },
      };

      this.logger.info(
        {
          bestStrategy,
          averageScore: averageScore.toFixed(3),
          recommendedCount,
          totalVariants: variants.length,
        },
        'Analysis variants compared successfully',
      );

      return Success(result);
    } catch (error) {
      this.logger.error({ error, variants: variants.length }, 'Analysis comparison failed');
      return Failure(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Validate analysis variant
   */
  async validateAnalysisVariant(
    variant: AnalysisVariant,
  ): Promise<Result<{ isValid: boolean; issues: string[] }>> {
    this.logger.debug({ strategy: variant.strategy }, 'Validating analysis variant');

    try {
      const validationResult = this.validator.validateVariant(variant);
      const issues: string[] = [];

      if (!validationResult.ok) {
        issues.push(validationResult.error);
      }

      // Additional semantic validation
      if (!variant.dependencies || variant.dependencies.length === 0) {
        issues.push('No dependencies analyzed - may indicate incomplete analysis');
      }

      if (!variant.recommendations || Object.keys(variant.recommendations).length === 0) {
        issues.push('No recommendations provided');
      }

      const isValid = issues.length === 0;

      this.logger.info(
        {
          strategy: variant.strategy,
          isValid,
          issueCount: issues.length,
        },
        'Analysis variant validation completed',
      );

      return Success({ isValid, issues });
    } catch (error) {
      this.logger.error({ error, strategy: variant.strategy }, 'Analysis validation failed');
      return Failure(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Get list of available analysis strategies
   */
  getAvailableStrategies(): string[] {
    return ['comprehensive', 'security-focused', 'performance-focused'];
  }

  /**
   * Get default scoring criteria based on context
   */
  private getDefaultCriteria(context: AnalysisContext): AnalysisScoringCriteria {
    // Default balanced criteria
    let criteria: AnalysisScoringCriteria = {
      accuracy: { weight: 0.3, minScore: 0.6 },
      completeness: { weight: 0.25, minScore: 0.5 },
      relevance: { weight: 0.25, minScore: 0.5 },
      actionability: { weight: 0.2, minScore: 0.4 },
    };

    // Adjust based on context
    if (context.securityFocus) {
      criteria = {
        accuracy: { weight: 0.4, minScore: 0.7 },
        completeness: { weight: 0.2, minScore: 0.6 },
        relevance: { weight: 0.3, minScore: 0.6 },
        actionability: { weight: 0.1, minScore: 0.5 },
      };
    } else if (context.performanceFocus) {
      criteria = {
        accuracy: { weight: 0.25, minScore: 0.6 },
        completeness: { weight: 0.3, minScore: 0.5 },
        relevance: { weight: 0.25, minScore: 0.6 },
        actionability: { weight: 0.2, minScore: 0.5 },
      };
    }

    return this.config.defaultCriteria || criteria;
  }
}
