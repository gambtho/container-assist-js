import { Result, Success, Failure } from '../domain/types/result.js';
import type { Logger } from 'pino';
import { ScoredCandidate, SamplingConfig } from '../lib/sampling.js';
import { BaseSamplingOrchestrator, HighestScoreWinnerSelector } from './sampling/base.js';
import { DockerfileGenerator, DockerfileContext } from './sampling/dockerfile/generators.js';
import {
  DockerfileScorer,
  ProductionDockerfileScorer,
  DevelopmentDockerfileScorer,
} from './sampling/dockerfile/scorers.js';

export interface DockerfileSamplingOptions {
  environment?: 'production' | 'development' | 'test';
  maxCandidates?: number;
  customWeights?: Record<string, number>;
  enableValidation?: boolean;
}

export class DockerfileSamplingOrchestrator extends BaseSamplingOrchestrator<string> {
  constructor(
    logger: Logger,
    options: DockerfileSamplingOptions = {},
    config: Partial<SamplingConfig> = {},
  ) {
    const generator = new DockerfileGenerator(logger);
    const scorer = DockerfileSamplingOrchestrator.createScorer(logger, options);
    const selector = new HighestScoreWinnerSelector<string>();

    const mergedConfig: Partial<SamplingConfig> = {
      maxCandidates: options.maxCandidates || 3,
      validation: {
        enabled: options.enableValidation ?? true,
        failFast: false,
      },
      ...config,
    };

    super(logger, generator, scorer, selector, mergedConfig);
  }

  private static createScorer(
    logger: Logger,
    options: DockerfileSamplingOptions,
  ): DockerfileScorer | ProductionDockerfileScorer | DevelopmentDockerfileScorer {
    const environment = options.environment || 'production';

    switch (environment) {
      case 'production': {
        const prodScorer = new ProductionDockerfileScorer(logger);
        if (options.customWeights) {
          prodScorer.updateWeights(options.customWeights);
        }
        return prodScorer;
      }

      case 'development': {
        const devScorer = new DevelopmentDockerfileScorer(logger);
        if (options.customWeights) {
          devScorer.updateWeights(options.customWeights);
        }
        return devScorer;
      }

      case 'test':
      default: {
        const defaultScorer = new DockerfileScorer(logger);
        if (options.customWeights) {
          defaultScorer.updateWeights(options.customWeights);
        }
        return defaultScorer;
      }
    }
  }

  async generateBestDockerfile(
    context: DockerfileContext,
  ): Promise<Result<ScoredCandidate<string>>> {
    this.logger.info({ sessionId: context.sessionId }, 'Starting Dockerfile sampling');

    const result = await this.sample(context);

    if (result.success) {
      this.logger.info(
        {
          sessionId: context.sessionId,
          winnerId: result.data.id,
          winnerScore: result.data.score,
          strategy: result.data.metadata.strategy,
        },
        'Dockerfile sampling completed successfully',
      );
    } else {
      this.logger.error(
        {
          sessionId: context.sessionId,
          error: result.error,
        },
        'Dockerfile sampling failed',
      );
    }

    return result;
  }

  async generateMultipleDockerfiles(
    context: DockerfileContext,
    count: number,
  ): Promise<Result<ScoredCandidate<string>[]>> {
    this.logger.info(
      { sessionId: context.sessionId, count },
      'Starting multiple Dockerfile sampling',
    );

    const result = await this.sampleMultiple(context, count);

    if (result.success) {
      this.logger.info(
        {
          sessionId: context.sessionId,
          generatedCount: result.data.length,
          topScore: result.data[0]?.score,
        },
        'Multiple Dockerfile sampling completed successfully',
      );
    } else {
      this.logger.error(
        {
          sessionId: context.sessionId,
          error: result.error,
        },
        'Multiple Dockerfile sampling failed',
      );
    }

    return result;
  }

  // Convenience method for validating a specific Dockerfile
  async validateDockerfile(dockerfile: string): Promise<Result<boolean>> {
    try {
      // Create a temporary candidate for validation
      const tempCandidate = {
        id: 'temp-validation',
        content: dockerfile,
        metadata: {
          strategy: 'validation',
          source: 'user-provided',
          confidence: 1.0,
        },
        generatedAt: new Date(),
      };

      return await this.generator.validate(tempCandidate);
    } catch (error) {
      return Failure(
        `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // Method to score a user-provided Dockerfile
  async scoreDockerfile(dockerfile: string): Promise<Result<ScoredCandidate<string>>> {
    try {
      const tempCandidate = {
        id: 'temp-scoring',
        content: dockerfile,
        metadata: {
          strategy: 'user-provided',
          source: 'scoring-request',
          confidence: 1.0,
        },
        generatedAt: new Date(),
      };

      const scoreResult = await this.scorer.score([tempCandidate]);
      if (!scoreResult.success) {
        return Failure(scoreResult.error);
      }

      return Success(scoreResult.data[0]);
    } catch (error) {
      return Failure(`Scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Factory function for easy instantiation
export const createDockerfileSampler = (
  logger: Logger,
  options: DockerfileSamplingOptions = {},
): DockerfileSamplingOrchestrator => {
  return new DockerfileSamplingOrchestrator(logger, options);
};

// Type exports for external use
export type { DockerfileContext, DockerfileSamplingOptions };
