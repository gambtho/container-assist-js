/**
 * Mock Sampling Service - Team Delta Development Support
 *
 * Provides a mock implementation of the sampling service interface
 * for independent Team Delta development. Will be replaced by Team Beta's
 * actual sampling implementation.
 */

import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import type {
  SamplingService,
  Candidate,
  ScoredCandidate,
  CandidateGenerator,
  SamplingConfig,
} from '../interfaces';

/**
 * Dockerfile candidate structure
 */
export interface DockerfileCandidate {
  content: string;
  baseImage: string;
  multistage: boolean;
  optimization: 'size' | 'security' | 'performance' | 'balanced';
  metadata: {
    estimatedSize: number;
    securityScore: number;
    performanceScore: number;
    maintainabilityScore: number;
    buildTime: number;
  };
}

/**
 * K8s manifest candidate structure
 */
export interface K8sManifestCandidate {
  manifests: string;
  strategy: 'minimal' | 'production' | 'enterprise';
  resources: {
    cpu: string;
    memory: string;
  };
  replicas: number;
  metadata: {
    securityScore: number;
    scalabilityScore: number;
    reliabilityScore: number;
    efficiencyScore: number;
  };
}

/**
 * Mock Dockerfile candidate generator
 */
export class MockDockerfileCandidateGenerator implements CandidateGenerator<DockerfileCandidate> {
  constructor(private logger: Logger) {}

  async generate(input: unknown, count: number): Promise<Candidate<DockerfileCandidate>[]> {
    const analysisInput = input as {
      language?: string;
      framework?: string;
      dependencies?: Array<{ name: string }>;
      ports?: number[];
    };

    this.logger.debug({ input: analysisInput, count }, 'Generating Dockerfile candidates');

    const candidates: Candidate<DockerfileCandidate>[] = [];
    const language = analysisInput.language ?? 'unknown';
    const framework = analysisInput.framework;
    const ports = analysisInput.ports ?? [3000];
    const primaryPort = ports[0];

    // Generate different optimization strategies
    const strategies: Array<{
      optimization: DockerfileCandidate['optimization'];
      baseImage: string;
      multistage: boolean;
    }> = [
      { optimization: 'size', baseImage: this.getAlpineImage(language), multistage: true },
      { optimization: 'security', baseImage: this.getDistrolessImage(language), multistage: true },
      {
        optimization: 'performance',
        baseImage: this.getStandardImage(language),
        multistage: false,
      },
      { optimization: 'balanced', baseImage: this.getSlimImage(language), multistage: true },
    ];

    for (let i = 0; i < Math.min(count, strategies.length); i++) {
      const strategy = strategies[i];
      if (!strategy) continue;
      
      const candidate = await this.generateDockerfileCandidate(
        strategy,
        language,
        framework,
        primaryPort || 3000,
        analysisInput,
      );

      candidates.push({
        id: createHash('sha256').update(candidate.content).digest('hex').slice(0, 16),
        content: candidate,
        metadata: {
          strategy: strategy?.optimization,
          language,
          framework,
          generatedAt: new Date().toISOString(),
        },
        generatedAt: new Date(),
      });
    }

    this.logger.debug({ candidateCount: candidates.length }, 'Generated Dockerfile candidates');
    return candidates;
  }

  async validate(candidate: Candidate<DockerfileCandidate>): Promise<boolean> {
    // Basic validation - check if Dockerfile has required elements
    const dockerfile = candidate.content.content;
    return (
      dockerfile.includes('FROM') &&
      dockerfile.includes('WORKDIR') &&
      (dockerfile.includes('CMD') || dockerfile.includes('ENTRYPOINT'))
    );
  }

