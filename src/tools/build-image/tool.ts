/**
 * Builds Docker images from Dockerfiles with comprehensive logging and error handling
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createSessionManager } from '@lib/session';
import { createDockerClient } from '@lib/docker';
import { createTimer, type Logger } from '@lib/logger';
import { updateWorkflowState, type WorkflowState, type Result } from '@types';
import { createToolProgressReporter } from '@mcp/server/progress';
import type { ToolContext } from '@tools/types';
import {
  DockerError,
  FileSystemError,
  SessionError,
  ErrorCodes,
  executeAsResult,
} from '@lib/errors';
// Local type for Docker build options
interface DockerBuildOptions {
  dockerfile?: string;
  t?: string;
  buildargs?: Record<string, string>;
  platform?: string;
}

export interface BuildImageConfig {
  sessionId: string;
  context?: string;
  dockerfile?: string;
  tags?: string[];
  buildArgs?: Record<string, string>;
  target?: string;
  noCache?: boolean;
  platform?: string;
}

export interface BuildImageResult {
  success: boolean;
  sessionId: string;
  imageId: string;
  tags: string[];
  size: number;
  layers?: number;
  buildTime: number;
  logs: string[];
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
function prepareBuildArgs(
  buildArgs: Record<string, string> = {},
  session: unknown,
): Record<string, string> {
  const defaults: Record<string, string> = {
    NODE_ENV: process.env.NODE_ENV ?? 'production',
    BUILD_DATE: new Date().toISOString(),
    VCS_REF: process.env.GIT_COMMIT ?? 'unknown',
  };

  // Add session-specific args if available
  const sessionObj = session as
    | {
        workflow_state?: {
          analysis_result?: { language?: string; framework?: string };
        };
      }
    | null
    | undefined;
  const analysisResult = sessionObj?.workflow_state?.analysis_result;
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
    await reportProgress(0, 'Initializing build process');
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

    await reportProgress(10, 'Validating parameters');

    const startTime = Date.now();

    // Check for abort signal early
    if (abortSignal?.aborted) {
      throw new Error('Build operation cancelled');
    }

    // Use sessionManager from context or create new one
    const sessionManager = context?.sessionManager || createSessionManager(logger);
    const dockerClient = createDockerClient(logger);

    // Get or create session
    await reportProgress(20, 'Loading session');
    const session = sessionId ? await sessionManager.get(sessionId) : await sessionManager.create();
    if (!session) {
      throw new SessionError(`Session ${sessionId} not found`, ErrorCodes.SESSION_NOT_FOUND, {
        sessionId,
      });
    }

    // Determine paths
    const sessionState = session as any;
    const repoPath = sessionState.repo_path ?? buildContext;
    let dockerfilePath = path.resolve(repoPath, dockerfile);

    // Check if we should use a generated Dockerfile
    const generatedPath = sessionState.dockerfile_result?.path;

    if (!(await fileExists(dockerfilePath))) {
      // If the specified Dockerfile doesn't exist, check for generated one
      if (generatedPath && (await fileExists(generatedPath))) {
        dockerfilePath = generatedPath;
        logger.info({ generatedPath, originalPath: dockerfile }, 'Using generated Dockerfile');
      } else {
        // Check if we have Dockerfile content in session
        const dockerfileContent = sessionState.dockerfile_result?.content;
        if (dockerfileContent) {
          // Write the Dockerfile content to generated file
          dockerfilePath = path.join(repoPath as string, 'Dockerfile.generated');
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
    await reportProgress(30, 'Reading Dockerfile');
    const dockerfileContent = await fs.readFile(dockerfilePath, 'utf-8');

    // Prepare build arguments
    const finalBuildArgs = prepareBuildArgs(buildArgs, session);

    // Analyze security
    await reportProgress(40, 'Analyzing security');
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
    await reportProgress(50, 'Building Docker image');
    const buildResult = await dockerClient.buildImage(buildOptions);

    if (!buildResult.ok) {
      throw new DockerError(
        buildResult.error ?? 'Docker build failed',
        ErrorCodes.DOCKER_BUILD_FAILED,
        { buildOptions, dockerfilePath },
      );
    }

    const buildTime = Date.now() - startTime;

    await reportProgress(90, 'Updating session');
    // Update session with build result
    const currentState = session as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState ?? {}, {
      build_result: {
        success: true,
        imageId: buildResult.value.imageId ?? '',
        tags: buildResult.value.tags || [],
        size: (buildResult.value as any).size ?? 0,
        metadata: {
          layers: (buildResult.value as any).layers,
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

    await reportProgress(100, 'Build completed successfully');

    return {
      success: true,
      sessionId,
      imageId: buildResult.value.imageId,
      tags: buildResult.value.tags || [],
      size: (buildResult.value as any).size ?? 0,
      ...((buildResult.value as any).layers !== undefined && {
        layers: (buildResult.value as any).layers,
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
  execute: (config: BuildImageConfig, logger: Logger, context?: any) =>
    buildImage(config, logger, context),
};
