/**
 * Dockerfile Sampling - Main entry point for sampling functionality
 *
 * This module provides the primary interface for Dockerfile sampling,
 * integrating with the new comprehensive sampling system.
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../types/core';
import { SamplingService } from './sampling/sampling-service';

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

    // Create sampling service
    const samplingService = new SamplingService(logger);

    // Generate best Dockerfile using sampling
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
