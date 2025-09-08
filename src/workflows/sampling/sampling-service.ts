/**
 * Sampling Service - Main entry point for Dockerfile sampling functionality
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '@types';
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
import { PromptRegistry } from '@prompts/prompt-registry';
import {
  createMCPAIOrchestrator,
  type MCPAIOrchestrator,
} from '@workflows/intelligent-orchestration';
import { Sampler } from '@mcp/sampling/sampler';
import type { ValidationContext } from '@mcp/tools/validator';
import {
  createSDKResourceManager,
  createResourceContext,
  type SDKResourceManager,
} from '@resources/manager';
import { UriParser } from '@resources/uri-schemes';

/**
 * High-level sampling service that provides the main API for Dockerfile sampling
 */
export class SamplingService {
  private pipeline: VariantGenerationPipeline;
  private aiOrchestrator: MCPAIOrchestrator;
  private resourceManager: SDKResourceManager;
  private sampler: Sampler;

  constructor(
    private logger: Logger,
    promptRegistry?: PromptRegistry,
  ) {
    this.pipeline = new VariantGenerationPipeline(logger, promptRegistry);
    this.aiOrchestrator = createMCPAIOrchestrator(logger, promptRegistry ? { promptRegistry } : {});
    this.sampler = new Sampler(logger);

    // Initialize resource management for sampling results
    const resourceContext = createResourceContext(
      {
        defaultTtl: 3600000, // 1 hour
        maxResourceSize: 10 * 1024 * 1024, // 10MB
        cacheConfig: { defaultTtl: 3600000 },
      },
      logger,
    );
    this.resourceManager = createSDKResourceManager(resourceContext);
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
      // 1. Validate parameters using AI orchestrator
      const validationContext: ValidationContext = {
        toolName: 'dockerfile-sampling',
        repositoryPath: config.repoPath,
        environment: options.environment || 'development',
        targetType: 'dockerfile',
      };

      const validationResult = await this.aiOrchestrator.validateParameters(
        'dockerfile-best',
        { ...config, ...options },
        { ...validationContext } as Record<string, unknown>,
      );

      if (validationResult.ok && !validationResult.value.isValid) {
        logger.warn(
          {
            errors: validationResult.value.errors,
            warnings: validationResult.value.warnings,
          },
          'Parameter validation failed, proceeding with warnings',
        );
      }

      // Use sampler when available for optimal quality and performance
      // This path leverages enhanced AI models with context-aware prompting and transport fallback
      if (this.sampler.isAvailable()) {
        logger.info(
          {
            sessionId: config.sessionId,
            optimization: options.optimization,
            environment: options.environment,
          },
          'Using sampler for enhanced Dockerfile generation',
        );

        // Analyze repository structure to inform generation strategy
        const repoAnalysis = await this.analyzeRepositoryContext(config.repoPath, logger);
        const enhancedPrompt = this.buildEnhancedPrompt(config.repoPath, options, repoAnalysis);

        // Apply repository-specific strategies for specialized frameworks and patterns
        const samplingResult = await this.sampler.sampleDockerfileStrategies(enhancedPrompt, {
          sessionId: config.sessionId,
          context: {
            language: (repoAnalysis.language as string) || 'javascript',
            framework: repoAnalysis.framework as string,
            dependencies: (repoAnalysis.dependencies as string[]) || [],
            ports: [3000], // Default port, could be enhanced
            buildTools: [],
            environment: options.environment || 'production',
            repoPath: config.repoPath,
          },
          variantCount: 1,
          strategies: options.optimization ? [options.optimization as any] : ['balanced'],
        });

        if (samplingResult.ok) {
          const result = samplingResult.value;
          const variants = result.variants;
          const strategiesList = [...new Set(variants.map((v) => v.strategy))];

          logger.info(
            {
              sessionId: config.sessionId,
              strategiesGenerated: strategiesList,
              variantsGenerated: variants.length,
              source: 'sampler-strategies',
            },
            'Sampler strategy sampling successful',
          );

          // Choose optimal variant based on user preferences
          const preferredStrategy = options.optimization || 'balanced';
          const selectedVariant =
            result.bestVariant ||
            variants.find((v) => v.strategy.includes(preferredStrategy)) ||
            variants[0];

          const selectedContent = selectedVariant?.content;

          if (selectedContent) {
            // Calculate confidence score based on strategy alignment and content quality metrics
            const confidence = this.calculateNativeConfidence(
              selectedContent,
              options,
              strategiesList.length,
            );

            return Success({
              content: selectedContent,
              score: confidence,
              metadata: {
                approach: 'sampler-strategy',
                environment: options.environment,
                variants: variants.length,
                strategy: selectedVariant?.strategy || preferredStrategy,
                optimization:
                  selectedVariant?.metadata.optimization || options.optimization || 'balanced',
                features:
                  selectedVariant?.metadata.features ||
                  this.extractDockerfileFeatures(selectedContent),
                strategiesGenerated: strategiesList,
                repoAnalysis,
                generatedAt: new Date().toISOString(),
                sampler: true,
                confidence,
                quality: result.quality,
                samplingMetadata: result.metadata,
              },
            });
          }
        }

        // Fallback to diversity boost if strategy sampling fails
        logger.info(
          { sessionId: config.sessionId },
          'Strategy sampling unavailable, trying diversity boost',
        );

        const enhancedPromptForDiversity = this.buildEnhancedPrompt(config.repoPath, options);
        const diversityResult = await this.sampler.sampleWithDiversityBoost(
          enhancedPromptForDiversity,
          {
            sessionId: config.sessionId,
            targetDiversity: 0.8,
            maxAttempts: 3,
            samples: 3,
            temperature: 0.7,
          },
        );

        if (diversityResult.ok && diversityResult.value.length > 0) {
          const bestContent = diversityResult.value[0];
          if (bestContent) {
            const confidence = this.calculateNativeConfidence(
              bestContent,
              options,
              diversityResult.value.length,
            );

            return Success({
              content: bestContent,
              score: confidence,
              metadata: {
                approach: 'sampler-diversity',
                environment: options.environment,
                variants: diversityResult.value.length,
                strategy: 'adaptive',
                optimization: options.optimization || 'balanced',
                features: this.extractDockerfileFeatures(bestContent),
                diversity: 0.8,
                generatedAt: new Date().toISOString(),
                sampler: true,
                confidence,
              },
            });
          }
        }

        logger.warn({ sessionId: config.sessionId }, 'Sampler failed, falling back to pipeline');
      }

      const samplingConfig: SamplingConfig = {
        sessionId: config.sessionId,
        repoPath: config.repoPath,
        variantCount: 5,
        enableCaching: true,
        timeout: 60000,
        criteria: this.buildScoringCriteria(options),
      };

      if (options.optimization) {
        samplingConfig.constraints = { preferredOptimization: options.optimization };
      }

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
    // 1. Validate sampling configuration parameters
    const validationContext: ValidationContext = {
      toolName: 'dockerfile-sampling',
      repositoryPath: config.repoPath,
      environment: config.environment || 'development',
      targetType: 'dockerfile',
    };

    const validationResult = await this.aiOrchestrator.validateParameters(
      'dockerfile-sampling',
      config as unknown as Record<string, unknown>,
      validationContext as unknown as Record<string, unknown>,
    );

    if (validationResult.ok && !validationResult.value.isValid) {
      this.logger.warn(
        {
          sessionId: config.sessionId,
          errors: validationResult.value.errors,
          warnings: validationResult.value.warnings,
        },
        'Sampling configuration validation issues detected',
      );

      // Return validation errors if critical
      const criticalErrors = validationResult.value.errors.filter(
        (error: string) => error.includes('required') || error.includes('invalid'),
      );

      if (criticalErrors.length > 0) {
        return Failure(`Configuration validation failed: ${criticalErrors.join('; ')}`);
      }
    }

    // 2. Check if sampling results are already cached
    const cacheUri = UriParser.build('sampling', `${config.sessionId}/variants`);
    const cachedResult = await this.resourceManager.readResource(cacheUri);

    if (cachedResult.ok && cachedResult.value) {
      this.logger.info({ sessionId: config.sessionId }, 'Using cached sampling results');

      try {
        const text = cachedResult.value.contents?.[0]?.text ?? '{}';
        const cachedData = JSON.parse(typeof text === 'string' ? text : '{}');
        return Success(cachedData as SamplingResult);
      } catch (error) {
        this.logger.warn(
          { sessionId: config.sessionId, error },
          'Failed to parse cached sampling results, generating new ones',
        );
      }
    }

    // 3. Generate new sampling results
    const result = await this.pipeline.generateSampledDockerfiles(config);

    // 4. Cache successful results for future use
    if (result.ok) {
      const cacheResult = await this.resourceManager.publishEnhanced(
        cacheUri,
        result.value,
        {
          category: 'sampling-result',
          name: `sampling-${config.sessionId}`,
          description: `Sampling results for session ${config.sessionId}`,
          annotations: {
            tags: ['dockerfile', 'sampling', config.sessionId],
            priority: 1,
          },
        },
        3600000, // 1 hour TTL
      );

      if (cacheResult.ok) {
        this.logger.info(
          { sessionId: config.sessionId, cacheUri },
          'Sampling results cached successfully',
        );
      } else {
        this.logger.warn(
          { sessionId: config.sessionId, error: cacheResult.error },
          'Failed to cache sampling results',
        );
      }
    }

    return result;
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
      const scorer = (this.pipeline as any).scorer;

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

      const scorer = (this.pipeline as any).scorer;

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
      if (parts.length >= 2 && parts[1]) {
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
    if (!best) {
      return {
        summary: 'No variants available',
        advantages: {},
        tradeoffs: {},
      };
    }
    const summary = `Best variant: ${best.id} (${best.strategy}) with score ${best.score.total}/100`;

    const advantages: Record<string, string[]> = {};
    const tradeoffs: Record<string, string[]> = {};

    scoredVariants.forEach((variant) => {
      advantages[variant.id] = variant.score.reasons;
      tradeoffs[variant.id] = variant.score.warnings;
    });

    return { summary, advantages, tradeoffs };
  }

  /**
   * Clean up sampling resources for a session
   */
  async cleanupSamplingResources(sessionId: string): Promise<Result<number>> {
    try {
      const pattern = `sampling://${sessionId}/*`;
      const cleanupResult = await this.resourceManager.invalidateResource(pattern);

      if (cleanupResult.ok) {
        this.logger.info({ sessionId, pattern }, 'Sampling resources cleaned up successfully');
        return Success(1); // Return count of cleaned resources
      } else {
        return Failure(`Failed to clean up sampling resources: ${cleanupResult.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ sessionId, error: message }, 'Sampling resource cleanup failed');
      return Failure(`Sampling resource cleanup error: ${message}`);
    }
  }

  /**
   * Get cached sampling results for a session
   */
  async getCachedSamplingResults(sessionId: string): Promise<Result<SamplingResult | null>> {
    try {
      const cacheUri = UriParser.build('sampling', `${sessionId}/variants`);
      const cachedResult = await this.resourceManager.readResource(cacheUri);

      if (cachedResult.ok && cachedResult.value) {
        try {
          const text = cachedResult.value.contents?.[0]?.text ?? '{}';
          const cachedData = JSON.parse(typeof text === 'string' ? text : '{}');
          return Success(cachedData as SamplingResult);
        } catch (error) {
          this.logger.warn({ sessionId, error }, 'Failed to parse cached sampling results');
          return Success(null);
        }
      }

      return Success(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ sessionId, error: message }, 'Failed to get cached sampling results');
      return Failure(`Failed to get cached results: ${message}`);
    }
  }

  /**
   * Get sampling resource statistics
   */
  getSamplingResourceStats(): ReturnType<typeof this.resourceManager.getStats> {
    return this.resourceManager.getStats();
  }

  /**
   * Analyze repository context for enhanced prompting
   * @param repoPath - Absolute path to the repository directory
   * @param logger - Logger instance for debug output
   * @returns Promise resolving to repository context metadata
   */
  private async analyzeRepositoryContext(
    repoPath: string,
    logger: Logger,
  ): Promise<Record<string, unknown>> {
    const repoPathStr = String(repoPath);
    try {
      // Basic repository analysis - could be enhanced with actual file analysis
      const context: Record<string, unknown> = {
        repoPath,
        timestamp: new Date().toISOString(),
      };

      // Try to detect language and framework from common indicators
      try {
        const fs = await import('fs/promises');
        const path = await import('path');

        // Check for common files
        const files: string[] = await fs.readdir(repoPathStr).catch(() => [] as string[]);

        if (files.includes('package.json')) {
          try {
            const fileName = 'package.json';
            const packagePath = path.join(repoPathStr, fileName);
            const packageContent = await fs.readFile(packagePath, 'utf-8');
            const packageJson = JSON.parse(packageContent);

            (context as any).language = 'javascript';
            (context as any).appName = packageJson.name;
            (context as any).dependencies = Object.keys(packageJson.dependencies || {}).slice(
              0,
              10,
            );

            // Detect framework
            if (packageJson.dependencies?.['next'] || packageJson.dependencies?.['@next/core']) {
              (context as any).framework = 'nextjs';
            } else if (packageJson.dependencies?.['express']) {
              (context as any).framework = 'express';
            } else if (packageJson.dependencies?.['react']) {
              (context as any).framework = 'react';
            }
          } catch (error) {
            logger.debug({ error }, 'Failed to parse package.json');
          }
        } else if (files.includes('requirements.txt') || files.includes('pyproject.toml')) {
          (context as any).language = 'python';
          (context as any).framework = 'python';
        } else if (files.includes('pom.xml') || files.includes('build.gradle')) {
          const pomFile = 'pom.xml';
          (context as any).language = 'java';
          (context as any).framework = files.includes(pomFile) ? 'maven' : 'gradle';
        } else if (files.includes('go.mod')) {
          (context as any).language = 'go';
          (context as any).framework = 'go';
        }

        // Check for Docker-related files
        const dockerFile = 'Dockerfile';
        if (files.includes(dockerFile)) {
          (context as any).hasExistingDockerfile = true;
        }
        const composeFiles = ['docker-compose.yml', 'docker-compose.yaml'];
        if (composeFiles.some((file) => files.includes(file))) {
          (context as any).hasDockerCompose = true;
        }

        (context as any).detectedFiles = files.slice(0, 20); // Limit for logging
      } catch (error) {
        logger.debug(
          { error, repoPath: repoPathStr },
          'Repository analysis failed, using defaults',
        );
      }

      return context;
    } catch (error) {
      logger.warn({ error, repoPath: repoPathStr }, 'Repository context analysis failed');
      return { repoPath: repoPathStr, language: 'unknown' };
    }
  }

  /**
   * Build enhanced prompt with repository context
   * @param repoPath - Path to the repository being analyzed
   * @param options - Sampling options including environment and optimization preferences
   * @param repoAnalysis - Optional repository analysis context
   * @returns Formatted prompt string for AI Dockerfile generation
   */
  private buildEnhancedPrompt(
    repoPath: string,
    options: SamplingOptions,
    repoAnalysis?: Record<string, unknown>,
  ): string {
    const environment = options.environment || 'production';
    const optimization = options.optimization || 'balanced';

    let prompt = `Generate an optimized Dockerfile for the repository at ${repoPath}.

Requirements:
- Target environment: ${environment}
- Optimization focus: ${optimization}`;

    if (repoAnalysis) {
      if (repoAnalysis.language) {
        prompt += `\n- Programming language: ${String(repoAnalysis.language)}`;
      }
      if (repoAnalysis.framework) {
        prompt += `\n- Framework: ${String(repoAnalysis.framework)}`;
      }
      if (repoAnalysis.dependencies && Array.isArray(repoAnalysis.dependencies)) {
        prompt += `\n- Key dependencies: ${repoAnalysis.dependencies.slice(0, 5).join(', ')}`;
      }
      if (repoAnalysis.hasExistingDockerfile) {
        prompt += `\n- Note: Repository already contains a Dockerfile - provide an improved version`;
      }
    }

    prompt += `\n
Best practices to follow:
- Use multi-stage builds for ${optimization} optimization
- Apply security best practices (non-root user, minimal packages)
- Include health checks for ${environment} deployment
- Optimize layer caching for build performance
- Follow containerization security guidelines`;

    if (environment === 'production') {
      prompt += `\n- Production-ready configurations with proper resource limits`;
    }

    if (optimization === 'security') {
      prompt += `\n- Prioritize security hardening and vulnerability reduction`;
    } else if (optimization === 'performance') {
      prompt += `\n- Focus on runtime performance and startup speed`;
    } else if (optimization === 'size') {
      prompt += `\n- Minimize final image size using distroless or alpine bases`;
    }

    return prompt;
  }

  /**
   * Calculate confidence score for native MCP results
   */
  private calculateNativeConfidence(
    content: string,
    options: SamplingOptions,
    variantCount: number,
  ): number {
    let confidence = 0.85; // Base confidence for native MCP

    // Boost confidence based on content quality indicators
    if (content.includes('FROM ') && content.includes('COPY ') && content.includes('CMD ')) {
      confidence += 0.05; // Basic Dockerfile structure
    }

    if (content.includes('USER ') && !content.includes('USER root')) {
      confidence += 0.03; // Security: non-root user
    }

    if (content.includes('HEALTHCHECK')) {
      confidence += 0.02; // Production readiness
    }

    // Boost based on strategy alignment
    if (options.optimization === 'security' && content.includes('USER ')) {
      confidence += 0.03;
    } else if (options.optimization === 'size' && content.includes('alpine')) {
      confidence += 0.03;
    } else if (options.optimization === 'performance' && content.includes('# multi-stage')) {
      confidence += 0.03;
    }

    // Boost based on variant count (more variants = higher confidence)
    confidence += Math.min(variantCount * 0.01, 0.05);

    return Math.min(confidence, 0.98); // Cap at 98%
  }

  /**
   * Extract Dockerfile features for metadata
   */
  private extractDockerfileFeatures(content: string): string[] {
    const features: string[] = [];

    if (content.includes('# multi-stage') || (content.match(/FROM /g) || []).length > 1) {
      features.push('multi-stage');
    }

    if (content.includes('USER ') && !content.includes('USER root')) {
      features.push('security-hardened');
    }

    if (content.includes('HEALTHCHECK')) {
      features.push('health-checks');
    }

    if (content.includes('alpine') || content.includes('distroless')) {
      features.push('size-optimized');
    }

    if (content.includes('--no-cache') || content.includes('npm ci')) {
      features.push('build-optimized');
    }

    if (content.includes('EXPOSE')) {
      features.push('service-ready');
    }

    if (content.includes('WORKDIR')) {
      features.push('structured');
    }

    return features.length > 0 ? features : ['standard'];
  }
}
