/**
 * Build Image - MCP SDK Compatible Version
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { DockerBuildOptions } from '../../../domain/types/index';
import { executeWithRetry } from '../error-recovery';
import { ValidationError, NotFoundError } from '../../../errors/index';
import type { Session } from '../../../domain/types/session';
import type { SessionService } from '../../services/interfaces';
import {
  BuildImageInput as BuildImageInputSchema,
  BuildResultSchema,
  BuildImageParams,
  BuildResult,
} from '../schemas';
import type { ToolDescriptor, ToolContext } from '../tool-types';
import { fileExists } from '../utils';
import { prepareBuildArgs, buildDockerImage, analyzeBuildSecurity } from './helper';

const BuildImageInput = BuildImageInputSchema;
const BuildImageOutput = BuildResultSchema;

// Type aliases
export type BuildInput = BuildImageParams;
export type BuildOutput = BuildResult;

// Helper functions are now imported from ./helper.js

/**
 * Main handler implementation
 */
const buildImageHandler: ToolDescriptor<BuildInput, BuildOutput> = {
  name: 'build_image',
  description: 'Build Docker image from Dockerfile with progress tracking',
  category: 'workflow',
  inputSchema: BuildImageInput,
  outputSchema: BuildImageOutput,

  handler: async (input: BuildInput, context: ToolContext): Promise<BuildOutput> => {
    const logger = context.logger;
    const sessionService = context.sessionService as SessionService;
    const { progressEmitter } = context;
    const {
      sessionId,
      context: buildContext,
      dockerfile,
      tags,
      buildArgs,
      target,
      noCache,
      platform,
    } = input;

    // Progress tracking handled via progressEmitter

    logger.info(
      {
        sessionId,
        context: buildContext,
        dockerfile,
        tags,
        noCache,
      },
      'Starting Docker image build',
    );

    const startTime = Date.now();

    try {
      // Validate session
      if (!sessionService) {
        throw new ValidationError('Session service not available', ['sessionService']);
      }

      const sessionResult = await sessionService.get(sessionId);
      if (!sessionResult) {
        throw new NotFoundError('Session not found', 'session', sessionId);
      }

      const session = sessionResult;

      // Determine paths
      const repoPath = session.repo_path ?? buildContext;
      let dockerfilePath = path.isAbsolute(dockerfile)
        ? dockerfile
        : path.join(repoPath, dockerfile);

      // Check if we should use a generated Dockerfile
      const generatedPath = session.workflow_state?.dockerfile_result?.path;

      if (!(await fileExists(dockerfilePath))) {
        // If the specified Dockerfile doesn't exist, check for generated one
        if (generatedPath && (await fileExists(generatedPath))) {
          dockerfilePath = generatedPath;
          logger.info(
            {
              generatedPath,
              originalPath: dockerfile,
            },
            'Using generated Dockerfile',
          );
        } else {
          throw new NotFoundError(
            `Dockerfile not found: ${dockerfilePath}`,
            'dockerfile',
            dockerfilePath,
          );
        }
      } else if (generatedPath && (await fileExists(generatedPath))) {
        // If both exist, prefer the generated one if it's newer
        dockerfilePath = generatedPath;
        logger.info(
          {
            generatedPath,
            originalPath: dockerfile,
          },
          'Using generated Dockerfile instead of original',
        );
      }

      // Read Dockerfile for analysis
      const dockerfileContent = await fs.readFile(dockerfilePath, 'utf-8');

      // Analyze for security issues
      const warnings = analyzeBuildSecurity(dockerfileContent, buildArgs ?? {});
      if (warnings.length > 0) {
        logger.warn({ warnings }); // Fixed logger call
      }

      // Prepare tags
      const projectName = (session.metadata?.projectName as string) ?? path.basename(repoPath);
      const imageTags = tags && tags.length > 0 ? tags : [`${projectName}:latest`];

      // Add registry prefix if specified
      const fullTags = input.registry
        ? imageTags.map((tag) => `${input.registry}/${tag}`)
        : imageTags;

      // Report progress using callback (fallback to progressEmitter for compatibility)
      if (progressEmitter && sessionId) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'build_image',
          status: 'in_progress',
          message: 'Preparing Docker build',
          progress: 0.1,
          metadata: { sessionId, dockerfile: dockerfilePath },
        });
      }

      // Prepare build options
      const buildOptions: DockerBuildOptions = {
        context: path.resolve(repoPath),
        dockerfile: path.relative(path.resolve(repoPath), dockerfilePath),
        tags: fullTags,
        buildArgs: prepareBuildArgs(buildArgs ?? {}, session),
        ...(target && { target }),
        noCache,
        ...(platform && { platform }),
      };

      logger.info(buildOptions as unknown, 'Executing Docker build');

      // Report build start
      if (progressEmitter && sessionId) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'build_image',
          status: 'in_progress',
          message: 'Building Docker image',
          progress: 0.3,
          metadata: { sessionId, tags: fullTags, context: buildOptions.context },
        });
      }

      // Build the image with retry logic
      const buildResult = await executeWithRetry(
        async () => {
          return await buildDockerImage(buildOptions, context);
        },
        { maxAttempts: 2 },
      );

      // Report build progress
      if (progressEmitter && sessionId) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'build_image',
          status: 'in_progress',
          message: 'Finalizing image',
          progress: 0.9,
          metadata: { sessionId, imageId: buildResult.imageId },
        });
      }

      // Calculate build time
      const buildTime = Date.now() - startTime;

      // Parse base image from Dockerfile
      const baseImageMatch = dockerfileContent.match(/^FROM\s+([^\s]+)/m);
      const baseImage = baseImageMatch ? baseImageMatch[1] : 'unknown';

      // Update session with build result
      await sessionService.updateAtomic(sessionId, (session: Session) => ({
        ...session,
        workflow_state: {
          ...session.workflow_state,
          build_result: {
            imageId: buildResult.imageId ?? '',
            tag: buildResult.tags?.[0] ?? '',
            tags: buildResult.tags ?? [],
            size: buildResult.size ?? 0,
            layers: Array.isArray(buildResult.layers)
              ? buildResult.layers.length
              : (buildResult.layers ?? 0),
            buildTime,
            logs: buildResult.logs ?? [],
            success: buildResult.success ?? true,
          },
        },
      }));

      // Push to registry if requested
      const dockerService = context.dockerService;
      if (input.push && input.registry && dockerService && fullTags) {
        logger.info({ registry: input.registry }, 'Pushing to registry');

        for (const tag of fullTags) {
          if (dockerService && 'push' in dockerService) {
            await (
              dockerService as {
                push: (options: { image: string; registry: string }) => Promise<void>;
              }
            ).push({
              image: tag,
              registry: input.registry,
            });
          }
        }
      }

      // Report completion
      if (progressEmitter && sessionId) {
        progressEmitter.emit('progress', {
          step: 'build_image',
          status: 'completed',
          message: 'Docker image built successfully',
          progress: 1.0,
          metadata: {
            sessionId,
            imageId: buildResult.imageId,
            tags: buildResult.tags,
            buildTime,
            size: buildResult.size,
          },
        });
      }

      logger.info(
        {
          imageId: buildResult.imageId,
          tags: buildResult.tags,
          buildTime: `${buildTime}ms`,
        },
        'Docker image built successfully',
      );

      return {
        success: true,
        sessionId,
        imageId: buildResult.imageId ?? '',
        tags: buildResult.tags ?? [],
        size: buildResult.size ?? 0,
        layers: buildResult.layers ?? 0,
        buildTime,
        digest: buildResult.imageId ?? '',
        warnings: warnings.length > 0 ? warnings : undefined,
        metadata: {
          baseImage,
          platform: platform ?? 'linux/amd64',
          dockerfile: dockerfilePath,
          context: buildContext,
          cached: !noCache,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Docker build error');

      if (progressEmitter && sessionId) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'build_image',
          status: 'failed',
          message: 'Docker build failed',
          progress: 0,
        });
      }

      // Re-throw to let the caller handle it
      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'scan_image',
    reason: 'Scan built image for vulnerabilities',
    paramMapper: (output) => ({
      image_id: output.imageId,
      image_tag: output.tags[0],
    }),
  },
};

// Default export for registry
export default buildImageHandler;
