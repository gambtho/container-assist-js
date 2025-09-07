/**
 * Strategy Engine - Core sampling strategy implementations
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../../types/core';
import type {
  SamplingStrategy,
  DockerfileContext,
  DockerfileVariant,
  ScoringCriteria,
  ScoreDetails,
} from './types';
import { createAIService } from '../../lib/ai';

/**
 * Base strategy implementation with common functionality
 */
abstract class BaseSamplingStrategy implements SamplingStrategy {
  abstract name: string;
  abstract description: string;
  abstract optimization: 'size' | 'security' | 'performance' | 'balanced';

  protected aiService = createAIService(this.logger);

  constructor(protected logger: Logger) {}

  abstract generateVariant(
    context: DockerfileContext,
    logger: Logger,
  ): Promise<Result<DockerfileVariant>>;

  /**
   * Common scoring logic with strategy-specific adjustments
   */
  async scoreVariant(
    variant: DockerfileVariant,
    criteria: ScoringCriteria,
    logger: Logger,
  ): Promise<Result<ScoreDetails>> {
    try {
      const scores = await this.analyzeVariant(variant);

      const total =
        scores.security * criteria.security +
        scores.performance * criteria.performance +
        scores.size * criteria.size +
        scores.maintainability * criteria.maintainability;

      const scoreDetails: ScoreDetails = {
        total: Math.round(total),
        breakdown: scores,
        reasons: this.generateScoringReasons(variant, scores),
        warnings: this.detectWarnings(variant),
        recommendations: this.generateRecommendations(variant, scores),
      };

      logger.debug(
        {
          variant: variant.id,
          total: scoreDetails.total,
          breakdown: scores,
        },
        'Variant scored',
      );

      return Success(scoreDetails);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, variant: variant.id }, 'Scoring failed');
      return Failure(`Failed to score variant: ${message}`);
    }
  }

  /**
   * Analyze variant and return individual scores
   */
  protected async analyzeVariant(variant: DockerfileVariant): Promise<{
    security: number;
    performance: number;
    size: number;
    maintainability: number;
  }> {
    const content = variant.content.toLowerCase();

    // Security scoring
    let security = 50;
    if (content.includes('user ') && !content.includes('user root')) security += 20;
    if (content.includes('alpine') || content.includes('distroless')) security += 15;
    if (content.includes('run apt-get update && apt-get install')) security += 10;
    if (content.includes('healthcheck')) security += 5;

    // Performance scoring
    let performance = 50;
    if (content.includes('from ') && content.split('from ').length > 2) performance += 20; // Multi-stage
    if (content.includes('copy --from=')) performance += 15;
    if (content.includes('run --mount=type=cache')) performance += 10;
    if (!content.includes('run apt-get update') || content.includes('rm -rf /var/lib/apt'))
      performance += 5;

    // Size scoring
    let size = 50;
    if (content.includes('alpine') || content.includes('distroless')) size += 25;
    if (content.includes('slim')) size += 15;
    if (content.includes('rm -rf')) size += 10;

    // Maintainability scoring
    let maintainability = 50;
    if (content.includes('label')) maintainability += 15;
    if (content.includes('arg ')) maintainability += 10;
    if (content.includes('env ')) maintainability += 10;
    if (content.split('\n').filter((line) => line.trim().startsWith('#')).length > 2)
      maintainability += 15;

    return {
      security: Math.min(100, security),
      performance: Math.min(100, performance),
      size: Math.min(100, size),
      maintainability: Math.min(100, maintainability),
    };
  }

  protected generateScoringReasons(variant: DockerfileVariant, scores: any): string[] {
    const reasons: string[] = [];

    if (scores.security > 70) reasons.push('Strong security practices detected');
    if (scores.performance > 70) reasons.push('Optimized build performance');
    if (scores.size > 70) reasons.push('Efficient image size optimization');
    if (scores.maintainability > 70) reasons.push('Good maintainability practices');

    return reasons;
  }

  protected detectWarnings(variant: DockerfileVariant): string[] {
    const warnings: string[] = [];
    const content = variant.content.toLowerCase();

    if (content.includes('user root')) warnings.push('Running as root user');
    if (content.includes('latest')) warnings.push('Using latest tag');
    if (!content.includes('healthcheck')) warnings.push('No health check defined');

    return warnings;
  }

  protected generateRecommendations(variant: DockerfileVariant, scores: any): string[] {
    const recommendations: string[] = [];

    if (scores.security < 60) recommendations.push('Add non-root user and security hardening');
    if (scores.performance < 60)
      recommendations.push('Consider multi-stage build for better performance');
    if (scores.size < 60) recommendations.push('Use smaller base images like Alpine or distroless');
    if (scores.maintainability < 60) recommendations.push('Add labels and documentation comments');

    return recommendations;
  }
}

