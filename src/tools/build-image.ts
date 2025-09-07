/**
 * Builds Docker images from Dockerfiles with comprehensive logging and error handling
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createSessionManager } from '../lib/session';
import { createDockerClient } from '../lib/docker';
import { createTimer, type Logger } from '../lib/logger';
import { Success, Failure, type Result } from '../types/core';
import { updateWorkflowState, type WorkflowState } from '../types/workflow-state';
import type { DockerBuildOptions } from '../types/docker';

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
 * Build Docker image from Dockerfile with specified configuration
 * @param config - Build configuration including session ID, context, tags, etc.
 * @param logger - Logger instance for debug and info output
 * @returns Promise resolving to Result with build details or failure message
 */
export async function buildImage(
  config: BuildImageConfig,
  logger: Logger,
): Promise<Result<BuildImageResult>> {
  const timer = createTimer(logger, 'build-image');

  try {
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

    const startTime = Date.now();

    // Create lib instances
    const sessionManager = createSessionManager(logger);
    const dockerClient = createDockerClient(logger);

    // Get session
    const session = await sessionManager.get(sessionId);
    if (!session) {
      return Failure('Session not found');
    }

    // Determine paths
    const repoPath = session.repo_path ?? buildContext;
    let dockerfilePath = path.resolve(repoPath, dockerfile);

    // Check if we should use a generated Dockerfile
    const sessionState = session;
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
          dockerfilePath = path.join(repoPath, 'Dockerfile.generated');
          await fs.writeFile(dockerfilePath, dockerfileContent, 'utf-8');
          logger.info({ dockerfilePath }, 'Created Dockerfile from session content');
        } else {
          return Failure(`Dockerfile not found at ${dockerfilePath}`);
        }
      }
    }

    // Read Dockerfile for security analysis
    const dockerfileContent = await fs.readFile(dockerfilePath, 'utf-8');

    // Prepare build arguments
    const finalBuildArgs = prepareBuildArgs(buildArgs, session);

    // Analyze security
    const securityWarnings = analyzeBuildSecurity(dockerfileContent, finalBuildArgs);
    if (securityWarnings.length > 0) {
      logger.warn({ warnings: securityWarnings }, 'Security warnings found in build');
    }

    // Prepare Docker build options
    const buildOptions: DockerBuildOptions = {
      context: repoPath,
      dockerfile: dockerfilePath,
      tags: tags.length > 0 ? tags : [`${sessionId}:latest`],
      buildArgs: finalBuildArgs,
      ...(target !== undefined && { target }),
      noCache,
      ...(platform !== undefined && { platform }),
    };

    // Build the image
    const buildResult = await dockerClient.buildImage(buildOptions);

    if (!buildResult.ok) {
      return Failure(buildResult.error ?? 'Build failed');
    }

    const buildTime = Date.now() - startTime;

    // Update session with build result
    const currentState = session as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState, {
      build_result: {
        success: true,
        imageId: buildResult.value.imageId ?? '',
        tags: buildResult.value.tags,
        size: buildResult.value.size ?? 0,
        metadata: {
          layers: buildResult.value.layers,
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

    return Success({
      success: true,
      sessionId,
      imageId: buildResult.value.imageId,
      tags: buildResult.value.tags,
      size: buildResult.value.size ?? 0,
      ...(buildResult.value.layers !== undefined && { layers: buildResult.value.layers }),
      buildTime,
      logs: buildResult.value.logs,
      ...(securityWarnings.length > 0 && { securityWarnings }),
    });
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Docker image build failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Build image tool instance
 */
export const buildImageTool = {
  name: 'build-image',
  execute: (config: BuildImageConfig, logger: Logger) => buildImage(config, logger),
};
