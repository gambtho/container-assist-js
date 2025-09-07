import { Result, Success, Failure } from '../types/core.js';
import type { Logger } from 'pino';
import { ScoredCandidate, SamplingConfig, GenerationContext, Candidate } from '../lib/sampling.js';
import {
  runSampling,
  runSamplingForTopN,
  GeneratorFunction,
  ScorerFunction,
  scoreCanidates,
  calculateFinalScore,
  createCandidateId,
} from './functional-sampling.js';
import { DEFAULT_PORTS } from '../config/defaults.js';
// Define DockerfileContext locally since we deleted the generators
export interface DockerfileContext {
  sessionId: string;
  repoPath?: string;
  requirements?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  previousAttempts?: string[];
}

export interface DockerfileSamplingOptions {
  environment?: 'production' | 'development' | 'test';
  maxCandidates?: number;
  customWeights?: Record<string, number>;
  enableValidation?: boolean;
}

export interface DockerfileSampler {
  generateBestDockerfile(context: DockerfileContext): Promise<Result<string>>;
  generateMultipleDockerfiles(context: DockerfileContext, count: number): Promise<Result<string[]>>;
  validateDockerfile(dockerfile: string): Promise<Result<boolean>>;
  scoreDockerfile(dockerfile: string): Promise<Result<number>>;
  getBestDockerfile(context: DockerfileContext): Promise<Result<string>>;
  getMultipleDockerfiles(context: DockerfileContext, count: number): Promise<Result<string[]>>;
  compareDockerfiles(dockerfiles: string[]): Promise<Result<number>>;
}

/**
 * Simple scoring weights by environment
 */
const ENVIRONMENT_WEIGHTS = {
  production: {
    security: 0.4,
    performance: 0.3,
    standards: 0.2,
    maintainability: 0.1,
  },
  development: {
    maintainability: 0.4,
    standards: 0.3,
    performance: 0.2,
    security: 0.1,
  },
  test: {
    standards: 0.4,
    maintainability: 0.3,
    security: 0.2,
    performance: 0.1,
  },
};

/**
 * Simple Dockerfile generator function
 */
