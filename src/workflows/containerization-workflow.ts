/**
 * Containerization Workflow Implementation
 *
 * Orchestrates repository analysis, Dockerfile generation, and image building.
 * Provides a simplified interface for complex containerization operations.
 *
 * @example
 * ```typescript
 * const result = await executeContainerizationWorkflow(
 *   '/path/to/project',
 *   'session-123',
 *   { enableSampling: true, securityFocus: true },
 *   logger
 * );
 *
 * if (result.ok) {
 *   console.log('Dockerfile generated:', result.dockerfile);
 *   console.log('Image built:', result.imageId);
 * }
 * ```
 */

import { Result, Success, Failure } from '@types';
import { analyzeRepo } from '@tools/analyze-repo';
import { generateDockerfile } from '@tools/generate-dockerfile';
import { buildImage } from '@tools/build-image';
import { scanImage } from '@tools/scan';
import { generateBestDockerfile } from './dockerfile-sampling';
import type { ToolContext } from '../mcp/context/types';

/**
 * Configuration for containerization workflow execution
 * Controls analysis depth, security settings, and build behavior
 */
export interface ContainerizationConfig {
  /** Enable AI-powered sampling for better Dockerfile generation */
  enableSampling?: boolean;
  /** Enable multiple analysis perspectives for comprehensive insights */
  enablePerspectives?: boolean;
  /** Primary analysis perspective to apply */
  analysisPerspective?: 'comprehensive' | 'security-focused' | 'performance-focused';
  /** Prioritize security recommendations in analysis */
  securityFocus?: boolean;
  /** Prioritize performance optimizations in analysis */
  performanceFocus?: boolean;
  /** Maximum acceptable vulnerability severity level */
  maxVulnerabilityLevel?: 'low' | 'medium' | 'high' | 'critical';
  /** Automatically apply security fixes during workflow */
  enableAutoRemediation?: boolean;
  /** Docker build arguments to pass through */
  buildArgs?: Record<string, string>;
  /** Specific workflow steps to execute (runs all if not specified) */
  stepsToRun?: string[];
  /** Custom Dockerfile content to use instead of generation */
  customDockerfile?: string;
}

/** Repository analysis result with flexible structure */
type AnalysisResult = Record<string, unknown>;

/** Security scan result with flexible structure */
type ScanResult = Record<string, unknown>;

/**
 * Result of containerization workflow execution
 * Contains all artifacts produced during the workflow
 */
export interface ContainerizationResult {
  /** Whether the workflow completed successfully */
  ok: boolean;
  /** Repository analysis results */
  analysis?: AnalysisResult;
  /** Generated or processed Dockerfile content */
  dockerfile?: string;
  imageId?: string;
  scanResult?: ScanResult;
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
  context: ToolContext,
  config: ContainerizationConfig = {},
): Promise<Result<ContainerizationResult>> => {
  const startTime = Date.now();
  const sessionId = `workflow-${Date.now()}`;
  const logger = context.logger;

  logger.info({ repoPath, sessionId }, 'Starting containerization workflow');

  const result: ContainerizationResult = {
    ok: false,
    duration: 0,
    errors: [],
  };

  try {
    // Step 1: Analyze repository (with optional sampling)
    logger.info('Step 1: Analyzing repository');
    const analysisConfig = {
      sessionId,
      repoPath,
      depth: 3,
      includeTests: false,
      // Enable analysis perspectives if configured
      ...(config.enablePerspectives && {
        usePerspectives: true,
        ...(config.analysisPerspective && { perspective: config.analysisPerspective }),
        ...(config.securityFocus !== undefined && { securityFocus: config.securityFocus }),
        ...(config.performanceFocus !== undefined && { performanceFocus: config.performanceFocus }),
      }),
    };

    const analysis = await analyzeRepo(analysisConfig, context);

    if (!analysis.ok) {
      return Failure(`Analysis failed: ${analysis.error}`);
    }

    result.analysis = analysis.value as unknown as AnalysisResult;

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
        context.logger,
      );
    } else {
      // Standard approach: single Dockerfile with optimization and multi-stage build patterns
      dockerfileResult = await generateDockerfile(
        {
          sessionId,
          optimization: true,
          multistage: true,
        },
        context,
      );
    }

    if (!dockerfileResult.ok) {
      return Failure(`Dockerfile generation failed: ${dockerfileResult.error}`);
    }

    result.dockerfile = config.enableSampling
      ? (dockerfileResult.value as import('./sampling/types').SamplingResult).bestVariant.content
      : (
          dockerfileResult.value as import('../tools/generate-dockerfile/tool').GenerateDockerfileResult
        ).content;

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
      context,
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
        severity: config.maxVulnerabilityLevel || 'high',
      },
      context,
    );

    if (!scanResult.ok) {
      logger.warn({ error: scanResult.error }, 'Image scan failed, but continuing workflow');
      result.errors?.push(`Scan failed: ${scanResult.error}`);
    } else {
      result.scanResult = scanResult.value as unknown as ScanResult;

      // Check if scan results are acceptable
      const scanData = scanResult.value as unknown as ScanResult;
      const vulnerabilities = scanData.vulnerabilities as
        | { critical?: number; high?: number }
        | undefined;
      const criticalIssues = (vulnerabilities?.critical || 0) + (vulnerabilities?.high || 0);

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
        vulnerabilities: (result.scanResult?.vulnerabilities as { total?: number })?.total || 0,
      },
      'Containerization workflow completed successfully',
    );

    return Success(result);
  } catch (error) {
    result.duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (result.errors) {
      result.errors.push(errorMessage);
    } else {
      result.errors = [errorMessage];
    }

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
  context: ToolContext,
  config: ContainerizationConfig = {},
): Promise<Result<{ imageId: string; duration: number }>> => {
  const startTime = Date.now();
  const sessionId = `build-${Date.now()}`;
  const logger = context.logger;

  logger.info({ repoPath, sessionId }, 'Starting build-only workflow');

  try {
    // Analyze first (with optional sampling)
    const analysisConfig = {
      sessionId,
      repoPath,
      // Enable analysis perspectives if configured
      ...(config.enablePerspectives && {
        usePerspectives: true,
        ...(config.analysisPerspective && { perspective: config.analysisPerspective }),
        ...(config.securityFocus !== undefined && { securityFocus: config.securityFocus }),
        ...(config.performanceFocus !== undefined && { performanceFocus: config.performanceFocus }),
      }),
    };

    const analysis = await analyzeRepo(analysisConfig, context);
    if (!analysis.ok) {
      return Failure(`Analysis failed: ${analysis.error}`);
    }

    // Generate Dockerfile
    const dockerfileResult = await generateDockerfile({ sessionId }, context);
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
      context,
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