  private async generateDockerfileCandidate(
    strategy: {
      optimization: DockerfileCandidate['optimization'];
      baseImage: string;
      multistage: boolean;
    },
    language: string,
    framework: string | undefined,
    port: number,
    _analysisInput: any,
  ): Promise<DockerfileCandidate> {
    const dockerfile = this.buildDockerfileContent(strategy, language, framework, port);

    return {
      content: dockerfile,
      baseImage: strategy.baseImage,
      multistage: strategy.multistage,
      optimization: strategy.optimization,
      metadata: {
        estimatedSize: this.estimateImageSize(strategy, language),
        securityScore: this.calculateSecurityScore(strategy, dockerfile),
        performanceScore: this.calculatePerformanceScore(strategy, dockerfile),
        maintainabilityScore: this.calculateMaintainabilityScore(strategy, dockerfile),
        buildTime: this.estimateBuildTime(strategy, language),
      },
    };
  }

  private buildDockerfileContent(
    strategy: { optimization: string; baseImage: string; multistage: boolean },
    language: string,
    framework: string | undefined,
    port: number,
  ): string {
    let dockerfile = `# ${strategy.optimization.toUpperCase()}-optimized Dockerfile for ${language}\n`;
    dockerfile += `# Generated: ${new Date().toISOString()}\n\n`;

    if (strategy.multistage) {
      dockerfile += this.buildMultistageDockerfile(strategy.baseImage, language, framework, port);
    } else {
      dockerfile += this.buildSingleStageDockerfile(strategy.baseImage, language, framework, port);
    }

    return dockerfile;
  }

  private buildMultistageDockerfile(
    baseImage: string,
    language: string,
    framework: string | undefined,
    port: number,
  ): string {
    const runtimeImage = baseImage.includes('alpine')
      ? baseImage
      : baseImage.replace(/:([\d.]+).*/, ':$1-slim');

    return `# Build stage
FROM ${baseImage} AS builder
WORKDIR /app

${this.getBuildCommands(language, 'build')}

# Runtime stage  
FROM ${runtimeImage}
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 -G appuser

${this.getBuildCommands(language, 'runtime')}

EXPOSE ${port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:${port}/health || exit 1

USER appuser

${this.getStartCommand(language, framework)}`;
  }

  private buildSingleStageDockerfile(
    baseImage: string,
    language: string,
    framework: string | undefined,
    port: number,
  ): string {
    return `FROM ${baseImage}
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 -G appuser

${this.getBuildCommands(language, 'single')}

EXPOSE ${port}

USER appuser

${this.getStartCommand(language, framework)}`;
  }

  private getBuildCommands(language: string, stage: 'build' | 'runtime' | 'single'): string {
    const commands: Record<string, Record<string, string>> = {
      javascript: {
        build: 'COPY package*.json ./\nRUN npm ci --only=production\nCOPY . .',
        runtime:
          'COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules\nCOPY --chown=appuser:appuser . .',
        single:
          'COPY package*.json ./\nRUN npm ci --only=production\nCOPY --chown=appuser:appuser . .',
      },
      typescript: {
        build: 'COPY package*.json tsconfig.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build',
        runtime:
          'COPY --from=builder --chown=appuser:appuser /app/dist ./dist\nCOPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules',
        single:
          'COPY package*.json tsconfig.json ./\nRUN npm ci\nCOPY --chown=appuser:appuser . .\nRUN npm run build',
      },
      python: {
        build:
          'COPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .',
        runtime: 'COPY --from=builder --chown=appuser:appuser /app /app',
        single:
          'COPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY --chown=appuser:appuser . .',
      },
    };

    return commands[language]?.[stage] ?? 'COPY --chown=appuser:appuser . .';
  }

  private getStartCommand(language: string, framework?: string): string {
    if (language === 'javascript' || language === 'typescript') {
      if (framework === 'nextjs') return 'CMD ["npm", "start"]';
      if (framework === 'express') return 'CMD ["node", "index.js"]';
      return 'CMD ["npm", "start"]';
    }
    if (language === 'python') {
      if (framework === 'django') return 'CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]';
      if (framework === 'flask') return 'CMD ["python", "-m", "flask", "run", "--host=0.0.0.0"]';
      return 'CMD ["python", "app.py"]';
    }
    return 'CMD ["/bin/sh"]';
  }

