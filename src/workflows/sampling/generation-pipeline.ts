/**
 * Generation Pipeline - Orchestrates Dockerfile sampling workflow
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../../types/core';
import type {
  SamplingConfig,
  SamplingResult,
  DockerfileContext,
  DockerfileVariant,
  ScoredVariant,
  ScoringCriteria,
} from './types';
import { StrategyEngine } from './strategy-engine';
import { VariantScorer, DEFAULT_SCORING_CRITERIA } from './scorer';
import { analyzeRepo } from '../../tools/analyze-repo';

/**
 * Validation utilities for sampling data
 */
export class SamplingValidator {
  static validateDockerfileContent(content: string): Result<void> {
    if (!content || content.trim().length === 0) {
      return Failure('Dockerfile content cannot be empty');
    }

    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line);

    // Must have at least one FROM instruction
    if (!lines.some((line) => line.toLowerCase().startsWith('from '))) {
      return Failure('Dockerfile must contain at least one FROM instruction');
    }

    // Check for basic structure
    if (lines.length < 3) {
      return Failure(
        'Dockerfile appears too minimal - needs at least FROM, WORKDIR/COPY, and CMD/ENTRYPOINT',
      );
    }

    return Success(undefined);
  }

  static validateSamplingConfig(config: SamplingConfig): Result<void> {
    if (!config.sessionId || config.sessionId.trim().length === 0) {
      return Failure('Session ID is required');
    }

    if (!config.repoPath || config.repoPath.trim().length === 0) {
      return Failure('Repository path is required');
    }

    if (config.variantCount && (config.variantCount < 1 || config.variantCount > 10)) {
      return Failure('Variant count must be between 1 and 10');
    }

    if (config.timeout && (config.timeout < 5000 || config.timeout > 300000)) {
      return Failure('Timeout must be between 5 seconds and 5 minutes');
    }

    return Success(undefined);
  }

  static validateScoringCriteria(criteria: Partial<ScoringCriteria>): Result<ScoringCriteria> {
    const weights = {
      security: criteria.security ?? DEFAULT_SCORING_CRITERIA.security,
      performance: criteria.performance ?? DEFAULT_SCORING_CRITERIA.performance,
      size: criteria.size ?? DEFAULT_SCORING_CRITERIA.size,
      maintainability: criteria.maintainability ?? DEFAULT_SCORING_CRITERIA.maintainability,
    };

    // Check individual weights
    for (const [key, weight] of Object.entries(weights)) {
      if (weight < 0 || weight > 1) {
        return Failure(`${key} weight must be between 0 and 1`);
      }
    }

    // Check total weight
    const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 1) > 0.01) {
      return Failure('Scoring criteria weights must sum to 1.0');
    }

    return Success(weights as ScoringCriteria);
  }

  static validateVariant(variant: DockerfileVariant): Result<void> {
    if (!variant.id || variant.id.trim().length === 0) {
      return Failure('Variant must have a valid ID');
    }

    const contentValidation = this.validateDockerfileContent(variant.content);
    if (!contentValidation.ok) {
      return contentValidation;
    }

    if (!variant.strategy || variant.strategy.trim().length === 0) {
      return Failure('Variant must specify the strategy used');
    }

    if (!variant.metadata) {
      return Failure('Variant must include metadata');
    }

    if (!variant.metadata.baseImage || variant.metadata.baseImage.trim().length === 0) {
      return Failure('Variant metadata must specify base image');
    }

    return Success(undefined);
  }
}

/**
 * Main generation pipeline for Dockerfile sampling
 */
export class VariantGenerationPipeline {
  private strategyEngine: StrategyEngine;
  private scorer: VariantScorer;

  constructor(private logger: Logger) {
    this.strategyEngine = new StrategyEngine(logger);
    this.scorer = new VariantScorer(logger);
  }

