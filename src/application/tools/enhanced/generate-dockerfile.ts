/**
 * Enhanced Dockerfile Generation Tool - Team Delta Implementation
 *
 * Extends the original generate-dockerfile tool with MCP resource publishing,
 * progress reporting, and multi-candidate sampling integration with Team Beta.
 */

import { promises as fs } from 'node:fs';
import type { Logger } from 'pino';
import type {
  SamplingAwareTool,
  EnhancedToolContext,
  EnhancedToolResult,
  ResourceReference,
  ScoredCandidate,
} from '../interfaces';
import { createMockSamplingService, createMockDockerfileGenerator, type DockerfileCandidate } from '../mocks/sampling-service.mock';
import type { Result } from '../../../types/core/index';
import type { MCPToolCallResponse } from '../../../types/tools';
import { Success, Failure } from '../../../types/core/index';

// Re-export original interfaces for compatibility
export type { GenerateDockerfileConfig, GenerateDockerfileResult } from '../../../tools/generate-dockerfile';

/**
 * Enhanced Dockerfile generation result with resource links and sampling metadata
 */
export interface EnhancedGenerateDockerfileResult extends EnhancedToolResult {
  // Core inline data (always small)
  summary: string;
  baseImage: string;
  multistage: boolean;
  optimization: string;

  // Resource references for large data
  resources?: {
    winnerDockerfile?: ResourceReference;
    allCandidates?: ResourceReference;
    scoringReport?: ResourceReference;
    buildInstructions?: ResourceReference;
  };

  // Sampling metadata
  sampling?: {
    candidatesGenerated: number;
    winnerSelected: boolean;
    winnerScore?: number;
    generationTimeMs: number;
    strategy: string;
  };

  // Dockerfile metadata
  dockerfileMetadata: {
    linesCount: number;
    estimatedImageSizeMB: number;
    securityScore: number;
    buildStrategy: string;
  };
}

/**
 * Enhanced Dockerfile generation tool with MCP and sampling capabilities
 */
export class EnhancedGenerateDockerfileTool implements SamplingAwareTool {
  readonly name = 'generate-dockerfile';
  readonly description = 'Generate optimized Dockerfiles with multi-candidate sampling and MCP resource publishing';
  readonly supportsSampling = true; // This tool supports sampling
  readonly supportsResources = true;
  readonly supportsDynamicConfig = true;

  readonly capabilities = {
    progressReporting: true,
    resourcePublishing: true,
    candidateGeneration: true,
    errorRecovery: true,
  };

  constructor(private logger: Logger) {}

  async execute(
    params: Record<string, unknown>,
    context: EnhancedToolContext,
  ): Promise<Result<MCPToolCallResponse>> {
    const startTime = Date.now();

    try {
      // Extract and validate parameters
      const config = this.extractConfig(params);
      if (!config.success) {
        return Failure(config.error);
      }

      const {
        sessionId,
        baseImage,
        optimization = true,
        multistage = true,
        securityHardening = true,
        useSampling = true,
      } = config.data;

      // Set up progress reporting
      context.progressReporter.reportProgress('load_analysis', 0, 'Loading repository analysis');

      // Get analysis result from session (mock for now)
      const analysisResult = await this.loadAnalysisResult(sessionId);
      if (!analysisResult.success) {
        return analysisResult;
      }

      context.progressReporter.reportProgress('load_analysis', 100, 'Repository analysis loaded');

      // Perform enhanced Dockerfile generation
      const dockerfileResult = await this.performEnhancedGeneration(
        { sessionId, baseImage, optimization, multistage, securityHardening, useSampling },
        analysisResult.data,
        context,
      );

      if (!dockerfileResult.success) {
        return dockerfileResult;
      }

      const executionTime = Date.now() - startTime;
      dockerfileResult.data.executionTimeMs = executionTime;

      context.progressReporter.reportComplete(`Dockerfile generation completed in ${executionTime}ms`);

      // Create MCP response with resource publishing
      return await this.createMCPResponse(dockerfileResult.data, context);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.progressReporter.reportError(errorMessage, true);

      this.logger.error({
        sessionId: context.sessionId,
        error: errorMessage,
        executionTime: Date.now() - startTime,
      }, 'Enhanced Dockerfile generation failed');

      return Failure(errorMessage);
    }
  }

