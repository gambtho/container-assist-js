import { Result, Success, Failure } from '../../../domain/types/result.js';
import type { Logger } from 'pino';
import { Candidate, ScoredCandidate, DEFAULT_SCORING_WEIGHTS } from '../../../lib/sampling.js';
import { BaseCandidateScorer } from '../base.js';

export class DockerfileScorer extends BaseCandidateScorer<string> {
  readonly name: string = 'dockerfile-scorer';

  constructor(logger: Logger, weights = DEFAULT_SCORING_WEIGHTS) {
    super(logger, weights);
  }

  protected async scoreCandidate(
    candidate: Candidate<string>,
  ): Promise<Result<ScoredCandidate<string>>> {
    try {
      const dockerfile = candidate.content;

      // Calculate scores for each criterion
      const scoreBreakdown = {
        buildTime: this.scoreBuildTime(candidate.metadata.estimatedBuildTime || 300),
        imageSize: this.scoreImageSize(candidate.metadata.estimatedSize || 100),
        security: this.scoreSecurity(dockerfile, candidate.metadata.securityRating),
        bestPractices: this.scoreBestPractices(dockerfile),
        maintenance: this.scoreMaintenance(dockerfile),
        performance: this.scorePerformance(dockerfile),
      };

      const finalScore = this.calculateFinalScore(scoreBreakdown);

      const scoredCandidate: ScoredCandidate<string> = {
        ...candidate,
        score: Math.round(finalScore * 100) / 100, // Round to 2 decimal places
        scoreBreakdown,
        rank: 0, // Will be set by the scoring system
      };

      return Success(scoredCandidate);
    } catch (error) {
      const errorMessage = `Scoring failed for candidate ${candidate.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error({ candidateId: candidate.id, error }, errorMessage);
      return Failure(errorMessage);
    }
  }

  private scoreBuildTime(estimatedSeconds: number): number {
    // Score based on build time: faster is better
    // 0-60s = 100, 60-180s = 80, 180-300s = 60, 300s+ = 40
    if (estimatedSeconds <= 60) return 100;
    if (estimatedSeconds <= 180) return 100 - ((estimatedSeconds - 60) / 120) * 20; // Linear decay from 100 to 80
    if (estimatedSeconds <= 300) return 80 - ((estimatedSeconds - 180) / 120) * 20; // Linear decay from 80 to 60
    return Math.max(40 - ((estimatedSeconds - 300) / 300) * 20, 20); // Minimum score of 20
  }

  private scoreImageSize(estimatedMB: number): number {
    // Score based on image size: smaller is better
    // 0-50MB = 100, 50-100MB = 80, 100-200MB = 60, 200MB+ = 40
    if (estimatedMB <= 50) return 100;
    if (estimatedMB <= 100) return 100 - ((estimatedMB - 50) / 50) * 20;
    if (estimatedMB <= 200) return 80 - ((estimatedMB - 100) / 100) * 20;
    return Math.max(40 - ((estimatedMB - 200) / 200) * 20, 20);
  }

  private scoreSecurity(dockerfile: string, securityRating?: number): number {
    let score = 0;

    // Use provided security rating if available
    if (securityRating) {
      score = securityRating * 10; // Convert 1-10 rating to 0-100 score
    } else {
      // Calculate based on security practices
      score = this.calculateSecurityScore(dockerfile);
    }

    return Math.min(Math.max(score, 0), 100);
  }

  private calculateSecurityScore(dockerfile: string): number {
    let score = 60; // Base score

    // Check for non-root user
    if (/^USER\s+(?!root)[^\s]+/m.test(dockerfile)) {
      score += 15;
    }

    // Check for specific version tags (not latest)
    if (!/FROM\s+[^:\s]+:latest/m.test(dockerfile)) {
      score += 10;
    }

    // Check for health checks
    if (/^HEALTHCHECK/m.test(dockerfile)) {
      score += 5;
    }

    // Check for minimal base images (alpine, slim)
    if (/FROM\s+[^:\s]*(?:alpine|slim)/m.test(dockerfile)) {
      score += 10;
    }

    // Check for proper signal handling (dumb-init)
    if (/dumb-init/.test(dockerfile)) {
      score += 5;
    }

    // Check for package manager cache cleanup
    if (/(?:apt-get clean|rm -rf \/var\/lib\/apt\/lists\*|npm cache clean)/.test(dockerfile)) {
      score += 5;
    }

    return Math.min(score, 100);
  }

  private scoreBestPractices(dockerfile: string): number {
    let score = 50; // Base score

    const practices = [
      {
        pattern: /^WORKDIR\s/m,
        points: 10,
        description: 'Uses WORKDIR',
      },
      {
        pattern: /^COPY.*package.*json.*\./m,
        points: 10,
        description: 'Copies package.json separately for better caching',
      },
      {
        pattern: /&&.*\\\s*$/m,
        points: 8,
        description: 'Uses command chaining',
      },
      {
        pattern: /^EXPOSE\s+\d+/m,
        points: 8,
        description: 'Explicitly exposes ports',
      },
      {
        pattern: /--no-install-recommends|--only=production|--ignore-scripts/,
        points: 12,
        description: 'Uses production optimizations',
      },
      {
        pattern: /^LABEL/m,
        points: 5,
        description: 'Uses labels for metadata',
      },
      {
        pattern: /^\s*#.*$/m,
        points: 5,
        description: 'Has comments',
      },
    ];

    for (const practice of practices) {
      if (practice.pattern.test(dockerfile)) {
        score += practice.points;
      }
    }

    return Math.min(score, 100);
  }

  private scoreMaintenance(dockerfile: string): number {
    let score = 60; // Base score

    // Multi-stage builds are more maintainable
    if (/^FROM.*AS\s+\w+/m.test(dockerfile)) {
      score += 15;
    }

    // Clear structure and organization
    const lines = dockerfile.split('\n').filter((line) => line.trim());
    const commentLines = lines.filter((line) => line.trim().startsWith('#')).length;
    const commentRatio = commentLines / lines.length;

    if (commentRatio > 0.1) {
      // More than 10% comments
      score += 10;
    }

    // Logical instruction ordering
    const instructions = dockerfile.match(/^[A-Z]+/gm) || [];
    const hasLogicalOrder = this.checkInstructionOrder(instructions);
    if (hasLogicalOrder) {
      score += 10;
    }

    // Not too complex (reasonable number of layers)
    const layerCount = instructions.filter((inst) => ['RUN', 'COPY', 'ADD'].includes(inst)).length;

    if (layerCount <= 10) {
      score += 5;
    }

    return Math.min(score, 100);
  }

  private scorePerformance(dockerfile: string): number {
    let score = 60; // Base score

    // Layer optimization
    if (/RUN.*&&.*\\/.test(dockerfile)) {
      score += 15; // Command chaining reduces layers
    }

    // Cache optimization
    if (/COPY.*package.*json.*\n.*RUN.*install/.test(dockerfile)) {
      score += 10; // Package files copied before source for better caching
    }

    // Cleanup in same layer
    if (/RUN.*(?:apt-get clean|rm -rf|cache clean)/.test(dockerfile)) {
      score += 10;
    }

    // Multi-stage builds for smaller final image
    if (/^FROM.*AS\s+\w+.*\n[\s\S]*^FROM(?!.*AS)/m.test(dockerfile)) {
      score += 10;
    }

    // Use of .dockerignore implied by clean COPY operations
    if (!/COPY \. \./.test(dockerfile)) {
      score += 5; // More selective copying
    }

    return Math.min(score, 100);
  }

  private checkInstructionOrder(instructions: string[]): boolean {
    // Expected order: FROM, LABEL, ARG, ENV, WORKDIR, COPY, RUN, EXPOSE, USER, CMD/ENTRYPOINT
    const orderMap: Record<string, number> = {
      FROM: 1,
      LABEL: 2,
      ARG: 3,
      ENV: 4,
      WORKDIR: 5,
      COPY: 6,
      ADD: 6,
      RUN: 7,
      EXPOSE: 8,
      USER: 9,
      CMD: 10,
      ENTRYPOINT: 10,
      HEALTHCHECK: 9,
    };

    let lastOrder = 0;
    let outOfOrderCount = 0;

    for (const instruction of instructions) {
      const order = orderMap[instruction] || 7; // Default to RUN order
      if (order < lastOrder) {
        outOfOrderCount++;
      }
      lastOrder = order;
    }

    // Allow some flexibility - up to 20% out of order
    return outOfOrderCount / instructions.length < 0.2;
  }
}

// Specialized scorer for different contexts
export class ProductionDockerfileScorer extends DockerfileScorer {
  override readonly name = 'production-dockerfile-scorer';

  constructor(logger: Logger) {
    // Production weights emphasize security and performance
    const productionWeights = {
      buildTime: 0.15,
      imageSize: 0.2,
      security: 0.4,
      bestPractices: 0.15,
      maintenance: 0.05,
      performance: 0.05,
    };

    super(logger, productionWeights);
  }
}

export class DevelopmentDockerfileScorer extends DockerfileScorer {
  override readonly name = 'development-dockerfile-scorer';

  constructor(logger: Logger) {
    // Development weights emphasize build time and maintenance
    const developmentWeights = {
      buildTime: 0.3,
      imageSize: 0.1,
      security: 0.2,
      bestPractices: 0.1,
      maintenance: 0.2,
      performance: 0.1,
    };

    super(logger, developmentWeights);
  }
}