  /**
   * Execute complete sampling pipeline
   */
  async generateSampledDockerfiles(config: SamplingConfig): Promise<Result<SamplingResult>> {
    const startTime = Date.now();

    try {
      // Validate configuration
      const configValidation = SamplingValidator.validateSamplingConfig(config);
      if (!configValidation.ok) {
        return Failure(`Invalid configuration: ${configValidation.error}`);
      }

      this.logger.info(
        {
          sessionId: config.sessionId,
          repoPath: config.repoPath,
          variantCount: config.variantCount || 5,
        },
        'Starting Dockerfile sampling pipeline',
      );

      // Step 1: Analyze repository
      const contextResult = await this.buildSamplingContext(config);
      if (!contextResult.ok) {
        return Failure(`Context building failed: ${contextResult.error}`);
      }

      const context = contextResult.value;
      this.logger.debug(
        {
          language: context.analysis.language,
          framework: context.analysis.framework,
          environment: context.constraints.targetEnvironment,
        },
        'Sampling context prepared',
      );

      // Step 2: Generate variants
      const generationStart = Date.now();
      const variantsResult = await this.strategyEngine.generateVariants(context, config.strategies);
      if (!variantsResult.ok) {
        return Failure(`Variant generation failed: ${variantsResult.error}`);
      }

      let variants = variantsResult.value;

      // Limit to requested count
      const requestedCount = config.variantCount || 5;
      if (variants.length > requestedCount) {
        variants = variants.slice(0, requestedCount);
      }

      this.logger.info(
        {
          generated: variants.length,
          strategies: [...new Set(variants.map((v) => v.strategy))],
        },
        'Dockerfile variants generated',
      );

      // Step 3: Score variants
      const scoringStart = Date.now();
      const criteria = await this.prepareScoringCriteria(config.criteria, context);

      const scoredVariantsResult = await this.scorer.scoreVariants(variants, criteria);
      if (!scoredVariantsResult.ok) {
        return Failure(`Variant scoring failed: ${scoredVariantsResult.error}`);
      }

      const scoredVariants = this.combineVariantsWithScores(variants, scoredVariantsResult.value);
      const scoringEnd = Date.now();

      // Step 4: Select best variant
      const bestVariant = this.scorer.selectBestVariant(scoredVariants, config.constraints);
      if (!bestVariant) {
        return Failure('No suitable variant found matching selection criteria');
      }

      const endTime = Date.now();

      // Build final result
      const result: SamplingResult = {
        sessionId: config.sessionId,
        variants: scoredVariants,
        bestVariant,
        criteria,
        metadata: {
          totalVariants: scoredVariants.length,
          strategiesUsed: [...new Set(variants.map((v) => v.strategy))],
          samplingDuration: scoringStart - generationStart,
          scoringDuration: scoringEnd - scoringStart,
          context,
        },
        generated: new Date(),
      };

      this.logger.info(
        {
          sessionId: config.sessionId,
          totalVariants: result.variants.length,
          bestVariant: result.bestVariant.id,
          bestScore: result.bestVariant.score.total,
          totalDuration: endTime - startTime,
        },
        'Dockerfile sampling completed successfully',
      );

      return Success(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        {
          error: message,
          sessionId: config.sessionId,
          duration: Date.now() - startTime,
        },
        'Sampling pipeline failed',
      );

      return Failure(`Sampling pipeline error: ${message}`);
    }
  }

  /**
   * Build sampling context from repository analysis
   */
  private async buildSamplingContext(config: SamplingConfig): Promise<Result<DockerfileContext>> {
    try {
      // Analyze repository
      const analysisResult = await analyzeRepo(
        {
          sessionId: config.sessionId,
          repoPath: config.repoPath,
          depth: 2,
          includeTests: false,
        },
        this.logger,
      );

      if (!analysisResult.ok) {
        return Failure(`Repository analysis failed: ${analysisResult.error}`);
      }

      const analysis = analysisResult.value;

      // Extract relevant information for sampling
      const samplingContext: DockerfileContext = {
        sessionId: config.sessionId,
        repoPath: config.repoPath,
        analysis: {
          language: analysis.language || 'javascript',
          framework: analysis.framework,
          packageManager: this.detectPackageManager(analysis),
          dependencies: analysis.dependencies || [],
          buildTools: this.extractBuildTools(analysis),
          testFramework: analysis.testFramework,
          hasDatabase: this.detectDatabaseUsage(analysis),
          ports: this.extractPorts(analysis),
          environmentVars: this.extractEnvironmentVars(analysis),
        },
        constraints: {
          targetEnvironment: this.determineEnvironment(config),
          securityLevel: this.determineSecurityLevel(config),
          maxImageSize: config.constraints?.maxImageSize,
          buildTimeLimit: config.timeout,
        },
      };

      this.logger.debug({ context: samplingContext }, 'Sampling context built');
      return Success(samplingContext);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Failure(`Context building error: ${message}`);
    }
  }

  /**
   * Prepare scoring criteria based on config and context
   */
  private async prepareScoringCriteria(
    customCriteria?: Partial<ScoringCriteria>,
    context?: DockerfileContext,
  ): Promise<ScoringCriteria> {
    if (customCriteria) {
      const validation = SamplingValidator.validateScoringCriteria(customCriteria);
      if (validation.ok) {
        return validation.value;
      }
    }

    // Use environment-based preset if no custom criteria
    const environment = context?.constraints.targetEnvironment || 'production';
    return this.scorer.getScoringPreset(environment);
  }

