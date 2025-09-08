/**
 * Builds Docker images from Dockerfiles with comprehensive logging and error handling.
 *
 * @example
 * ```typescript
 * const result = await buildImage({
 *   sessionId: 'session-123',
 *   context: '/path/to/app',
 *   tags: ['myapp:latest', 'myapp:v1.0.0'],
 *   buildArgs: { NODE_ENV: 'production' }
 * }, context, logger);
 *
 * if (result.success) {
 *   console.log('Image built:', result.imageId);
 *   console.log('Build time:', result.buildTime, 'ms');
 * }
 * ```
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createSessionManager } from '../../lib/session';
import { createDockerClient } from '../../lib/docker';
import { createTimer, type Logger } from '../../lib/logger';
import { updateWorkflowState, type WorkflowState, type Result } from '../../domain/types';
import { createToolProgressReporter } from '../../mcp/server/progress';
import type { ToolContext } from '../types';
import { DockerError, FileSystemError, ErrorCodes, executeAsResult } from '../../lib/errors';
/**
 * Internal Docker build options interface
 * Maps to docker build command parameters
 */
interface DockerBuildOptions {
  /** Path to Dockerfile relative to build context */
  dockerfile?: string;
  /** Image tag(s) to apply */
  t?: string;
  /** Build arguments as key-value pairs */
  buildargs?: Record<string, string>;
  /** Target platform (e.g., 'linux/amd64') */
  platform?: string;
}

/**
 * Configuration for Docker image build operation
 */
export interface BuildImageConfig {
  /** Unique session identifier for tracking build state */
  sessionId: string;
  /** Build context directory path (defaults to current directory) */
  context?: string;
  /** Path to Dockerfile (defaults to 'Dockerfile' in context) */
  dockerfile?: string;
  /** Image tags to apply (e.g., ['myapp:latest', 'myapp:1.0']) */
  tags?: string[];
  /** Build arguments to pass to Docker build */
  buildArgs?: Record<string, string>;
  /** Multi-stage build target to build */
  target?: string;
  /** Disable build cache */
  noCache?: boolean;
  /** Target platform for multi-platform builds */
  platform?: string;
}

/**
 * Result of Docker image build operation
 */
export interface BuildImageResult {
  /** Whether the build completed successfully */
  success: boolean;
  /** Session identifier used for this build */
  sessionId: string;
  /** Generated Docker image ID (SHA256 hash) */
  imageId: string;
  /** Tags applied to the built image */
  tags: string[];
  /** Final image size in bytes */
  size: number;
  /** Number of layers in the image */
  layers?: number;
  /** Total build time in milliseconds */
  buildTime: number;
  /** Complete build output logs */
  logs: string[];
  /** Security-related warnings discovered during build */
  securityWarnings?: string[];
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Prepare build arguments with defaults
 */
interface SessionWithAnalysis {
  workflow_state?: {
    analysis_result?: {
      language?: string;
      framework?: string;
    };
  };
}

function prepareBuildArgs(
  buildArgs: Record<string, string> = {},
  session: SessionWithAnalysis | null | undefined,
): Record<string, string> {
  const defaults: Record<string, string> = {
    NODE_ENV: process.env.NODE_ENV ?? 'production',
    BUILD_DATE: new Date().toISOString(),
    VCS_REF: process.env.GIT_COMMIT ?? 'unknown',
  };

  // Add session-specific args if available
  const analysisResult = session?.workflow_state?.analysis_result;
  if (analysisResult) {
    if (analysisResult.language) {
      defaults.LANGUAGE = analysisResult.language;
    }
    if (analysisResult.framework) {
      defaults.FRAMEWORK = analysisResult.framework;
    }
  }

  return { ...defaults, ...buildArgs };
}

/**
 * Analyze build for security issues
 */
function analyzeBuildSecurity(dockerfile: string, buildArgs: Record<string, string>): string[] {
  const warnings: string[] = [];

  // Check for secrets in build args
  const sensitiveKeys = ['password', 'token', 'key', 'secret', 'api_key', 'apikey'];
  for (const key of Object.keys(buildArgs)) {
    if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
      warnings.push(`Potential secret in build arg: ${key}`);
    }
  }

  // Check for sudo in Dockerfile
  if (dockerfile.includes('sudo ')) {
    warnings.push('Using sudo in Dockerfile - consider running as non-root');
  }

  // Check for latest tags
  if (dockerfile.includes(':latest')) {
    warnings.push('Using :latest tag - consider pinning versions for reproducibility');
  }

  // Check for root user
  if (!dockerfile.includes('USER ') || dockerfile.includes('USER root')) {
    warnings.push('Container may run as root - consider adding a non-root USER');
  }

  return warnings;
}

/**
 * Internal implementation using exceptions
 */