/**
 * Security-first strategy - prioritizes security best practices
 */
export class SecurityFirstStrategy extends BaseSamplingStrategy {
  name = 'security-first';
  description =
    'Prioritizes security best practices with non-root users, minimal packages, and security scanning';
  optimization = 'security' as const;

  async generateVariant(
    context: DockerfileContext,
    logger: Logger,
  ): Promise<Result<DockerfileVariant>> {
    try {
      const aiRequest = {
        prompt: `Generate a security-focused Dockerfile for ${context.analysis.language} application`,
        context: {
          language: context.analysis.language,
          framework: context.analysis.framework,
          securityLevel: context.constraints.securityLevel,
          environment: context.constraints.targetEnvironment,
        },
      };

      const aiResult = await this.aiService.generate(aiRequest);
      if (!aiResult.ok) {
        return Failure(`AI context generation failed: ${aiResult.error}`);
      }

      const baseImage = this.selectSecureBaseImage(context.analysis.language);
      const variant: DockerfileVariant = {
        id: `security-${Date.now()}`,
        content: this.generateSecureDockerfile(context, baseImage),
        strategy: this.name,
        metadata: {
          baseImage,
          optimization: 'security',
          features: ['non-root-user', 'minimal-packages', 'security-updates', 'healthcheck'],
          estimatedSize: '< 200MB',
          buildComplexity: 'medium',
          securityFeatures: ['non-root', 'minimal-attack-surface', 'security-updates'],
        },
        generated: new Date(),
      };

      logger.info({ variant: variant.id }, 'Security-first variant generated');
      return Success(variant);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Failure(`Security strategy generation failed: ${message}`);
    }
  }

  private selectSecureBaseImage(language: string): string {
    const secureImages = {
      javascript: 'node:18-alpine',
      typescript: 'node:18-alpine',
      python: 'python:3.11-alpine',
      java: 'openjdk:17-alpine',
      go: 'golang:1.21-alpine',
      rust: 'rust:1.75-alpine',
    };
    return secureImages[language as keyof typeof secureImages] || 'alpine:latest';
  }

  private generateSecureDockerfile(context: DockerfileContext, baseImage: string): string {
    const { language, packageManager, ports } = context.analysis;
    const primaryPort = ports[0] || 3000;

    return `# Security-focused Dockerfile for ${language}
FROM ${baseImage}

# Create non-root user
RUN addgroup -g 1001 -S appuser && \\
    adduser -S appuser -u 1001 -G appuser

# Set working directory
WORKDIR /app

# Update packages for security
RUN apk update && apk upgrade && \\
    apk add --no-cache dumb-init && \\
    rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install dependencies as root, then change ownership
RUN ${this.getInstallCommand(packageManager)} && \\
    chown -R appuser:appuser /app

# Copy application code
COPY . .
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE ${primaryPort}

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
    CMD wget --no-verbose --tries=1 --spider http://localhost:${primaryPort}/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["${this.getStartCommand(language, packageManager)}"]`;
  }

  private getInstallCommand(packageManager: string): string {
    const commands = {
      npm: 'npm ci --only=production',
      yarn: 'yarn install --frozen-lockfile --production',
      pnpm: 'pnpm install --frozen-lockfile --prod',
    };
    return commands[packageManager as keyof typeof commands] || 'npm ci --only=production';
  }

  private getStartCommand(language: string, packageManager: string): string {
    if (language === 'javascript' || language === 'typescript') {
      return packageManager === 'yarn' ? 'yarn start' : 'npm start';
    }
    return 'npm start';
  }
}

/**
 * Performance-focused strategy - optimizes for build speed and runtime performance
 */
export class PerformanceStrategy extends BaseSamplingStrategy {
  name = 'performance-optimized';
  description =
    'Optimizes for build speed and runtime performance using multi-stage builds and caching';
  optimization = 'performance' as const;