  /**
   * Combine variants with their scores
   */
  private combineVariantsWithScores(
    variants: DockerfileVariant[],
    scores: Array<{
      total: number;
      breakdown: any;
      reasons: string[];
      warnings: string[];
      recommendations: string[];
    }>,
  ): ScoredVariant[] {
    return variants
      .map((variant, index) => ({
        ...variant,
        score: scores[index],
        rank: 0, // Will be set by scorer
      }))
      .sort((a, b) => b.score.total - a.score.total)
      .map((variant, index) => ({
        ...variant,
        rank: index + 1,
      }));
  }

  // Helper methods for context building
  private detectPackageManager(analysis: any): string {
    if (analysis.files?.['package-lock.json']) return 'npm';
    if (analysis.files?.['yarn.lock']) return 'yarn';
    if (analysis.files?.['pnpm-lock.yaml']) return 'pnpm';
    return 'npm';
  }

  private extractBuildTools(analysis: any): string[] {
    const tools: string[] = [];
    const packageJson = analysis.files?.['package.json'];

    if (packageJson && typeof packageJson === 'object') {
      const scripts = packageJson.scripts || {};
      if (scripts.build) tools.push('build-script');
      if (scripts.test) tools.push('test-runner');
      if (scripts.lint) tools.push('linter');

      const devDeps = packageJson.devDependencies || {};
      if (devDeps.webpack) tools.push('webpack');
      if (devDeps.vite) tools.push('vite');
      if (devDeps.typescript) tools.push('typescript');
    }

    return tools;
  }

  private detectDatabaseUsage(analysis: any): boolean {
    const dependencies = analysis.dependencies || [];
    const dbKeywords = [
      'mongodb',
      'mysql',
      'postgres',
      'redis',
      'sqlite',
      'prisma',
      'sequelize',
      'typeorm',
    ];
    return dependencies.some((dep: string) =>
      dbKeywords.some((keyword) => dep.toLowerCase().includes(keyword)),
    );
  }

  private extractPorts(analysis: any): number[] {
    const ports: number[] = [];

    // Check common port patterns in code
    const files = analysis.files || {};
    const content = Object.values(files).join(' ').toLowerCase();

    // Look for common port patterns
    const portMatches = content.match(/port[:\s=]+(\d+)/g);
    if (portMatches) {
      portMatches.forEach((match) => {
        const port = parseInt(match.replace(/[^\d]/g, ''));
        if (port > 1000 && port < 65535 && !ports.includes(port)) {
          ports.push(port);
        }
      });
    }

    // Default ports based on language/framework
    if (ports.length === 0) {
      const language = analysis.language || '';
      if (language.includes('node') || language.includes('javascript')) {
        ports.push(3000);
      } else if (language.includes('python')) {
        ports.push(8000);
      } else if (language.includes('java')) {
        ports.push(8080);
      } else if (language.includes('go')) {
        ports.push(8080);
      } else {
        ports.push(3000);
      }
    }

    return ports.slice(0, 3); // Limit to first 3 ports
  }

  private extractEnvironmentVars(analysis: any): Record<string, string> {
    const envVars: Record<string, string> = {};

    // Look for common environment variables
    const files = analysis.files || {};
    for (const [_filename, content] of Object.entries(files)) {
      if (typeof content === 'string') {
        // Look for process.env usage
        const envMatches = content.match(/process\.env\.([A-Z_][A-Z0-9_]*)/g);
        if (envMatches) {
          envMatches.forEach((match) => {
            const varName = match.replace('process.env.', '');
            if (!envVars[varName]) {
              envVars[varName] = `\${${varName}}`;
            }
          });
        }
      }
    }

    // Add common defaults
    if (Object.keys(envVars).length === 0) {
      envVars['NODE_ENV'] = 'production';
      envVars['PORT'] = '3000';
    }

    return envVars;
  }

  private determineEnvironment(_config: SamplingConfig): 'development' | 'staging' | 'production' {
    // Could be enhanced to detect from repo structure or config
    return 'production'; // Default to production for sampling
  }

  private determineSecurityLevel(_config: SamplingConfig): 'basic' | 'enhanced' | 'strict' {
    // Could be enhanced based on detected security requirements
    return 'enhanced'; // Default to enhanced security
  }

  /**
   * Get available sampling strategies
   */
  getAvailableStrategies(): string[] {
    return this.strategyEngine.getAvailableStrategies();
  }

  /**
   * Register a custom sampling strategy
   */
  registerStrategy(strategy: any): void {
    this.strategyEngine.registerStrategy(strategy);
  }
}