  private extractConfig(params: Record<string, unknown>): Result<{
    sessionId: string;
    baseImage?: string;
    optimization?: boolean;
    multistage?: boolean;
    securityHardening?: boolean;
    useSampling?: boolean;
  }> {
    if (!params.sessionId || typeof params.sessionId !== 'string') {
      return Failure('sessionId is required and must be a string');
    }

    return Success({
      sessionId: params.sessionId,
      baseImage: typeof params.baseImage === 'string' ? params.baseImage : undefined,
      optimization: typeof params.optimization === 'boolean' ? params.optimization : true,
      multistage: typeof params.multistage === 'boolean' ? params.multistage : true,
      securityHardening: typeof params.securityHardening === 'boolean' ? params.securityHardening : true,
      useSampling: typeof params.useSampling === 'boolean' ? params.useSampling : true,
    });
  }

  private async loadAnalysisResult(_sessionId: string): Promise<Result<{
    language: string;
    framework?: string;
    dependencies: Array<{ name: string; version?: string }>;
    ports: number[];
    buildSystem?: { type: string };
  }>> {
    // Mock analysis result - in production, this would load from session
    const mockAnalysis = {
      language: 'javascript',
      framework: 'express',
      dependencies: [
        { name: 'express', version: '^4.18.0' },
        { name: 'lodash', version: '^4.17.21' },
        { name: 'axios', version: '^1.4.0' },
      ],
      ports: [3000],
      buildSystem: { type: 'npm' },
    };

    return Success(mockAnalysis);
  }

  private async performEnhancedGeneration(
    config: {
      sessionId: string;
      baseImage?: string;
      optimization: boolean;
      multistage: boolean;
      securityHardening: boolean;
      useSampling: boolean;
    },
    analysisResult: {
      language: string;
      framework?: string;
      dependencies: Array<{ name: string; version?: string }>;
      ports: number[];
      buildSystem?: { type: string };
    },
    context: EnhancedToolContext,
  ): Promise<Result<EnhancedGenerateDockerfileResult>> {
    const { useSampling } = config;

    if (useSampling && context.samplingService) {
      // Use sampling for multi-candidate generation
      return await this.generateWithSampling(config, analysisResult, context);
    } else {
      // Fall back to single candidate generation
      return await this.generateSingleCandidate(config, analysisResult, context);
    }
  }

