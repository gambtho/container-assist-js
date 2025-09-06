import { Result, Success, Failure } from '../../../types/core.js';
import type { Logger } from 'pino';
import { Candidate, GenerationContext } from '../../../lib/sampling.js';
import { BaseCandidateGenerator } from '../base.js';

export interface DockerfileContext extends GenerationContext {
  packageManager?: 'npm' | 'yarn' | 'pnpm';
  nodeVersion?: string;
  buildArgs?: Record<string, string>;
  baseImage?: string;
  workdir?: string;
  exposedPorts?: number[];
}

// Dockerfile generation strategies
export class DockerfileGenerator extends BaseCandidateGenerator<string> {
  readonly name = 'dockerfile-generator';
  readonly supportedTypes = ['dockerfile'];

  private strategies = [
    new AlpineMultiStageStrategy(),
    new DebianSingleStageStrategy(),
    new UbuntuOptimizedStrategy(),
    new NodeSlimStrategy(),
    new SecurityFocusedStrategy(),
  ];

  constructor(logger: Logger) {
    super(logger);
  }

  async generate(context: GenerationContext, count = 3): Promise<Result<Candidate<string>[]>> {
    try {
      this.logger.debug({ context, count }, 'Generating Dockerfile candidates');

      const dockerfileContext = context as DockerfileContext;
      const candidates: Candidate<string>[] = [];

      // Select strategies to use (round-robin if more candidates requested than strategies)
      const selectedStrategies = this.selectStrategies(count);

      const progressToken = `dockerfile-gen-${context.sessionId}`;
      this.notifyProgress(progressToken, 0, 'Starting Dockerfile generation');

      for (let i = 0; i < selectedStrategies.length; i++) {
        const strategy = selectedStrategies[i];

        try {
          const dockerfile = await strategy.generateDockerfile(dockerfileContext);
          const candidateId = this.createCandidateId(strategy.name, context);

          const candidate: Candidate<string> = {
            id: candidateId,
            content: dockerfile,
            metadata: {
              strategy: strategy.name,
              source: 'dockerfile-generator',
              confidence: strategy.confidence,
              estimatedBuildTime: strategy.estimatedBuildTime,
              estimatedSize: strategy.estimatedSize,
              securityRating: strategy.securityRating,
            },
            generatedAt: new Date(),
          };

          candidates.push(candidate);

          const progress = Math.round(((i + 1) / selectedStrategies.length) * 100);
          this.notifyProgress(
            progressToken,
            progress,
            `Generated candidate ${i + 1}/${selectedStrategies.length}`,
          );
        } catch (error) {
          this.logger.warn({ strategy: strategy.name, error }, 'Strategy failed, skipping');
          continue;
        }
      }

      if (candidates.length === 0) {
        return Failure('No candidates could be generated');
      }

      this.logger.debug(
        { count: candidates.length },
        'Successfully generated Dockerfile candidates',
      );
      return Success(candidates);
    } catch (error) {
      const errorMessage = `Dockerfile generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error({ error, context }, errorMessage);
      return Failure(errorMessage);
    }
  }

  async validate(candidate: Candidate<string>): Promise<Result<boolean>> {
    try {
      const dockerfile = candidate.content;

      // Basic validation checks
      const validationChecks = [
        this.hasFromInstruction(dockerfile),
        this.hasValidSyntax(dockerfile),
        this.hasSecurityBestPractices(dockerfile),
      ];

      const isValid = validationChecks.every((check) => check);
      return Success(isValid);
    } catch (error) {
      return Failure(
        `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private selectStrategies(count: number): DockerfileStrategy[] {
    // Ensure we don't request more than available strategies
    const maxStrategies = Math.min(count, this.strategies.length);

    // Return first N strategies (could be randomized in future)
    return this.strategies.slice(0, maxStrategies);
  }

  private hasFromInstruction(dockerfile: string): boolean {
    return /^FROM\s+\S+/m.test(dockerfile);
  }

  private hasValidSyntax(dockerfile: string): boolean {
    // Basic syntax checks
    const lines = dockerfile.split('\n').filter((line) => line.trim());
    return lines.length > 0 && lines[0].trim().startsWith('FROM');
  }

  private hasSecurityBestPractices(dockerfile: string): boolean {
    // Check for common security practices
    const hasNonRootUser = /^USER\s+(?!root)[^\s]+/m.test(dockerfile);
    const avoidsLatestTag = !/FROM\s+[^:\s]+:latest/m.test(dockerfile);

    return hasNonRootUser || avoidsLatestTag; // At least one security practice
  }
}

// Abstract strategy interface
abstract class DockerfileStrategy {
  abstract readonly name: string;
  abstract readonly confidence: number;
  abstract readonly estimatedBuildTime: number; // seconds
  abstract readonly estimatedSize: number; // MB
  abstract readonly securityRating: number; // 1-10

  abstract generateDockerfile(context: DockerfileContext): Promise<string>;
}

// Strategy implementations
class AlpineMultiStageStrategy extends DockerfileStrategy {
  readonly name = 'alpine-multi-stage';
  readonly confidence = 0.9;
  readonly estimatedBuildTime = 180; // 3 minutes
  readonly estimatedSize = 50; // 50MB
  readonly securityRating = 9;

  async generateDockerfile(context: DockerfileContext): Promise<string> {
    const nodeVersion = context.nodeVersion || '18';
    const packageManager = context.packageManager || 'npm';
    const workdir = context.workdir || '/app';
    const ports = context.exposedPorts || [3000];

    return `# Multi-stage build with Alpine
FROM node:${nodeVersion}-alpine AS builder

# Install dependencies needed for building
RUN apk add --no-cache python3 make g++

WORKDIR ${workdir}

# Copy package files
COPY package*.json ./
${packageManager === 'yarn' ? 'COPY yarn.lock ./' : ''}
${packageManager === 'pnpm' ? 'COPY pnpm-lock.yaml ./' : ''}

# Install dependencies
RUN ${packageManager} install --only=production

# Production stage
FROM node:${nodeVersion}-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \\
    adduser -S nextjs -u 1001

WORKDIR ${workdir}

# Copy built application
COPY --from=builder --chown=nextjs:nodejs ${workdir}/node_modules ./node_modules
COPY --chown=nextjs:nodejs . .

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE ${ports[0]}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
    CMD node healthcheck.js || exit 1

CMD ["node", "index.js"]`;
  }
}

class DebianSingleStageStrategy extends DockerfileStrategy {
  readonly name = 'debian-single-stage';
  readonly confidence = 0.7;
  readonly estimatedBuildTime = 240; // 4 minutes
  readonly estimatedSize = 200; // 200MB
  readonly securityRating = 7;

  async generateDockerfile(context: DockerfileContext): Promise<string> {
    const nodeVersion = context.nodeVersion || '18';
    const packageManager = context.packageManager || 'npm';
    const workdir = context.workdir || '/usr/src/app';
    const ports = context.exposedPorts || [3000];

    return `# Single-stage Debian build
FROM node:${nodeVersion}

# Create app directory
WORKDIR ${workdir}

# Copy package files
COPY package*.json ./
${packageManager === 'yarn' ? 'COPY yarn.lock ./' : ''}

# Install dependencies
RUN ${packageManager} install

# Bundle app source
COPY . .

# Create non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs
RUN chown -R nodejs:nodejs ${workdir}
USER nodejs

# Expose port
EXPOSE ${ports[0]}

CMD ["node", "index.js"]`;
  }
}

class UbuntuOptimizedStrategy extends DockerfileStrategy {
  readonly name = 'ubuntu-optimized';
  readonly confidence = 0.8;
  readonly estimatedBuildTime = 200; // 3.3 minutes
  readonly estimatedSize = 150; // 150MB
  readonly securityRating = 8;

  async generateDockerfile(context: DockerfileContext): Promise<string> {
    const nodeVersion = context.nodeVersion || '18';
    const packageManager = context.packageManager || 'npm';
    const workdir = context.workdir || '/app';
    const ports = context.exposedPorts || [3000];

    return `# Optimized Ubuntu build
FROM ubuntu:20.04

# Install Node.js
RUN apt-get update && apt-get install -y \\
    curl \\
    ca-certificates \\
    && curl -fsSL https://deb.nodesource.com/setup_${nodeVersion}.x | bash - \\
    && apt-get install -y nodejs \\
    && apt-get clean \\
    && rm -rf /var/lib/apt/lists/*

WORKDIR ${workdir}

# Copy and install dependencies
COPY package*.json ./
RUN ${packageManager} ci --only=production && ${packageManager} cache clean --force

# Copy application code
COPY . .

# Security: create and use non-root user
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser ${workdir}
USER appuser

EXPOSE ${ports[0]}

CMD ["node", "index.js"]`;
  }
}

class NodeSlimStrategy extends DockerfileStrategy {
  readonly name = 'node-slim';
  readonly confidence = 0.85;
  readonly estimatedBuildTime = 120; // 2 minutes
  readonly estimatedSize = 80; // 80MB
  readonly securityRating = 8;

  async generateDockerfile(context: DockerfileContext): Promise<string> {
    const nodeVersion = context.nodeVersion || '18';
    const packageManager = context.packageManager || 'npm';
    const workdir = context.workdir || '/app';
    const ports = context.exposedPorts || [3000];

    return `# Node.js slim build
FROM node:${nodeVersion}-slim

# Install dumb-init for proper signal handling
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init \\
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

WORKDIR ${workdir}
RUN chown nodejs:nodejs ${workdir}

USER nodejs

# Copy package files
COPY --chown=nodejs:nodejs package*.json ./

# Install dependencies
RUN ${packageManager} ci --only=production && ${packageManager} cache clean --force

# Copy application
COPY --chown=nodejs:nodejs . .

EXPOSE ${ports[0]}

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]`;
  }
}

class SecurityFocusedStrategy extends DockerfileStrategy {
  readonly name = 'security-focused';
  readonly confidence = 0.95;
  readonly estimatedBuildTime = 300; // 5 minutes
  readonly estimatedSize = 45; // 45MB
  readonly securityRating = 10;

  async generateDockerfile(context: DockerfileContext): Promise<string> {
    const nodeVersion = context.nodeVersion || '18';
    const packageManager = context.packageManager || 'npm';
    const workdir = context.workdir || '/app';
    const ports = context.exposedPorts || [3000];

    return `# Security-hardened multi-stage build
FROM node:${nodeVersion}-alpine AS dependencies

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

WORKDIR /tmp
COPY package*.json ./
RUN ${packageManager} ci --only=production --ignore-scripts && ${packageManager} cache clean --force

FROM node:${nodeVersion}-alpine AS runtime

# Install dumb-init and security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init \\
    && rm -rf /var/cache/apk/*

# Create restricted user
RUN addgroup -g 1001 -S appgroup && \\
    adduser -u 1001 -S appuser -G appgroup -s /bin/false -D -H

WORKDIR ${workdir}

# Copy dependencies and app with proper ownership
COPY --from=dependencies --chown=appuser:appgroup /tmp/node_modules ./node_modules
COPY --chown=appuser:appgroup . .

# Remove unnecessary files
RUN rm -rf .git .gitignore *.md docs/ test/ tests/ *.test.js spec/

# Switch to restricted user
USER appuser

# Use non-root port
EXPOSE ${ports[0] > 1024 ? ports[0] : 8080}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
    CMD node -e "require('http').get('http://localhost:${ports[0] > 1024 ? ports[0] : 8080}/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]`;
  }
}
