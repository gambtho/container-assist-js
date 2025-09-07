/**
 * Dockerfile Sampling MCP Tools
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../core/types';
import { SamplingService } from '../workflows/sampling/sampling-service';
import type { SamplingConfig, ScoringCriteria, SamplingOptions } from '../workflows/sampling/types';
import { createMCPAIOrchestrator } from '../mcp/ai/orchestrator';
import type { ValidationContext } from '../mcp/tools/validator';

/**
 * Validation hook helper for sampling tools
 */
async function validateSamplingParameters(
  toolName: string,
  parameters: Record<string, any>,
  logger: Logger,
  _context?: import('../mcp/core/types.js').MCPContext,
): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
  try {
    // Create AI orchestrator if MCP context is available
    const aiOrchestrator = createMCPAIOrchestrator(logger);

    const validationContext: ValidationContext = {
      toolName,
      repositoryPath: parameters.repoPath,
      environment: parameters.environment || 'development',
      targetType: 'dockerfile',
    };

    const validationResult = await aiOrchestrator.validateParameters(
      toolName,
      parameters,
      validationContext,
    );

    if (validationResult.ok) {
      const { data } = validationResult.value;
      return {
        isValid: data.isValid,
        errors: data.errors,
        warnings: data.warnings,
      };
    } else {
      // Fallback to basic validation if AI validation fails
      logger.warn(
        { toolName, error: validationResult.error },
        'AI validation failed, using basic validation',
      );
      return {
        isValid: true,
        errors: [],
        warnings: ['AI parameter validation unavailable'],
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ toolName, error: message }, 'Parameter validation error');
    return {
      isValid: true,
      errors: [],
      warnings: [`Parameter validation error: ${message}`],
    };
  }
}

/**
 * Generate multiple Dockerfile variants using sampling strategies
 */
