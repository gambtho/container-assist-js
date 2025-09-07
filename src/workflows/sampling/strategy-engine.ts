/**
 * Strategy Engine - Simple functional sampling strategies
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../../core/types';
import type {
  SamplingStrategy,
  DockerfileContext,
  DockerfileVariant,
  ScoringCriteria,
  ScoreDetails,
} from './types';
import { getBaseImageRecommendations } from '../../lib/base-images';
import { DEFAULT_NETWORK, DEFAULT_CONTAINER, getDefaultPort } from '../../config/defaults';

/**
 * Analyze variant and return individual scores
 */
function analyzeVariant(variant: DockerfileVariant): {
  security: number;
  performance: number;
  size: number;
  maintainability: number;
} {
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

/**
 * Generate scoring reasons based on scores
 */
function generateScoringReasons(_variant: DockerfileVariant, scores: any): string[] {
  const reasons: string[] = [];

  if (scores.security > 70) reasons.push('Strong security practices detected');
  if (scores.performance > 70) reasons.push('Optimized build performance');
  if (scores.size > 70) reasons.push('Efficient image size optimization');
  if (scores.maintainability > 70) reasons.push('Good maintainability practices');

  return reasons;
}

/**
 * Detect warnings in Dockerfile
 */
function detectWarnings(variant: DockerfileVariant): string[] {
  const warnings: string[] = [];
  const content = variant.content.toLowerCase();

  if (content.includes('user root')) warnings.push('Running as root user');
  if (content.includes('latest')) warnings.push('Using latest tag');
  if (!content.includes('healthcheck')) warnings.push('No health check defined');

  return warnings;
}

/**
 * Generate recommendations based on scores
 */
function generateRecommendations(_variant: DockerfileVariant, scores: any): string[] {
  const recommendations: string[] = [];

  if (scores.security < 60) recommendations.push('Add non-root user and security hardening');
  if (scores.performance < 60)
    recommendations.push('Consider multi-stage build for better performance');
  if (scores.size < 60) recommendations.push('Use smaller base images like Alpine or distroless');
  if (scores.maintainability < 60) recommendations.push('Add labels and documentation comments');

  return recommendations;
}

/**
 * Score a Dockerfile variant
 */
export async function scoreVariant(
  variant: DockerfileVariant,
  criteria: ScoringCriteria,
  logger: Logger,
): Promise<Result<ScoreDetails>> {
  try {
    const scores = analyzeVariant(variant);

    const total =
      scores.security * criteria.security +
      scores.performance * criteria.performance +
      scores.size * criteria.size +
      scores.maintainability * criteria.maintainability;

    const scoreDetails: ScoreDetails = {
      total: Math.round(total),
      breakdown: scores,
      reasons: generateScoringReasons(variant, scores),
      warnings: detectWarnings(variant),
      recommendations: generateRecommendations(variant, scores),
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
 * Get install command for package manager
 */
function getInstallCommand(packageManager: string, production = false): string {
  const commands = {
    npm: production ? 'npm ci --only=production' : 'npm ci',
    yarn: production
      ? 'yarn install --frozen-lockfile --production'
      : 'yarn install --frozen-lockfile',
    pnpm: production ? 'pnpm install --frozen-lockfile --prod' : 'pnpm install --frozen-lockfile',
  };
  return commands[packageManager as keyof typeof commands] || 'npm ci';
}

/**
 * Get start command for language and package manager
 */
function getStartCommand(language: string, packageManager: string): string {
  if (language === 'javascript' || language === 'typescript') {
    return packageManager === 'yarn' ? 'yarn start' : 'npm start';
  }
  return 'npm start';
}

/**
 * Get build command for language and package manager
 */
function getBuildCommand(language: string, packageManager: string): string {
  if (language === 'typescript') {
    return packageManager === 'yarn' ? 'yarn build' : 'npm run build';
  }
  return 'echo "No build step required"';
}

/**
 * Create security-first strategy
 */
export function createSecurityFirstStrategy(logger: Logger): SamplingStrategy {
  return {
    name: 'security-first',
    description:
      'Prioritizes security best practices with non-root users, minimal packages, and security scanning',
    optimization: 'security',

    async generateVariant(context: DockerfileContext): Promise<Result<DockerfileVariant>> {
      try {
        const { language, packageManager, ports } = context.analysis;
        const baseImage = getBaseImageRecommendations({
          language,
          preference: 'security',
        }).primary;
        const primaryPort = ports[0] || getDefaultPort(language);

        const dockerfileContent = `# Security-focused Dockerfile for ${language}
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
RUN ${getInstallCommand(packageManager, true)} && \\
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
    CMD wget --no-verbose --tries=1 --spider http://${DEFAULT_NETWORK.host}:${primaryPort}${DEFAULT_CONTAINER.healthCheckPath} || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["${getStartCommand(language, packageManager)}"]`;

        const variant: DockerfileVariant = {
          id: `security-${Date.now()}`,
          content: dockerfileContent,
          strategy: 'security-first',
          metadata: {
            baseImage,
            optimization: 'security',
            features: ['non-root-user', 'minimal-packages', 'security-updates', 'healthcheck'],
            estimatedSize: '< 200MB',
            buildComplexity: 'medium',
            securityFeatures: ['non-root', 'minimal-attack-surface', 'security-updates'],
            aiEnhanced: false,
          },
          generated: new Date(),
        };

        logger.info({ variant: variant.id }, 'Security-first variant generated');
        return Success(variant);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Failure(`Security strategy generation failed: ${message}`);
      }
    },

    scoreVariant: (variant, criteria) => scoreVariant(variant, criteria, logger),
  };
}

/**
 * Create performance-optimized strategy
 */
export function createPerformanceStrategy(logger: Logger): SamplingStrategy {
  return {
    name: 'performance-optimized',
    description:
      'Optimizes for build speed and runtime performance using multi-stage builds and caching',
    optimization: 'performance',

    async generateVariant(context: DockerfileContext): Promise<Result<DockerfileVariant>> {
      try {
        const { language, packageManager, ports } = context.analysis;
        const baseImage = getBaseImageRecommendations({
          language,
          preference: 'performance',
        }).primary;
        const primaryPort = ports[0] || getDefaultPort(language);

        const dockerfileContent = `# Performance-optimized multi-stage Dockerfile
# Build stage
FROM ${baseImage} AS builder

WORKDIR /app

# Install dependencies with cache mounts
COPY package*.json ./
RUN --mount=type=cache,target=/root/.${packageManager} \\
    ${getInstallCommand(packageManager)}

# Copy and build application
COPY . .
RUN ${getBuildCommand(language, packageManager)}

# Production stage
FROM ${baseImage} AS production

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
CMD ["${language === 'typescript' ? 'node dist/index.js' : 'npm start'}"]`;

        const variant: DockerfileVariant = {
          id: `performance-${Date.now()}`,
          content: dockerfileContent,
          strategy: 'performance-optimized',
          metadata: {
            baseImage,
            optimization: 'performance',
            features: [
              'multi-stage-build',
              'layer-caching',
              'parallel-builds',
              'optimized-runtime',
            ],
            estimatedSize: '< 300MB',
            buildComplexity: 'high',
            securityFeatures: ['non-root'],
            aiEnhanced: false,
          },
          generated: new Date(),
        };

        logger.info({ variant: variant.id }, 'Performance variant generated');
        return Success(variant);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Failure(`Performance strategy generation failed: ${message}`);
      }
    },

    scoreVariant: (variant, criteria) => scoreVariant(variant, criteria, logger),
  };
}

/**
 * Create size-optimized strategy
 */
export function createSizeOptimizedStrategy(logger: Logger): SamplingStrategy {
  return {
    name: 'size-optimized',
    description:
      'Minimizes final image size using distroless/alpine images and careful layer optimization',
    optimization: 'size',

    async generateVariant(context: DockerfileContext): Promise<Result<DockerfileVariant>> {
      try {
        const { language, packageManager: _packageManager, ports } = context.analysis;
        const primaryPort = ports[0] || getDefaultPort(language);
        const baseImage = getBaseImageRecommendations({
          language,
          preference: 'size',
        }).primary;

        // Select minimal production image
        const minimalImages = {
          javascript: 'gcr.io/distroless/nodejs18-debian11',
          typescript: 'gcr.io/distroless/nodejs18-debian11',
          python: 'gcr.io/distroless/python3-debian11',
          java: 'gcr.io/distroless/java17-debian11',
          go: 'gcr.io/distroless/static-debian11',
          rust: 'gcr.io/distroless/cc-debian11',
        };
        const minimalImage =
          minimalImages[language as keyof typeof minimalImages] ||
          'gcr.io/distroless/static-debian11';

        const dockerfileContent = `# Size-optimized Dockerfile using distroless
# Build stage
FROM ${baseImage} AS builder

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
FROM ${minimalImage}

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

        const variant: DockerfileVariant = {
          id: `size-${Date.now()}`,
          content: dockerfileContent,
          strategy: 'size-optimized',
          metadata: {
            baseImage: minimalImage,
            optimization: 'size',
            features: ['distroless', 'minimal-layers', 'dependency-pruning', 'static-binary'],
            estimatedSize: '< 100MB',
            buildComplexity: 'high',
            securityFeatures: ['distroless', 'minimal-attack-surface'],
            aiEnhanced: false,
          },
          generated: new Date(),
        };

        logger.info({ variant: variant.id }, 'Size-optimized variant generated');
        return Success(variant);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Failure(`Size optimization strategy generation failed: ${message}`);
      }
    },

    scoreVariant: (variant, criteria) => scoreVariant(variant, criteria, logger),
  };
}

/**
 * Create balanced strategy
 */
export function createBalancedStrategy(logger: Logger): SamplingStrategy {
  return {
    name: 'balanced',
    description: 'Balanced approach considering security, performance, and size',
    optimization: 'balanced',

    async generateVariant(context: DockerfileContext): Promise<Result<DockerfileVariant>> {
      try {
        const { language, packageManager, ports } = context.analysis;
        const baseImage = getBaseImageRecommendations({
          language,
          preference: 'balanced',
        }).primary;
        const primaryPort = ports[0] || getDefaultPort(language);

        const dockerfileContent = `# Balanced Dockerfile for ${language}
FROM ${baseImage}

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN ${getInstallCommand(packageManager, true)} && \\
    npm cache clean --force

# Copy application code
COPY --chown=appuser:appuser . .

${language === 'typescript' ? '# Build TypeScript\nRUN npm run build\n' : ''}
# Switch to non-root user
USER appuser

# Expose port
EXPOSE ${primaryPort}

# Health check
HEALTHCHECK --interval=30s --timeout=3s \\
    CMD node -e "require('http').get('http://localhost:${primaryPort}/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start application
CMD ["${getStartCommand(language, packageManager)}"]`;

        const variant: DockerfileVariant = {
          id: `balanced-${Date.now()}`,
          content: dockerfileContent,
          strategy: 'balanced',
          metadata: {
            baseImage,
            optimization: 'balanced',
            features: ['non-root-user', 'healthcheck', 'production-deps', 'clean-cache'],
            estimatedSize: '< 250MB',
            buildComplexity: 'low',
            securityFeatures: ['non-root'],
            aiEnhanced: false,
          },
          generated: new Date(),
        };

        logger.info({ variant: variant.id }, 'Balanced variant generated');
        return Success(variant);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Failure(`Balanced strategy generation failed: ${message}`);
      }
    },

    scoreVariant: (variant, criteria) => scoreVariant(variant, criteria, logger),
  };
}

/**
 * Get all default strategies
 */
export function getDefaultStrategies(logger: Logger): SamplingStrategy[] {
  return [
    createSecurityFirstStrategy(logger),
    createPerformanceStrategy(logger),
    createSizeOptimizedStrategy(logger),
    createBalancedStrategy(logger),
  ];
}

/**
 * Generate variants using specified strategies
 */
export async function generateVariants(
  context: DockerfileContext,
  strategies: SamplingStrategy[],
  logger: Logger,
): Promise<Result<DockerfileVariant[]>> {
  const variants: DockerfileVariant[] = [];
  const errors: string[] = [];

  for (const strategy of strategies) {
    try {
      const result = await strategy.generateVariant(context, logger);
      if (result.ok) {
        variants.push(result.value);
      } else {
        errors.push(`${strategy.name}: ${result.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${strategy.name}: ${message}`);
    }
  }

  if (variants.length === 0) {
    return Failure(`No variants generated. Errors: ${errors.join('; ')}`);
  }

  if (errors.length > 0) {
    logger.warn({ errors }, 'Some strategies failed');
  }

  logger.info(
    {
      variantCount: variants.length,
      strategies: variants.map((v) => v.strategy),
    },
    'Variants generated successfully',
  );

  return Success(variants);
}

/**
 * Score multiple variants
 */
export async function scoreVariants(
  variants: DockerfileVariant[],
  criteria: ScoringCriteria,
  logger: Logger,
): Promise<Result<ScoreDetails[]>> {
  const scores: ScoreDetails[] = [];
  const errors: string[] = [];

  for (const variant of variants) {
    try {
      const scoreResult = await scoreVariant(variant, criteria, logger);
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

  logger.info({ scoreCount: scores.length }, 'Variants scored successfully');
  return Success(scores);
}

/**
 * Simple strategy manager for backward compatibility
 */
export class StrategyEngine {
  private strategies: Map<string, SamplingStrategy> = new Map();

  constructor(
    private logger: Logger,
    _promptRegistry?: any,
  ) {
    this.registerDefaultStrategies();
  }

  private registerDefaultStrategies(): void {
    const strategies = getDefaultStrategies(this.logger);
    strategies.forEach((strategy) => {
      this.strategies.set(strategy.name, strategy);
    });
    this.logger.info({ count: strategies.length }, 'Default strategies registered');
  }

  registerStrategy(strategy: SamplingStrategy): void {
    this.strategies.set(strategy.name, strategy);
    this.logger.info({ strategy: strategy.name }, 'Custom strategy registered');
  }

  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  getStrategy(name: string): SamplingStrategy | undefined {
    return this.strategies.get(name);
  }

  async generateVariants(
    context: DockerfileContext,
    strategyNames?: string[],
  ): Promise<Result<DockerfileVariant[]>> {
    const selectedStrategies = strategyNames
      ? (strategyNames
          .map((name) => this.strategies.get(name))
          .filter(Boolean) as SamplingStrategy[])
      : Array.from(this.strategies.values());

    return generateVariants(context, selectedStrategies, this.logger);
  }

  async scoreVariants(
    variants: DockerfileVariant[],
    criteria: ScoringCriteria,
  ): Promise<Result<ScoreDetails[]>> {
    return scoreVariants(variants, criteria, this.logger);
  }
}