const generateDockerfileCandidates: GeneratorFunction<string> = async (
  context: GenerationContext,
  count: number,
  logger: Logger,
): Promise<Result<Candidate<string>[]>> => {
  try {
    const candidates: Candidate<string>[] = [];

    // Simple generation strategies
    const strategies = ['alpine-minimal', 'alpine-multistage', 'ubuntu-standard'];

    for (let i = 0; i < Math.min(count, strategies.length); i++) {
      const strategy = strategies[i % strategies.length] ?? 'alpine-minimal';
      const candidateId = createCandidateId(strategy, context);

      // Simple Dockerfile generation based on strategy
      const dockerfile = generateDockerfileContent(strategy, context as DockerfileContext);

      candidates.push({
        id: candidateId,
        content: dockerfile,
        metadata: {
          strategy: strategy || 'unknown',
          confidence: 0.8,
          source: 'simple-generator',
        },
        generatedAt: new Date(),
      });
    }

    logger.debug({ candidatesGenerated: candidates.length }, 'Generated Dockerfile candidates');
    return Success(candidates);
  } catch (error) {
    return Failure(
      `Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};

/**
 * Simple Dockerfile scorer function
 */
const scoreDockerfileCandidates: ScorerFunction<string> = async (
  candidates: Candidate<string>[],
  weights: Record<string, number>,
  logger: Logger,
): Promise<Result<ScoredCandidate<string>[]>> => {
  const scoringFunction = async (
    candidate: Candidate<string>,
  ): Promise<Result<ScoredCandidate<string>>> => {
    try {
      // Simple scoring based on content analysis
      const dockerfile = candidate.content;
      const scoreBreakdown = {
        security: scoreDockerfileSecurity(dockerfile),
        performance: scoreDockerfilePerformance(dockerfile),
        standards: scoreDockerfileStandards(dockerfile),
        maintainability: scoreDockerfileMaintainability(dockerfile),
      };

      const finalScore = calculateFinalScore(scoreBreakdown, weights);

      const scored: ScoredCandidate<string> = {
        ...candidate,
        score: finalScore,
        scoreBreakdown,
        rank: 0, // Will be set by scoring function
      };

      return Success(scored);
    } catch (error) {
      return Failure(`Scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return scoreCanidates(candidates, scoringFunction, logger);
};

/**
 * Generate simple Dockerfile content based on strategy
 */
function generateDockerfileContent(strategy: string, _context: DockerfileContext): string {
  const baseImageMap = {
    'alpine-minimal': 'node:18-alpine',
    'alpine-multistage': 'node:18-alpine',
    'ubuntu-standard': 'node:18',
  };

  const baseImage = baseImageMap[strategy as keyof typeof baseImageMap] || 'node:18-alpine';

  if (strategy === 'alpine-multistage') {
    return `# Multi-stage Dockerfile
FROM ${baseImage} AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM ${baseImage}
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE ${DEFAULT_PORTS.javascript[0]}
CMD ["npm", "start"]`;
  }

  return `FROM ${baseImage}
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE ${DEFAULT_PORTS.javascript[0]}
CMD ["npm", "start"]`;
}

/**
 * Simple scoring functions
 */
function scoreDockerfileSecurity(dockerfile: string): number {
  let score = 0.5; // Base score

  if (dockerfile.includes('USER ') && !dockerfile.includes('USER root')) score += 0.3;
  if (dockerfile.includes('alpine')) score += 0.2;
  if (!dockerfile.includes('rm -rf')) score += 0.1;

  return Math.min(score, 1.0);
}

function scoreDockerfilePerformance(dockerfile: string): number {
  let score = 0.5;

  if (dockerfile.includes('FROM') && dockerfile.split('FROM').length > 2) score += 0.2; // Multi-stage
  if (dockerfile.includes('npm ci')) score += 0.2;
  if (dockerfile.includes('alpine')) score += 0.1;

  return Math.min(score, 1.0);
}

function scoreDockerfileStandards(dockerfile: string): number {
  let score = 0.5;

  if (dockerfile.includes('WORKDIR')) score += 0.2;
  if (dockerfile.includes('COPY package')) score += 0.2;
  if (dockerfile.includes('EXPOSE')) score += 0.1;

  return Math.min(score, 1.0);
}

function scoreDockerfileMaintainability(dockerfile: string): number {
  let score = 0.5;

  if (dockerfile.includes('#')) score += 0.2; // Has comments
  if (dockerfile.split('\n').length < 15) score += 0.2; // Not too long
  if (!dockerfile.includes('&&')) score += 0.1; // Simple commands

  return Math.min(score, 1.0);
}

/**
 * Simple function to generate the best Dockerfile
 */
export const generateBestDockerfile = async (
  context: DockerfileContext,
  options: DockerfileSamplingOptions = {},
  logger: Logger,
): Promise<Result<ScoredCandidate<string>>> => {
  const environment = options.environment || 'production';
  const weights = { ...ENVIRONMENT_WEIGHTS[environment], ...options.customWeights };
  const config: Partial<SamplingConfig> = {
    maxCandidates: options.maxCandidates || 3,
  };

  logger.info({ sessionId: context.sessionId }, 'Starting Dockerfile sampling');

  const result = await runSampling(
    context,
    generateDockerfileCandidates,
    scoreDockerfileCandidates,
    weights,
    logger,
    config,
  );

  if (result.ok) {
    logger.info(
      {
        sessionId: context.sessionId,
        winnerId: result.value.id,
        winnerScore: result.value.score,
        strategy: result.value.metadata.strategy,
      },
      'Dockerfile sampling completed successfully',
    );
  } else {
    logger.error(
      {
        sessionId: context.sessionId,
        error: result.error,
      },
      'Dockerfile sampling failed',
    );
  }

  return result;
};

/**
 * Simple function to generate multiple Dockerfiles
 */
export const generateMultipleDockerfiles = async (
  context: DockerfileContext,
  count: number,
  options: DockerfileSamplingOptions = {},
  logger: Logger,
): Promise<Result<ScoredCandidate<string>[]>> => {
  const environment = options.environment || 'production';
  const weights = { ...ENVIRONMENT_WEIGHTS[environment], ...options.customWeights };
  const config: Partial<SamplingConfig> = {
    maxCandidates: options.maxCandidates || 3,
  };

  logger.info({ sessionId: context.sessionId, count }, 'Starting multiple Dockerfile sampling');

  const result = await runSamplingForTopN(
    context,
    generateDockerfileCandidates,
    scoreDockerfileCandidates,
    weights,
    count,
    logger,
    config,
  );

  if (result.ok) {
    logger.info(
      {
        sessionId: context.sessionId,
        generatedCount: result.value.length,
        topScore: result.value[0]?.score,
      },
      'Multiple Dockerfile sampling completed successfully',
    );
  } else {
    logger.error(
      {
        sessionId: context.sessionId,
        error: result.error,
      },
      'Multiple Dockerfile sampling failed',
    );
  }

  return result;
};

/**
 * Simple validation function for Dockerfiles
 */
export const validateDockerfile = async (
  dockerfile: string,
  _logger: Logger,
): Promise<Result<boolean>> => {
  try {
    // Simple validation: check for required instructions
    const required = ['FROM', 'WORKDIR'];
    const missing = required.filter((instruction) => !dockerfile.includes(instruction));

    if (missing.length > 0) {
      return Failure(`Missing required instructions: ${missing.join(', ')}`);
    }

    return Success(true);
  } catch (error) {
    return Failure(
      `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};

/**
 * Simple scoring function for user-provided Dockerfiles
 */
export const scoreDockerfile = async (
  dockerfile: string,
  options: DockerfileSamplingOptions = {},
  logger: Logger,
): Promise<Result<ScoredCandidate<string>>> => {
  try {
    const tempCandidate: Candidate<string> = {
      id: 'temp-scoring',
      content: dockerfile,
      metadata: {
        strategy: 'user-provided',
        source: 'scoring-request',
        confidence: 1.0,
      },
      generatedAt: new Date(),
    };

    const environment = options.environment || 'production';
    const weights = { ...ENVIRONMENT_WEIGHTS[environment], ...options.customWeights };

    const scoreResult = await scoreDockerfileCandidates([tempCandidate], weights, logger);
    if (!scoreResult.ok) {
      return Failure(scoreResult.error);
    }

    const firstResult = scoreResult.value[0];
    if (!firstResult) {
      return Failure('No scoring result available');
    }

    return Success(firstResult);
  } catch (error) {
    return Failure(`Scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Backward compatibility: create a simple sampler object
 */
export const createDockerfileSampler = (
  logger: Logger,
  options: DockerfileSamplingOptions = {},
): DockerfileSampler => {
  return {
    async generateBestDockerfile(context: DockerfileContext): Promise<Result<string>> {
      const result = await generateBestDockerfile(context, options, logger);
      if (result.ok) {
        return Success(result.value.content);
      }
      return Failure(result.error);
    },
    async generateMultipleDockerfiles(
      context: DockerfileContext,
      count: number,
    ): Promise<Result<string[]>> {
      const result = await generateMultipleDockerfiles(context, count, options, logger);
      if (result.ok) {
        return Success(result.value.map((candidate) => candidate.content));
      }
      return Failure(result.error);
    },
    async validateDockerfile(dockerfile: string): Promise<Result<boolean>> {
      return validateDockerfile(dockerfile, logger);
    },
    async scoreDockerfile(dockerfile: string): Promise<Result<number>> {
      const result = await scoreDockerfile(dockerfile, options, logger);
      if (result.ok) {
        return Success(result.value.score);
      }
      return Failure(result.error);
    },
    async getBestDockerfile(context: DockerfileContext): Promise<Result<string>> {
      const result = await generateBestDockerfile(context, options, logger);
      if (result.ok) {
        return Success(result.value.content);
      }
      return Failure(result.error);
    },
    async getMultipleDockerfiles(
      context: DockerfileContext,
      count: number,
    ): Promise<Result<string[]>> {
      const result = await generateMultipleDockerfiles(context, count, options, logger);
      if (result.ok) {
        return Success(result.value.map((candidate) => candidate.content));
      }
      return Failure(result.error);
    },
    async compareDockerfiles(dockerfiles: string[]): Promise<Result<number>> {
      // Simple comparison - return count of valid dockerfiles
      return Success(dockerfiles.length);
    },
  };
};

// Export the simple orchestrator type
export class DockerfileSamplingOrchestrator {
  constructor(
    private logger: Logger,
    private options: DockerfileSamplingOptions = {},
  ) {}

  async generateBestDockerfile(context: DockerfileContext): Promise<Result<string>> {
    const result = await generateBestDockerfile(context, this.options, this.logger);
    if (result.ok) {
      return Success(result.value.content);
    }
    return Failure(result.error);
  }

  async generateMultipleDockerfiles(
    context: DockerfileContext,
    count: number,
  ): Promise<Result<string[]>> {
    const result = await generateMultipleDockerfiles(context, count, this.options, this.logger);
    if (result.ok) {
      return Success(result.value.map((candidate) => candidate.content));
    }
    return Failure(result.error);
  }

  async validateDockerfile(dockerfile: string): Promise<Result<boolean>> {
    return validateDockerfile(dockerfile, this.logger);
  }

  async scoreDockerfile(dockerfile: string): Promise<Result<number>> {
    const result = await scoreDockerfile(dockerfile, this.options, this.logger);
    if (result.ok) {
      return Success(result.value.score);
    }
    return Failure(result.error);
  }
}

// DockerfileContext is already exported above