  async generateVariant(
    context: DockerfileContext,
    logger: Logger,
  ): Promise<Result<DockerfileVariant>> {
    try {
      const variant: DockerfileVariant = {
        id: `performance-${Date.now()}`,
        content: this.generatePerformanceDockerfile(context),
        strategy: this.name,
        metadata: {
          baseImage: this.selectPerformanceBaseImage(context.analysis.language),
          optimization: 'performance',
          features: ['multi-stage-build', 'layer-caching', 'parallel-builds', 'optimized-runtime'],
          estimatedSize: '< 300MB',
          buildComplexity: 'high',
          securityFeatures: ['non-root'],
        },
        generated: new Date(),
      };

      logger.info({ variant: variant.id }, 'Performance variant generated');
      return Success(variant);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Failure(`Performance strategy generation failed: ${message}`);
    }
  }

  private selectPerformanceBaseImage(language: string): string {
    const performanceImages = {
      javascript: 'node:18-slim',
      typescript: 'node:18-slim',
      python: 'python:3.11-slim',
      java: 'openjdk:17-slim',
      go: 'golang:1.21',
      rust: 'rust:1.75',
    };
    return performanceImages[language as keyof typeof performanceImages] || 'ubuntu:22.04';
  }

  private generatePerformanceDockerfile(context: DockerfileContext): string {
    const { language, packageManager, ports } = context.analysis;
    const baseImage = this.selectPerformanceBaseImage(language);
    const primaryPort = ports[0] || 3000;

    return `# Performance-optimized multi-stage Dockerfile
# Build stage
FROM ${baseImage} AS builder

WORKDIR /app

# Install dependencies with cache mounts
COPY package*.json ./
RUN --mount=type=cache,target=/root/.${packageManager} \\
    ${this.getInstallCommand(packageManager)}

# Copy and build application
COPY . .
RUN ${this.getBuildCommand(language, packageManager)}

# Production stage
FROM ${this.getProductionImage(language)} AS production

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=appuser:appuser /app/dist ./dist
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/package*.json ./

# Switch to non-root user
USER appuser

# Expose port
EXPOSE ${primaryPort}

# Optimized startup
CMD ["${this.getOptimizedStartCommand(language)}"]`;
  }

  private getProductionImage(language: string): string {
    const images = {
      javascript: 'node:18-slim',
      typescript: 'node:18-slim',
      python: 'python:3.11-slim',
      java: 'openjdk:17-jre-slim',
    };
    return images[language as keyof typeof images] || 'node:18-slim';
  }

  private getBuildCommand(language: string, packageManager: string): string {
    if (language === 'typescript') {
      return packageManager === 'yarn' ? 'yarn build' : 'npm run build';
    }
    return 'echo "No build step required"';
  }

  private getOptimizedStartCommand(language: string): string {
    if (language === 'javascript' || language === 'typescript') {
      return 'node dist/index.js';
    }
    return 'npm start';
  }

  private getInstallCommand(packageManager: string): string {
    const commands = {
      npm: 'npm ci',
      yarn: 'yarn install --frozen-lockfile',
      pnpm: 'pnpm install --frozen-lockfile',
    };
    return commands[packageManager as keyof typeof commands] || 'npm ci';
  }
}

/**
 * Size-optimized strategy - minimizes final image size
 */
export class SizeOptimizedStrategy extends BaseSamplingStrategy {
  name = 'size-optimized';
  description =
    'Minimizes final image size using distroless/alpine images and careful layer optimization';
  optimization = 'size' as const;

  async generateVariant(
    context: DockerfileContext,
    logger: Logger,
  ): Promise<Result<DockerfileVariant>> {
    try {
      const variant: DockerfileVariant = {
        id: `size-${Date.now()}`,
        content: this.generateSizeOptimizedDockerfile(context),
        strategy: this.name,
        metadata: {
          baseImage: this.selectMinimalBaseImage(context.analysis.language),
          optimization: 'size',
          features: ['distroless', 'minimal-layers', 'dependency-pruning', 'static-binary'],
          estimatedSize: '< 100MB',
          buildComplexity: 'high',
          securityFeatures: ['distroless', 'minimal-attack-surface'],
        },
        generated: new Date(),
      };

      logger.info({ variant: variant.id }, 'Size-optimized variant generated');
      return Success(variant);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Failure(`Size optimization strategy generation failed: ${message}`);
    }
  }

  private selectMinimalBaseImage(language: string): string {
    const minimalImages = {
      javascript: 'gcr.io/distroless/nodejs18-debian11',
      typescript: 'gcr.io/distroless/nodejs18-debian11',
      python: 'gcr.io/distroless/python3-debian11',
      java: 'gcr.io/distroless/java17-debian11',
      go: 'gcr.io/distroless/static-debian11',
      rust: 'gcr.io/distroless/cc-debian11',
    };
    return (
      minimalImages[language as keyof typeof minimalImages] || 'gcr.io/distroless/static-debian11'
    );
  }