  private getAlpineImage(language: string): string {
    const images: Record<string, string> = {
      javascript: 'node:18-alpine',
      typescript: 'node:18-alpine',
      python: 'python:3.11-alpine',
      go: 'golang:1.21-alpine',
    };
    return images[language] ?? 'alpine:latest';
  }

  private getDistrolessImage(language: string): string {
    const images: Record<string, string> = {
      javascript: 'gcr.io/distroless/nodejs18-debian11',
      typescript: 'gcr.io/distroless/nodejs18-debian11',
      python: 'gcr.io/distroless/python3-debian11',
      go: 'gcr.io/distroless/static-debian11',
    };
    return images[language] ?? 'gcr.io/distroless/base-debian11';
  }

  private getStandardImage(language: string): string {
    const images: Record<string, string> = {
      javascript: 'node:18',
      typescript: 'node:18',
      python: 'python:3.11',
      go: 'golang:1.21',
    };
    return images[language] ?? 'ubuntu:22.04';
  }

  private getSlimImage(language: string): string {
    const images: Record<string, string> = {
      javascript: 'node:18-slim',
      typescript: 'node:18-slim',
      python: 'python:3.11-slim',
      go: 'golang:1.21-alpine',
    };
    return images[language] ?? 'debian:11-slim';
  }

  private estimateImageSize(
    strategy: { optimization: string; multistage: boolean },
    language: string,
  ): number {
    const baseSizes: Record<string, number> = {
      javascript: 150,
      typescript: 180,
      python: 120,
      go: 50,
    };

    let size = baseSizes[language] ?? 100;

    if (strategy.optimization === 'size') size *= 0.6;
    if (strategy.optimization === 'security') size *= 0.8;
    if (strategy.multistage) size *= 0.7;

    return Math.round(size);
  }

  private calculateSecurityScore(
    strategy: { optimization: string; baseImage: string },
    dockerfile: string,
  ): number {
    let score = 70;

    if (strategy.optimization === 'security') score += 20;
    if (strategy.baseImage.includes('distroless')) score += 15;
    if (strategy.baseImage.includes('alpine')) score += 10;
    if (dockerfile.includes('USER ') && !dockerfile.includes('USER root')) score += 10;
    if (dockerfile.includes('HEALTHCHECK')) score += 5;

    return Math.min(100, score);
  }

  private calculatePerformanceScore(
    strategy: { optimization: string; multistage: boolean },
    dockerfile: string,
  ): number {
    let score = 70;

    if (strategy.optimization === 'performance') score += 20;
    if (!strategy.multistage) score += 10; // Single stage is faster to build
    if (dockerfile.includes('--no-cache-dir')) score += 5;
    if (dockerfile.includes('npm ci')) score += 5;

    return Math.min(100, score);
  }

  private calculateMaintainabilityScore(
    strategy: { optimization: string },
    dockerfile: string,
  ): number {
    let score = 70;

    if (strategy.optimization === 'balanced') score += 15;
    if (dockerfile.split('\n').filter((line) => line.startsWith('#')).length > 3) score += 10; // Comments
    if (dockerfile.includes('HEALTHCHECK')) score += 10;
    if (!dockerfile.includes(':latest')) score += 5; // No latest tags

    return Math.min(100, score);
  }

  private estimateBuildTime(strategy: { multistage: boolean }, language: string): number {
    const baseTimes: Record<string, number> = {
      javascript: 60,
      typescript: 90,
      python: 45,
      go: 30,
    };

    let time = baseTimes[language] ?? 60;
    if (strategy.multistage) time += 20;

    return time;
  }
}

/**
 * Mock sampling service implementation
 */
export class MockSamplingService implements SamplingService {
  constructor(private logger: Logger) {}