export const dockerfileSampling = {
  name: 'dockerfile-sampling',
  execute: async (
    config: {
      sessionId: string;
      repoPath: string;
      variantCount?: number;
      strategies?: string[];
      environment?: 'development' | 'staging' | 'production';
      optimization?: 'size' | 'security' | 'performance' | 'balanced';
      criteria?: Partial<ScoringCriteria>;
    },
    logger: Logger,
    context?: import('../mcp/core/types.js').MCPContext,
  ): Promise<Result<any>> => {
    try {
      logger.info(
        {
          sessionId: config.sessionId,
          repoPath: config.repoPath,
          variantCount: config.variantCount,
        },
        'Starting Dockerfile sampling',
      );

      // 1. Validate parameters using AI orchestrator
      const validation = await validateSamplingParameters(
        'dockerfile-sampling',
        config,
        logger,
        context,
      );

      if (!validation.isValid) {
        return Failure(`Parameter validation failed: ${validation.errors.join('; ')}`);
      }

      if (validation.warnings.length > 0) {
        logger.warn(
          { sessionId: config.sessionId, warnings: validation.warnings },
          'Parameter validation warnings detected',
        );
      }

      // Enhanced progress tracking
      const toolContext = context as import('../mcp/server/middleware.js').ToolContext;
      await toolContext?.progressUpdater?.(5, 'Initializing sampling service...');

      // Use prompt registry from MCP context if available, otherwise create default
      const mcpContext = context as import('../mcp/core/types.js').MCPContext;
      const samplingService = new SamplingService(logger, mcpContext?.promptRegistry);

      await toolContext?.progressUpdater?.(15, 'Configuring sampling strategy...');

      const samplingConfig: SamplingConfig = {
        sessionId: config.sessionId,
        repoPath: config.repoPath,
        variantCount: config.variantCount || 5,
        ...(config.strategies && { strategies: config.strategies }),
        ...(config.criteria && { criteria: config.criteria }),
        ...(config.optimization && { constraints: { preferredOptimization: config.optimization } }),
        enableCaching: true,
        timeout: 120000, // 2 minutes for sampling
      };

      await toolContext?.progressUpdater?.(30, 'Generating variants...', config.variantCount || 5);
      const result = await samplingService.generateVariants(samplingConfig);
      await toolContext?.progressUpdater?.(80, 'Analyzing and scoring variants...');

      if (!result.ok) {
        return Failure(`Sampling failed: ${result.error}`);
      }

      const samplingResult = result.value;

      await toolContext?.progressUpdater?.(95, 'Finalizing results...');

      logger.info(
        {
          sessionId: config.sessionId,
          variantsGenerated: samplingResult.variants.length,
          bestStrategy: samplingResult.bestVariant.strategy,
          bestScore: samplingResult.bestVariant.score.total,
        },
        'Dockerfile sampling completed',
      );

      await toolContext?.progressUpdater?.(100, 'Sampling complete');

      return Success({
        sessionId: samplingResult.sessionId,
        totalVariants: samplingResult.variants.length,
        bestVariant: {
          id: samplingResult.bestVariant.id,
          strategy: samplingResult.bestVariant.strategy,
          score: samplingResult.bestVariant.score.total,
          content: samplingResult.bestVariant.content,
          optimization: samplingResult.bestVariant.metadata.optimization,
          features: samplingResult.bestVariant.metadata.features,
          estimatedSize: samplingResult.bestVariant.metadata.estimatedSize,
          buildComplexity: samplingResult.bestVariant.metadata.buildComplexity,
        },
        allVariants: samplingResult.variants.map((variant) => ({
          id: variant.id,
          strategy: variant.strategy,
          score: variant.score.total,
          rank: variant.rank,
          optimization: variant.metadata.optimization,
          features: variant.metadata.features,
          warnings: variant.score.warnings,
          recommendations: variant.score.recommendations,
        })),
        criteria: samplingResult.criteria,
        metadata: {
          strategiesUsed: samplingResult.metadata.strategiesUsed,
          samplingDuration: samplingResult.metadata.samplingDuration,
          scoringDuration: samplingResult.metadata.scoringDuration,
          generatedAt: samplingResult.generated,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          error: message,
          sessionId: config.sessionId,
        },
        'Dockerfile sampling tool failed',
      );

      return Failure(`Sampling tool error: ${message}`);
    }
  },
};

/**
 * Score and compare multiple Dockerfiles
 */
export const dockerfileCompare = {
  name: 'dockerfile-compare',
  execute: async (
    config: {
      sessionId: string;
      dockerfiles: Array<{
        id: string;
        content: string;
        strategy?: string;
      }>;
      criteria?: Partial<ScoringCriteria>;
    },
    logger: Logger,
    context?: import('../mcp/core/types.js').MCPContext,
  ): Promise<Result<any>> => {
    try {
      logger.info(
        {
          sessionId: config.sessionId,
          dockerfileCount: config.dockerfiles.length,
        },
        'Starting Dockerfile comparison',
      );

      if (!config.dockerfiles || config.dockerfiles.length < 2) {
        return Failure('At least 2 Dockerfiles are required for comparison');
      }

      // 1. Validate parameters using AI orchestrator
      const validation = await validateSamplingParameters(
        'dockerfile-compare',
        config,
        logger,
        context,
      );

      if (!validation.isValid) {
        return Failure(`Parameter validation failed: ${validation.errors.join('; ')}`);
      }

      if (validation.warnings.length > 0) {
        logger.warn(
          { sessionId: config.sessionId, warnings: validation.warnings },
          'Dockerfile comparison validation warnings',
        );
      }

      // Use prompt registry from MCP context if available, otherwise create default
      const mcpContext = context as import('../mcp/core/types.js').MCPContext;
      const samplingService = new SamplingService(logger, mcpContext?.promptRegistry);

      const result = await samplingService.compareDockerfiles(
        config.dockerfiles,
        config.criteria as ScoringCriteria,
      );

      if (!result.ok) {
        return Failure(`Comparison failed: ${result.error}`);
      }

      const comparison = result.value;

      logger.info(
        {
          sessionId: config.sessionId,
          compared: comparison.variants.length,
          bestVariant: comparison.bestVariant.id,
          bestScore: comparison.bestVariant.score.total,
        },
        'Dockerfile comparison completed',
      );

      return Success({
        sessionId: config.sessionId,
        bestVariant: {
          id: comparison.bestVariant.id,
          strategy: comparison.bestVariant.strategy,
          score: comparison.bestVariant.score.total,
          scoreBreakdown: comparison.bestVariant.score.breakdown,
          reasons: comparison.bestVariant.score.reasons,
          warnings: comparison.bestVariant.score.warnings,
          recommendations: comparison.bestVariant.score.recommendations,
        },
        allVariants: comparison.variants.map((variant) => ({
          id: variant.id,
          strategy: variant.strategy,
          score: variant.score.total,
          rank: variant.rank,
          scoreBreakdown: variant.score.breakdown,
          warnings: variant.score.warnings.slice(0, 3), // Limit for brevity
          recommendations: variant.score.recommendations.slice(0, 3),
        })),
        comparison: comparison.comparison,
        summary: comparison.comparison.summary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          error: message,
          sessionId: config.sessionId,
        },
        'Dockerfile comparison tool failed',
      );

      return Failure(`Comparison tool error: ${message}`);
    }
  },
};

/**
 * Validate a single Dockerfile against best practices
 */
export const dockerfileValidate = {
  name: 'dockerfile-validate',
  execute: async (
    config: {
      sessionId: string;
      content: string;
      criteria?: Partial<ScoringCriteria>;
    },
    logger: Logger,
    context?: import('../mcp/core/types.js').MCPContext,
  ): Promise<Result<any>> => {
    try {
      logger.info(
        {
          sessionId: config.sessionId,
          contentLength: config.content.length,
        },
        'Starting Dockerfile validation',
      );

      if (!config.content || config.content.trim().length === 0) {
        return Failure('Dockerfile content is required');
      }

      // 1. Validate parameters using AI orchestrator
      const paramValidation = await validateSamplingParameters(
        'dockerfile-validate',
        config,
        logger,
        context,
      );

      if (!paramValidation.isValid) {
        return Failure(`Parameter validation failed: ${paramValidation.errors.join('; ')}`);
      }

      if (paramValidation.warnings.length > 0) {
        logger.warn(
          { sessionId: config.sessionId, warnings: paramValidation.warnings },
          'Dockerfile validation parameter warnings',
        );
      }

      // Use prompt registry from MCP context if available, otherwise create default
      const mcpContext = context as import('../mcp/core/types.js').MCPContext;
      const samplingService = new SamplingService(logger, mcpContext?.promptRegistry);

      const result = await samplingService.validateDockerfile(
        config.content,
        config.criteria as ScoringCriteria,
      );

      if (!result.ok) {
        return Failure(`Validation failed: ${result.error}`);
      }

      const dockerfileValidation = result.value;

      logger.info(
        {
          sessionId: config.sessionId,
          score: dockerfileValidation.score,
          isValid: dockerfileValidation.isValid,
          issueCount: dockerfileValidation.issues.length,
        },
        'Dockerfile validation completed',
      );

      return Success({
        sessionId: config.sessionId,
        score: dockerfileValidation.score,
        scoreBreakdown: dockerfileValidation.breakdown,
        isValid: dockerfileValidation.isValid,
        grade:
          dockerfileValidation.score >= 80
            ? 'A'
            : dockerfileValidation.score >= 70
              ? 'B'
              : dockerfileValidation.score >= 60
                ? 'C'
                : dockerfileValidation.score >= 50
                  ? 'D'
                  : 'F',
        issues: dockerfileValidation.issues,
        recommendations: dockerfileValidation.recommendations,
        summary: dockerfileValidation.isValid
          ? 'Dockerfile meets quality standards'
          : `Dockerfile needs improvement (${dockerfileValidation.issues.length} issues found)`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          error: message,
          sessionId: config.sessionId,
        },
        'Dockerfile validation tool failed',
      );

      return Failure(`Validation tool error: ${message}`);
    }
  },
};

/**
 * Get best Dockerfile from sampling (simplified interface for workflow integration)
 */
export const dockerfileBest = {
  name: 'dockerfile-best',
  execute: async (
    config: {
      sessionId: string;
      repoPath: string;
      environment?: 'development' | 'staging' | 'production';
      optimization?: 'size' | 'security' | 'performance' | 'balanced';
    },
    logger: Logger,
    context?: import('../mcp/core/types.js').MCPContext,
  ): Promise<Result<any>> => {
    try {
      logger.info(
        {
          sessionId: config.sessionId,
          repoPath: config.repoPath,
          environment: config.environment,
          optimization: config.optimization,
        },
        'Generating best Dockerfile via sampling',
      );

      // 1. Validate parameters using AI orchestrator
      const validation = await validateSamplingParameters(
        'dockerfile-best',
        config,
        logger,
        context,
      );

      if (!validation.isValid) {
        return Failure(`Parameter validation failed: ${validation.errors.join('; ')}`);
      }

      if (validation.warnings.length > 0) {
        logger.warn(
          { sessionId: config.sessionId, warnings: validation.warnings },
          'Best Dockerfile generation parameter warnings',
        );
      }

      // Use prompt registry from MCP context if available, otherwise create default
      const mcpContext = context as import('../mcp/core/types.js').MCPContext;
      const samplingService = new SamplingService(logger, mcpContext?.promptRegistry);

      const options: SamplingOptions = {
        environment: config.environment || 'production',
        ...(config.optimization && { optimization: config.optimization }),
      };

      const result = await samplingService.generateBestDockerfile(
        { sessionId: config.sessionId, repoPath: config.repoPath },
        options,
        logger,
      );

      if (!result.ok) {
        return Failure(`Best Dockerfile generation failed: ${result.error}`);
      }

      const { content, score, metadata } = result.value;

      logger.info(
        {
          sessionId: config.sessionId,
          score: score * 100,
          strategy: metadata.strategy,
          optimization: metadata.optimization,
        },
        'Best Dockerfile generated successfully',
      );

      return Success({
        sessionId: config.sessionId,
        content,
        score: score * 100, // Convert to 0-100 scale
        strategy: metadata.strategy,
        optimization: metadata.optimization,
        features: metadata.features,
        estimatedSize: metadata.estimatedSize,
        buildComplexity: metadata.buildComplexity,
        scoreBreakdown: metadata.scoreBreakdown,
        recommendations: metadata.recommendations,
        warnings: metadata.warnings,
        metadata: {
          approach: metadata.approach,
          environment: metadata.environment,
          variants: metadata.variants,
          generatedAt: metadata.generatedAt,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          error: message,
          sessionId: config.sessionId,
        },
        'Best Dockerfile tool failed',
      );

      return Failure(`Best Dockerfile tool error: ${message}`);
    }
  },
};

/**
 * List available sampling strategies
 */
export const samplingStrategies = {
  name: 'sampling-strategies',
  execute: async (
    config: { sessionId?: string },
    logger: Logger,
    context?: import('../mcp/core/types.js').MCPContext,
  ): Promise<Result<any>> => {
    try {
      logger.info('Retrieving available sampling strategies');

      // 1. Validate parameters using AI orchestrator (minimal validation for info tool)
      const validation = await validateSamplingParameters(
        'sampling-strategies',
        config,
        logger,
        context,
      );

      if (validation.warnings.length > 0) {
        logger.debug(
          { warnings: validation.warnings },
          'Sampling strategies parameter warnings (non-critical)',
        );
      }

      // Use prompt registry from MCP context if available, otherwise create default
      const mcpContext = context as import('../mcp/core/types.js').MCPContext;
      const samplingService = new SamplingService(logger, mcpContext?.promptRegistry);
      const strategies = samplingService.getAvailableStrategies();

      return Success({
        strategies,
        count: strategies.length,
        descriptions: {
          'security-first':
            'Prioritizes security best practices with non-root users and minimal packages',
          'performance-optimized':
            'Optimizes for build speed and runtime performance using multi-stage builds',
          'size-optimized': 'Minimizes final image size using distroless/alpine images',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, 'Sampling strategies tool failed');

      return Failure(`Strategies tool error: ${message}`);
    }
  },
};