  private async generateWithSampling(
    config: any,
    analysisResult: any,
    context: EnhancedToolContext,
  ): Promise<Result<EnhancedGenerateDockerfileResult>> {
    const samplingStartTime = Date.now();

    // Step 1: Generate candidates
    context.progressReporter.reportProgress('generate_candidates', 0, 'Generating Dockerfile candidates');

    // Create mock sampling service if not provided (for Team Delta independent development)
    const samplingService = context.samplingService || createMockSamplingService(this.logger);
    const dockerfileGenerator = createMockDockerfileGenerator(this.logger);

    // Configure sampling
    const samplingConfig = {
      maxCandidates: 3,
      scoringWeights: {
        security: 0.3,
        performance: 0.2,
        size: 0.2,
        maintainability: 0.3,
      },
      timeoutMs: 30000,
      cachingEnabled: true,
    };

    try {
      const candidates = await samplingService.generateCandidates(
        analysisResult,
        samplingConfig,
        dockerfileGenerator,
      );

      context.progressReporter.reportProgress('generate_candidates', 100,
        `Generated ${candidates.length} Dockerfile candidates`);

      if (candidates.length === 0) {
        return Failure('No valid Dockerfile candidates generated');
      }

      // Step 2: Score candidates
      context.progressReporter.reportProgress('score_candidates', 0, 'Scoring candidates');

      const scoredCandidates = await samplingService.scoreCandidates(
        candidates,
        samplingConfig.scoringWeights,
      );

      context.progressReporter.reportProgress('score_candidates', 100,
        `Scored ${scoredCandidates.length} candidates`);

      // Step 3: Select winner
      context.progressReporter.reportProgress('select_winner', 0, 'Selecting best candidate');

      const winner = samplingService.selectWinner(scoredCandidates);
      const generationTimeMs = Date.now() - samplingStartTime;

      context.progressReporter.reportProgress('select_winner', 100,
        `Selected winner with score ${winner.score.toFixed(2)}`);

      // Step 4: Write Dockerfile
      context.progressReporter.reportProgress('write_file', 0, 'Writing Dockerfile to disk');

      const dockerfilePath = './Dockerfile'; // Would use actual session path
      await fs.writeFile(dockerfilePath, winner.content.content, 'utf-8');

      context.progressReporter.reportProgress('write_file', 100, 'Dockerfile written to disk');

      // Build enhanced result
      const enhancedResult: EnhancedGenerateDockerfileResult = {
        success: true,
        sessionId: config.sessionId,
        summary: this.createSummary(winner.content, scoredCandidates.length),
        status: 'completed',
        baseImage: winner.content.baseImage,
        multistage: winner.content.multistage,
        optimization: winner.content.optimization,
        sampling: {
          candidatesGenerated: candidates.length,
          winnerSelected: true,
          winnerScore: winner.score,
          generationTimeMs,
          strategy: 'multi-candidate-scoring',
        },
        dockerfileMetadata: {
          linesCount: winner.content.content.split('\n').length,
          estimatedImageSizeMB: winner.content.metadata.estimatedSize,
          securityScore: winner.content.metadata.securityScore,
          buildStrategy: winner.content.multistage ? 'multi-stage' : 'single-stage',
        },
        executionTimeMs: 0, // Set by caller
      };

      // Publish resources if available
      if (context.resourcePublisher) {
        await this.publishSamplingResources(
          enhancedResult,
          winner,
          scoredCandidates,
          context,
        );
      }

      return Success(enhancedResult);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: errorMessage }, 'Sampling generation failed');
      return Failure(`Sampling generation failed: ${errorMessage}`);
    }
  }

  private async generateSingleCandidate(
    config: any,
    analysisResult: any,
    context: EnhancedToolContext,
  ): Promise<Result<EnhancedGenerateDockerfileResult>> {
    // Fallback to basic generation without sampling
    context.progressReporter.reportProgress('generate_single', 0, 'Generating single Dockerfile');

    const dockerfileContent = this.generateBasicDockerfile(analysisResult, config);
    const dockerfilePath = './Dockerfile';

    await fs.writeFile(dockerfilePath, dockerfileContent, 'utf-8');

    context.progressReporter.reportProgress('generate_single', 100, 'Single Dockerfile generated');

    const enhancedResult: EnhancedGenerateDockerfileResult = {
      success: true,
      sessionId: config.sessionId,
      summary: `Generated single ${analysisResult.language} Dockerfile`,
      status: 'completed',
      baseImage: config.baseImage || this.getDefaultBaseImage(analysisResult.language),
      multistage: config.multistage,
      optimization: 'basic',
      dockerfileMetadata: {
        linesCount: dockerfileContent.split('\n').length,
        estimatedImageSizeMB: 150, // Estimated
        securityScore: 75, // Estimated
        buildStrategy: config.multistage ? 'multi-stage' : 'single-stage',
      },
      executionTimeMs: 0, // Set by caller
    };

    return Success(enhancedResult);
  }

  private async publishSamplingResources(
    result: EnhancedGenerateDockerfileResult,
    winner: ScoredCandidate<DockerfileCandidate>,
    allCandidates: ScoredCandidate<DockerfileCandidate>[],
    context: EnhancedToolContext,
  ): Promise<void> {
    try {
      // Publish winner Dockerfile
      const winnerResource = await context.resourcePublisher.publish(
        winner.content.content,
        'text/dockerfile',
        3600, // 1 hour TTL
      );

      // Publish all candidates for comparison
      const candidatesResource = await context.resourcePublisher.publish(
        allCandidates.map(candidate => ({
          id: candidate.id,
          score: candidate.score,
          scores: candidate.scores,
          reasoning: candidate.reasoning,
          content: candidate.content.content,
          metadata: candidate.content.metadata,
        })),
        'application/json',
        1800, // 30 minute TTL
      );

      // Publish scoring report
      const scoringReport = {
        summary: {
          totalCandidates: allCandidates.length,
          winnerScore: winner.score,
          averageScore: allCandidates.reduce((sum, c) => sum + c.score, 0) / allCandidates.length,
          scoringWeights: result.sampling ? {} : undefined, // Would get from config
        },
        candidates: allCandidates.map(candidate => ({
          id: candidate.id,
          score: candidate.score,
          breakdown: candidate.scores,
          reasoning: candidate.reasoning,
          optimization: candidate.content.optimization,
          baseImage: candidate.content.baseImage,
          multistage: candidate.content.multistage,
        })),
        winner: {
          id: winner.id,
          advantages: this.analyzeWinnerAdvantages(winner, allCandidates),
          recommendations: this.generateRecommendations(winner.content),
        },
      };

      const scoringResource = await context.resourcePublisher.publish(
        scoringReport,
        'application/json',
        3600,
      );

      // Publish build instructions
      const buildInstructions = this.generateBuildInstructions(winner.content);
      const instructionsResource = await context.resourcePublisher.publish(
        buildInstructions,
        'text/plain',
        3600,
      );

      result.resources = {
        winnerDockerfile: winnerResource,
        allCandidates: candidatesResource,
        scoringReport: scoringResource,
        buildInstructions: instructionsResource,
      };

    } catch (error) {
      this.logger.warn({ error }, 'Failed to publish sampling resources');
    }
  }

  private async createMCPResponse(
    result: EnhancedGenerateDockerfileResult,
    _context: EnhancedToolContext,
  ): Promise<Result<MCPToolCallResponse>> {
    try {
      let summary = `Dockerfile Generation Complete:
- Base image: ${result.baseImage}
- Strategy: ${result.dockerfileMetadata.buildStrategy}
- Estimated size: ${result.dockerfileMetadata.estimatedImageSizeMB}MB
- Security score: ${result.dockerfileMetadata.securityScore}/100
- Lines: ${result.dockerfileMetadata.linesCount}`;

      if (result.sampling) {
        summary += `\n- Sampling: ${result.sampling.candidatesGenerated} candidates, winner score ${result.sampling.winnerScore?.toFixed(2)}`;
      }

      const content: MCPToolCallResponse['content'] = [
        {
          type: 'text',
          text: summary,
        },
      ];

      // Add resource references if available
      if (result.resources) {
        if (result.resources.winnerDockerfile) {
          content.push({
            type: 'resource',
            resource: {
              uri: result.resources.winnerDockerfile.uri,
              mimeType: result.resources.winnerDockerfile.mimeType,
              text: 'Generated Dockerfile (winner from sampling)',
            },
          });
        }

        if (result.resources.scoringReport) {
          content.push({
            type: 'resource',
            resource: {
              uri: result.resources.scoringReport.uri,
              mimeType: result.resources.scoringReport.mimeType,
              text: 'Detailed candidate scoring analysis',
            },
          });
        }

        if (result.resources.allCandidates) {
          content.push({
            type: 'resource',
            resource: {
              uri: result.resources.allCandidates.uri,
              mimeType: result.resources.allCandidates.mimeType,
              text: 'All generated Dockerfile candidates for comparison',
            },
          });
        }

        if (result.resources.buildInstructions) {
          content.push({
            type: 'resource',
            resource: {
              uri: result.resources.buildInstructions.uri,
              mimeType: result.resources.buildInstructions.mimeType,
              text: 'Step-by-step build instructions and optimization tips',
            },
          });
        }
      }

      return Success({ content });

    } catch (error) {
      return Failure(`Failed to create MCP response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Helper methods
  private createSummary(dockerfile: DockerfileCandidate, candidateCount: number): string {
    return `Generated ${dockerfile.optimization}-optimized ${dockerfile.multistage ? 'multi-stage' : 'single-stage'} Dockerfile` +
           ` (${candidateCount} candidates evaluated)`;
  }

  private generateBasicDockerfile(analysisResult: any, config: any): string {
    const baseImage = config.baseImage || this.getDefaultBaseImage(analysisResult.language);
    const port = analysisResult.ports[0] || 3000;

    return `# Generated Dockerfile for ${analysisResult.language}
FROM ${baseImage}
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 -G appuser

# Copy and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY --chown=appuser:appuser . .

EXPOSE ${port}

USER appuser

CMD ["npm", "start"]`;
  }

  private getDefaultBaseImage(language: string): string {
    const baseImages: Record<string, string> = {
      javascript: 'node:18-alpine',
      typescript: 'node:18-alpine',
      python: 'python:3.11-slim',
      java: 'openjdk:17-alpine',
      go: 'golang:1.21-alpine',
    };
    return baseImages[language] || 'alpine:latest';
  }

  private analyzeWinnerAdvantages(
    winner: ScoredCandidate<DockerfileCandidate>,
    allCandidates: ScoredCandidate<DockerfileCandidate>[],
  ): string[] {
    const advantages = [];
    const avgScores = this.calculateAverageScores(allCandidates);

    for (const [metric, score] of Object.entries(winner.scores)) {
      const avgScore = avgScores[metric];
      if (avgScore && score > avgScore + 5) { // 5 point threshold
        advantages.push(`${metric}: ${score.toFixed(1)} vs avg ${avgScore.toFixed(1)}`);
      }
    }

    return advantages;
  }

  private calculateAverageScores(candidates: ScoredCandidate<DockerfileCandidate>[]): Record<string, number> {
    const avgScores: Record<string, number> = {};

    if (candidates.length === 0) return avgScores;

    // Get all unique metrics
    const metrics = new Set<string>();
    candidates.forEach(candidate => {
      Object.keys(candidate.scores).forEach(metric => metrics.add(metric));
    });

    // Calculate averages
    metrics.forEach(metric => {
      const total = candidates.reduce((sum, candidate) => sum + (candidate.scores[metric] || 0), 0);
      avgScores[metric] = total / candidates.length;
    });

    return avgScores;
  }

  private generateRecommendations(dockerfile: DockerfileCandidate): string[] {
    const recommendations = [];

    if (dockerfile.metadata.securityScore < 90) {
      recommendations.push('Consider using distroless base images for better security');
    }

    if (dockerfile.metadata.estimatedSize > 200) {
      recommendations.push('Use multi-stage builds to reduce image size');
    }

    if (dockerfile.metadata.buildTime > 120) {
      recommendations.push('Optimize layer caching by ordering COPY commands strategically');
    }

    recommendations.push('Add health checks for container monitoring');
    recommendations.push('Use specific version tags instead of latest for reproducibility');

    return recommendations;
  }

  private generateBuildInstructions(dockerfile: DockerfileCandidate): string {
    return `# Build Instructions for ${dockerfile.optimization.toUpperCase()}-Optimized Dockerfile

## Quick Build
\`\`\`bash
docker build -t my-app:latest .
\`\`\`

## Optimized Build (recommended)
\`\`\`bash
# Build with build-time arguments
docker build \\
  --build-arg NODE_ENV=production \\
  --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \\
  -t my-app:v1.0.0 .
\`\`\`

## Run Container
\`\`\`bash
docker run -d \\
  --name my-app \\
  -p 3000:3000 \\
  --restart unless-stopped \\
  my-app:v1.0.0
\`\`\`

## Build Optimizations Applied
- Base image: ${dockerfile.baseImage}
- Multi-stage build: ${dockerfile.multistage ? 'Yes' : 'No'}
- Security hardening: Non-root user, minimal attack surface
- Estimated image size: ~${dockerfile.metadata.estimatedSize}MB

## Security Recommendations
- Scan image regularly: \`docker scan my-app:v1.0.0\`
- Use secrets management for sensitive data
- Keep base images updated
- Monitor for vulnerabilities in dependencies

## Performance Tips
- Use \`.dockerignore\` to exclude unnecessary files
- Leverage Docker build cache by organizing layers efficiently
- Consider using build mounts for package managers
`;
  }
}

/**
 * Factory function for creating enhanced generate-dockerfile tool
 */
export function createEnhancedGenerateDockerfileTool(logger: Logger): EnhancedGenerateDockerfileTool {
  return new EnhancedGenerateDockerfileTool(logger);
}