  async generateCandidates<T>(
    input: unknown,
    config: SamplingConfig,
    generator: CandidateGenerator<T>,
  ): Promise<Candidate<T>[]> {
    this.logger.info(
      { maxCandidates: config.maxCandidates },
      'Mock sampling: generating candidates',
    );

    const candidates = await generator.generate(input, config.maxCandidates);

    // Validate candidates
    const validCandidates = [];
    for (const candidate of candidates) {
      if (await generator.validate(candidate)) {
        validCandidates.push(candidate);
      }
    }

    return validCandidates;
  }

  async scoreCandidates<T>(
    candidates: Candidate<T>[],
    weights: Record<string, number>,
  ): Promise<ScoredCandidate<T>[]> {
    this.logger.info(
      { candidateCount: candidates.length, weights },
      'Mock sampling: scoring candidates',
    );

    const scoredCandidates: ScoredCandidate<T>[] = [];

    for (const candidate of candidates) {
      const scores = this.calculateCandidateScores(candidate, weights);
      const overallScore = this.calculateOverallScore(scores, weights);

      scoredCandidates.push({
        ...candidate,
        score: overallScore,
        scores,
        reasoning: this.generateScoreReasoning(scores),
      });
    }

    return scoredCandidates.sort((a, b) => b.score - a.score);
  }

  selectWinner<T>(scored: ScoredCandidate<T>[]): ScoredCandidate<T> {
    if (scored.length === 0) {
      throw new Error('No candidates to select from');
    }

    const winner = scored[0]; // Already sorted by score
    if (!winner) {
      throw new Error('No candidates available for selection');
    }
    
    this.logger.info(
      {
        winnerId: winner.id,
        score: winner.score,
        candidateCount: scored.length,
      },
      'Mock sampling: selected winner',
    );

    return winner;
  }

  private calculateCandidateScores<T>(
    candidate: Candidate<T>,
    _weights: Record<string, number>,
  ): Record<string, number> {
    // Mock scoring based on candidate metadata
    const dockerfileCandidate = candidate as Candidate<DockerfileCandidate>;

    if (
      dockerfileCandidate.content &&
      typeof dockerfileCandidate.content === 'object' &&
      'metadata' in dockerfileCandidate.content
    ) {
      const metadata = (dockerfileCandidate.content).metadata;
      return {
        security: metadata.securityScore,
        performance: metadata.performanceScore,
        maintainability: metadata.maintainabilityScore,
        size: Math.max(0, 100 - metadata.estimatedSize / 10), // Smaller is better
      };
    }

    // Fallback random scores for non-Dockerfile candidates
    return {
      security: Math.random() * 40 + 60,
      performance: Math.random() * 40 + 60,
      maintainability: Math.random() * 40 + 60,
      size: Math.random() * 40 + 60,
    };
  }

  private calculateOverallScore(
    scores: Record<string, number>,
    weights: Record<string, number>,
  ): number {
    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const [metric, score] of Object.entries(scores)) {
      const weight = weights[metric] ?? 0.25; // Default equal weight
      totalWeightedScore += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
  }

  private generateScoreReasoning(scores: Record<string, number>): string {
    const sortedScores = Object.entries(scores).sort(([, a], [, b]) => b - a);
    const best = sortedScores[0];
    const worst = sortedScores[sortedScores.length - 1];

    if (!best || !worst) {
      return 'Unable to generate reasoning from scores';
    }

    return `Strong in ${best[0]} (${best[1].toFixed(1)}), needs improvement in ${worst[0]} (${worst[1].toFixed(1)})`;
  }
}

/**
 * Factory function for creating mock sampling service
 */
export function createMockSamplingService(logger: Logger): SamplingService {
  return new MockSamplingService(logger);
}

/**
 * Factory function for creating mock Dockerfile generator
 */
export function createMockDockerfileGenerator(
  logger: Logger,
): CandidateGenerator<DockerfileCandidate> {
  return new MockDockerfileCandidateGenerator(logger);
}