  private generateSizeOptimizedDockerfile(context: DockerfileContext): string {
    const { language, packageManager: _packageManager, ports } = context.analysis;
    const primaryPort = ports[0] || 3000;

    return `# Size-optimized Dockerfile using distroless
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source and build if needed
COPY . .
${language === 'typescript' ? 'RUN npm run build' : ''}

# Remove dev dependencies and unnecessary files
RUN npm prune --production && \\
    rm -rf node_modules/.cache && \\
    rm -rf src/ test/ *.md

# Production stage - distroless
FROM ${this.selectMinimalBaseImage(language)}

# Copy only necessary files from builder
COPY --from=builder /app/node_modules ./node_modules
${
  language === 'typescript'
    ? 'COPY --from=builder /app/dist ./dist'
    : 'COPY --from=builder /app/*.js ./'
}
COPY --from=builder /app/package.json ./

# Expose port
EXPOSE ${primaryPort}

# Run the application
${language === 'typescript' ? 'CMD ["dist/index.js"]' : 'CMD ["index.js"]'}`;
  }
}

/**
 * Strategy engine for managing and executing sampling strategies
 */
export class StrategyEngine {
  private strategies: Map<string, SamplingStrategy> = new Map();

  constructor(private logger: Logger) {
    this.registerDefaultStrategies();
  }

  private registerDefaultStrategies(): void {
    const strategies = [
      new SecurityFirstStrategy(this.logger),
      new PerformanceStrategy(this.logger),
      new SizeOptimizedStrategy(this.logger),
    ];

    strategies.forEach((strategy) => {
      this.strategies.set(strategy.name, strategy);
    });

    this.logger.info({ count: strategies.length }, 'Default strategies registered');
  }

  /**
   * Register a custom strategy
   */
  registerStrategy(strategy: SamplingStrategy): void {
    this.strategies.set(strategy.name, strategy);
    this.logger.info({ strategy: strategy.name }, 'Custom strategy registered');
  }

  /**
   * Get available strategy names
   */
  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get strategy by name
   */
  getStrategy(name: string): SamplingStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * Generate variants using specified strategies
   */
  async generateVariants(
    context: DockerfileContext,
    strategyNames?: string[],
  ): Promise<Result<DockerfileVariant[]>> {
    const selectedStrategies = strategyNames || this.getAvailableStrategies();
    const variants: DockerfileVariant[] = [];
    const errors: string[] = [];

    for (const strategyName of selectedStrategies) {
      const strategy = this.strategies.get(strategyName);
      if (!strategy) {
        errors.push(`Unknown strategy: ${strategyName}`);
        continue;
      }

      try {
        const result = await strategy.generateVariant(context, this.logger);
        if (result.ok) {
          variants.push(result.value);
        } else {
          errors.push(`${strategyName}: ${result.error}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${strategyName}: ${message}`);
      }
    }

    if (variants.length === 0) {
      return Failure(`No variants generated. Errors: ${errors.join('; ')}`);
    }

    if (errors.length > 0) {
      this.logger.warn({ errors }, 'Some strategies failed');
    }

    this.logger.info(
      {
        variantCount: variants.length,
        strategies: variants.map((v) => v.strategy),
      },
      'Variants generated successfully',
    );

    return Success(variants);
  }

  /**
   * Score variants using their respective strategies
   */
  async scoreVariants(
    variants: DockerfileVariant[],
    criteria: ScoringCriteria,
  ): Promise<Result<ScoreDetails[]>> {
    const scores: ScoreDetails[] = [];
    const errors: string[] = [];

    for (const variant of variants) {
      const strategy = this.strategies.get(variant.strategy);
      if (!strategy) {
        errors.push(`Strategy not found for variant ${variant.id}: ${variant.strategy}`);
        continue;
      }

      try {
        const scoreResult = await strategy.scoreVariant(variant, criteria, this.logger);
        if (scoreResult.ok) {
          scores.push(scoreResult.value);
        } else {
          errors.push(`Scoring failed for ${variant.id}: ${scoreResult.error}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Scoring error for ${variant.id}: ${message}`);
      }
    }

    if (scores.length === 0) {
      return Failure(`No scores computed. Errors: ${errors.join('; ')}`);
    }

    this.logger.info({ scoreCount: scores.length }, 'Variants scored successfully');
    return Success(scores);
  }
}
