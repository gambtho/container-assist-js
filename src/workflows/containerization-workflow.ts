/**
 * Simple Workflow Implementation - De-Enterprise Refactoring
 *
 * Replaces the 587-line WorkflowCoordinator class with simple functions.
 * Direct execution without complex orchestration patterns.
 */

import type { Logger } from 'pino';
import { Result, Success, Failure } from '../types/core';
import { analyzeRepo } from '../tools/analyze-repo';
import { generateDockerfile } from '../tools/generate-dockerfile';
import { buildImage } from '../tools/build-image';
import { scanImage } from '../tools/scan';
import { generateBestDockerfile } from './dockerfile-sampling';

export interface WorkflowConfig {
  enableSampling?: boolean;
  maxVulnerabilityLevel?: 'low' | 'medium' | 'high' | 'critical';
  enableAutoRemediation?: boolean;
  buildArgs?: Record<string, string>;
  stepsToRun?: string[];
  customDockerfile?: string;
}

export interface WorkflowResult {
  ok: boolean;
  analysis?: any;
  dockerfile?: string;
  imageId?: string;
  scanResult?: any;
  duration: number;
  errors?: string[];
}

/**
 * Executes the complete containerization workflow for a repository
 *
 * This workflow performs repository analysis, Dockerfile generation (with optional sampling),
 * image building, and security scanning. It replaces the complex enterprise coordinator
 * pattern with a simple sequential execution.
 *
 * @param repoPath - Path to the repository to containerize
 * @param logger - Logger instance for structured logging
 * @param config - Optional workflow configuration including sampling, security settings, and custom options
 * @returns Promise resolving to workflow result with analysis, dockerfile, imageId, and scan results
 */
export const runContainerizationWorkflow = async (
  repoPath: string,
  logger: Logger,
  config: WorkflowConfig = {},
): Promise<Result<WorkflowResult>> => {
  const startTime = Date.now();
  const sessionId = `workflow-${Date.now()}`;

  logger.info({ repoPath, sessionId }, 'Starting containerization workflow');

  const result: WorkflowResult = {
    ok: false,
    duration: 0,
    errors: [],
  };

  try {
    // Step 1: Analyze repository
    logger.info('Step 1: Analyzing repository');
    const analysis = await analyzeRepo(
      {
        sessionId,
        repoPath,
        depth: 3,
        includeTests: false,
      },
      logger,
    );

    if (!analysis.ok) {
      return Failure(`Analysis failed: ${analysis.error}`);
    }

    result.analysis = analysis.value;

    // Step 2: Generate Dockerfile
    // Strategy selection: sampling generates multiple candidates and picks the best,
    // while standard generation creates a single optimized Dockerfile
    logger.info('Step 2: Generating Dockerfile');
    let dockerfileResult;

    if (config.enableSampling) {
      // Sampling approach: generates multiple Dockerfile variants and selects the most optimized
      dockerfileResult = await generateBestDockerfile(
        {
          sessionId,
          repoPath,
        },
        { environment: 'production' },
        logger,
      );
    } else {
      // Standard approach: single Dockerfile with optimization and multi-stage build patterns
      dockerfileResult = await generateDockerfile(
        {
          sessionId,
          optimization: true,
          multistage: true,
        },
        logger,
      );
    }

    if (!dockerfileResult.ok) {
      return Failure(`Dockerfile generation failed: ${dockerfileResult.error}`);
    }

    result.dockerfile = config.enableSampling
      ? dockerfileResult.value.content
      : dockerfileResult.value.content;

    // Step 3: Build image
    logger.info('Step 3: Building Docker image');
    const buildResult = await buildImage(
      {
        sessionId,
        context: repoPath,
        dockerfile: 'Dockerfile',
        tags: [`${sessionId}:latest`],
        buildArgs: config.buildArgs || {},
      },
      logger,
    );

    if (!buildResult.ok) {
      return Failure(`Build failed: ${buildResult.error}`);
    }

    result.imageId = buildResult.value.imageId;

    // Step 4: Scan image for vulnerabilities
    logger.info('Step 4: Scanning image for vulnerabilities');
    const scanResult = await scanImage(
      {
        sessionId,
        scanner: 'trivy',
        severityThreshold: config.maxVulnerabilityLevel || 'high',
      },
      logger,
    );

    if (!scanResult.ok) {
      logger.warn({ error: scanResult.error }, 'Image scan failed, but continuing workflow');
      result.errors?.push(`Scan failed: ${scanResult.error}`);
    } else {
      result.scanResult = scanResult.value;

      // Check if scan results are acceptable
      const { vulnerabilities } = scanResult.value;
      const criticalIssues = vulnerabilities.critical + vulnerabilities.high;

      if (criticalIssues > 0 && config.enableAutoRemediation) {
        logger.warn(
          { criticalIssues },
          'Critical vulnerabilities found, but auto-remediation not implemented in simple workflow',
        );
      }
    }

    result.ok = true;
    result.duration = Date.now() - startTime;

    logger.info(
      {
        sessionId,
        duration: result.duration,
        imageId: result.imageId,
        vulnerabilities: result.scanResult?.vulnerabilities?.total || 0,
      },
      'Containerization workflow completed successfully',
    );

    return Success(result);
  } catch (error) {
    result.duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors?.push(errorMessage);

    logger.error(
      {
        error: errorMessage,
        duration: result.duration,
        sessionId,
      },
      'Containerization workflow failed',
    );

    return Failure(errorMessage);
  }
};

/**
 * Simple build-only workflow
 */
export const runBuildOnlyWorkflow = async (
  repoPath: string,
  logger: Logger,
  config: WorkflowConfig = {},
): Promise<Result<{ imageId: string; duration: number }>> => {
  const startTime = Date.now();
  const sessionId = `build-${Date.now()}`;

  logger.info({ repoPath, sessionId }, 'Starting build-only workflow');

  try {
    // Analyze first
    const analysis = await analyzeRepo({ sessionId, repoPath }, logger);
    if (!analysis.ok) {
      return Failure(`Analysis failed: ${analysis.error}`);
    }

    // Generate Dockerfile
    const dockerfileResult = await generateDockerfile({ sessionId }, logger);
    if (!dockerfileResult.ok) {
      return Failure(`Dockerfile generation failed: ${dockerfileResult.error}`);
    }

    // Build image
    const buildResult = await buildImage(
      {
        sessionId,
        context: repoPath,
        buildArgs: config.buildArgs || {},
      },
      logger,
    );

    if (!buildResult.ok) {
      return Failure(`Build failed: ${buildResult.error}`);
    }

    const duration = Date.now() - startTime;
    logger.info({ sessionId, duration }, 'Build-only workflow completed');

    return Success({
      imageId: buildResult.value.imageId,
      duration,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage, sessionId }, 'Build workflow failed');
    return Failure(errorMessage);
  }
};
