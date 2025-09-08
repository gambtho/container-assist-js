/**
 * Dockerfile Sampling - Main entry point for sampling functionality
 *
 * This module provides the primary interface for Dockerfile sampling,
 * integrating with the new comprehensive sampling system.
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '@types';
import { SamplingService } from './sampling/sampling-service';
import { createMCPAIOrchestrator } from '@workflows/intelligent-orchestration';
import type { ValidationContext } from '@mcp/tools/validator';

// Re-export types for backward compatibility
export interface SamplingConfig {
  sessionId: string;
  repoPath: string;
}

export interface SamplingOptions {
  environment: 'development' | 'staging' | 'production';
  optimization?: 'size' | 'security' | 'performance' | 'balanced';
}

export interface SamplingResult {
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * Generate the best Dockerfile using comprehensive sampling strategies
 *
 * This function now uses the full sampling system with multiple strategies,
 * advanced scoring, and intelligent selection.
 */
export async function generateBestDockerfile(
  config: SamplingConfig,
  options: SamplingOptions,
  logger: Logger,
): Promise<Result<SamplingResult>> {
  try {
    logger.info({ config, options }, 'Starting advanced Dockerfile sampling');

    // 1. Initialize AI orchestrator for parameter validation
    const aiOrchestrator = createMCPAIOrchestrator(logger);

    // 2. Validate parameters before sampling
    const validationContext: ValidationContext = {
      toolName: 'dockerfile-sampling',
      repositoryPath: config.repoPath,
      environment: options.environment || 'development',
      targetType: 'dockerfile',
    };

    const validationResult = await aiOrchestrator.validateParameters(
      'generateBestDockerfile',
      { ...config, ...options },
      validationContext,
    );

    if (validationResult.ok && !validationResult.value.isValid) {
      logger.warn(
        {
          errors: validationResult.value.errors,
          warnings: validationResult.value.warnings,
          sessionId: config.sessionId,
        },
        'Parameter validation issues detected in Dockerfile sampling',
      );

      // Check for critical validation errors
      const criticalErrors = validationResult.value.errors.filter(
        (error: string) => error.includes('required') || error.includes('invalid'),
      );

      if (criticalErrors.length > 0) {
        return Failure(`Parameter validation failed: ${criticalErrors.join('; ')}`);
      }
    }

    // 3. Create sampling service
    const samplingService = new SamplingService(logger);

    // 4. Generate best Dockerfile using sampling
    const result = await samplingService.generateBestDockerfile(config, options, logger);

    if (!result.ok) {
      logger.error({ error: result.error }, 'Sampling service failed');
      return Failure(`Sampling failed: ${result.error}`);
    }

    const { content, score, metadata } = result.value;

    logger.info(
      {
        score: score * 100, // Convert back to 0-100 scale for logging
        strategy: metadata.strategy,
        variants: metadata.variants,
        optimization: metadata.optimization,
      },
      'Advanced Dockerfile sampling completed successfully',
    );

    return Success({
      content,
      score,
      metadata,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        error: message,
        sessionId: config.sessionId,
      },
      'Dockerfile sampling failed',
    );

    return Failure(`Dockerfile sampling error: ${message}`);
  }
}