async function buildImageInternal(
  config: BuildImageConfig,
  logger: Logger,
  context?: ToolContext,
): Promise<BuildImageResult> {
  const timer = createTimer(logger, 'build-image');

  // Extract abort signal and progress token from context if available
  const abortSignal = context?.abortSignal;
  const progressToken = context?.progressToken;

  // Create progress reporter
  const reportProgress = createToolProgressReporter(
    progressToken ? { progressToken, logger } : { logger },
    'build-image',
  );

  try {
    await reportProgress('Initializing build process', 0);
    const {
      sessionId,
      context: buildContext = '.',
      dockerfile = 'Dockerfile',
      tags = [],
      buildArgs = {},
      target,
      noCache = false,
      platform,
    } = config;

    logger.info(
      { sessionId, context: buildContext, dockerfile, tags },
      'Starting Docker image build',
    );

    await reportProgress('Validating parameters', 10);

    const startTime = Date.now();

    // Check for abort signal early
    if (abortSignal?.aborted) {
      throw new Error('Build operation cancelled');
    }

    // Use sessionManager from context or create new one
    const sessionManager = context?.sessionManager || createSessionManager(logger);
    const dockerClient = createDockerClient(logger);

    // Get or create session
    await reportProgress('Loading session', 20);
    let session = await sessionManager.get(sessionId);
    if (!session) {
      // Create new session with the specified sessionId
      session = await sessionManager.create(sessionId);
    }

    // Determine paths
    const sessionState = session as SessionWithAnalysis & { repo_path?: string };
    const repoPath = sessionState.repo_path ?? buildContext;
    let dockerfilePath = path.resolve(repoPath, dockerfile);

    // Check if we should use a generated Dockerfile
    const dockerfileResult = (sessionState as Record<string, unknown>).dockerfile_result as
      | Record<string, unknown>
      | undefined;
    const generatedPath = dockerfileResult?.path as string | undefined;

    if (!(await fileExists(dockerfilePath))) {
      // If the specified Dockerfile doesn't exist, check for generated one
      if (generatedPath && (await fileExists(generatedPath))) {
        dockerfilePath = generatedPath;
        logger.info({ generatedPath, originalPath: dockerfile }, 'Using generated Dockerfile');
      } else {
        // Check if we have Dockerfile content in session
        const dockerfileContent = dockerfileResult?.content as string | undefined;
        if (dockerfileContent) {
          // Write the Dockerfile content to generated file
          dockerfilePath = path.join(repoPath, 'Dockerfile.generated');
          await fs.writeFile(dockerfilePath, dockerfileContent, 'utf-8');
          logger.info({ dockerfilePath }, 'Created Dockerfile from session content');
        } else {
          throw new FileSystemError(
            `Dockerfile not found at ${dockerfilePath}`,
            ErrorCodes.FILE_NOT_FOUND,
            { dockerfilePath, repoPath },
          );
        }
      }
    }

    // Read Dockerfile for security analysis
    await reportProgress('Reading Dockerfile', 30);
    const dockerfileContent = await fs.readFile(dockerfilePath, 'utf-8');

    // Prepare build arguments
    const finalBuildArgs = prepareBuildArgs(buildArgs, session as SessionWithAnalysis);

    // Analyze security
    await reportProgress('Analyzing security', 40);
    const securityWarnings = analyzeBuildSecurity(dockerfileContent, finalBuildArgs);
    if (securityWarnings.length > 0) {
      logger.warn({ warnings: securityWarnings }, 'Security warnings found in build');
    }

    // Prepare Docker build options
    const buildOptions: DockerBuildOptions = {
      dockerfile: dockerfilePath,
      buildargs: finalBuildArgs,
      ...(target !== undefined && { target }),
      ...(noCache !== undefined && { noCache }),
      ...(platform !== undefined && { platform }),
    };

    // Check for abort before starting the build
    if (abortSignal?.aborted) {
      throw new Error('Build operation cancelled before Docker build');
    }

    // Build the image
    await reportProgress('Building Docker image', 50);
    const buildResult = await dockerClient.buildImage(buildOptions);

    if (!buildResult.ok) {
      throw new DockerError(
        buildResult.error ?? 'Docker build failed',
        ErrorCodes.DOCKER_BUILD_FAILED,
        { buildOptions, dockerfilePath },
      );
    }

    const buildTime = Date.now() - startTime;

    await reportProgress('Updating session', 90);
    // Update session with build result
    const currentState = session as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState ?? {}, {
      build_result: {
        success: true,
        imageId: buildResult.value.imageId ?? '',
        tags: buildResult.value.tags || [],
        size: (buildResult.value as unknown as { size?: number }).size ?? 0,
        metadata: {
          layers: (buildResult.value as unknown as { layers?: number }).layers,
          buildTime,
          logs: buildResult.value.logs,
          securityWarnings,
        },
      },
      completed_steps: [...(currentState?.completed_steps ?? []), 'build-image'],
    });

    await sessionManager.update(sessionId, {
      workflow_state: updatedWorkflowState,
    });

    timer.end({ imageId: buildResult.value.imageId, buildTime });
    logger.info({ imageId: buildResult.value.imageId, buildTime }, 'Docker image build completed');

    await reportProgress('Build completed successfully', 100);

    return {
      success: true,
      sessionId,
      imageId: buildResult.value.imageId,
      tags: buildResult.value.tags || [],
      size: (buildResult.value as unknown as { size?: number }).size ?? 0,
      ...((buildResult.value as unknown as { layers?: number }).layers !== undefined && {
        layers: (buildResult.value as unknown as { layers: number }).layers,
      }),
      buildTime,
      logs: buildResult.value.logs,
      ...(securityWarnings.length > 0 && { securityWarnings }),
    };
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Docker image build failed');
    throw error; // Re-throw for proper error propagation
  }
}

/**
 * MCP-compatible wrapper that returns Result<T>
 * @param config - Build configuration including session ID, context, tags, etc.
 * @param logger - Logger instance for debug and info output
 * @returns Promise resolving to Result with build details or failure message
 */
export async function buildImage(
  config: BuildImageConfig,
  logger: Logger,
  context?: ToolContext,
): Promise<Result<BuildImageResult>> {
  return executeAsResult(() => buildImageInternal(config, logger, context));
}

/**
 * Build image tool instance (uses Result<T> for MCP compatibility)
 */
export const buildImageTool = {
  name: 'build-image',
  execute: (config: BuildImageConfig, logger: Logger, context?: ToolContext) =>
    buildImage(config, logger, context),
};
