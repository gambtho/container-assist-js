/**
 * Push Image Tool - Standardized Implementation
 *
 * Pushes Docker images to container registries
 * Uses standardized helpers for consistency
 */

import { getSession, updateSession } from '@mcp/tools/session-helpers';
// Removed wrapTool - using direct implementation
import type { ToolContext } from '../../mcp/context/types';
import { createDockerClient } from '../../lib/docker';
import { createTimer, createLogger } from '../../lib/logger';
import {
  Success,
  Failure,
  type Result,
  // updateWorkflowState, // Not used directly
  // type WorkflowState, // Not used directly
} from '../../domain/types';
import { z } from 'zod';

// Schema definition (consolidated from schema.ts)
export const pushImageSchema = z.object({
  sessionId: z.string().optional().describe('Session identifier for tracking operations'),
  imageId: z.string().optional().describe('Docker image ID to push'),
  registry: z.string().optional().describe('Target registry URL'),
  credentials: z
    .object({
      username: z.string(),
      password: z.string(),
    })
    .optional()
    .describe('Registry credentials'),
});

export type PushImageParams = z.infer<typeof pushImageSchema>;

export interface PushImageResult {
  success: boolean;
  sessionId: string;
  registry: string;
  digest: string;
  pushedTags: string[];
}

/**
 * Push image implementation - direct execution without wrapper
 */
async function pushImageImpl(
  params: PushImageParams,
  context: ToolContext,
): Promise<Result<PushImageResult>> {
  // Basic parameter validation (essential validation only)
  if (!params || typeof params !== 'object') {
    return Failure('Invalid parameters provided');
  }
  const logger = context.logger || createLogger({ name: 'push-image' });
  const timer = createTimer(logger, 'push-image');

  try {
    const { registry = 'docker.io' } = params;

    // Resolve session (now always optional)
    const sessionResult = await getSession(params.sessionId, context);

    if (!sessionResult.ok) {
      return Failure(sessionResult.error);
    }

    const { id: sessionId, state: session } = sessionResult.value;
    logger.info({ sessionId, registry }, 'Starting image push');

    const dockerClient = createDockerClient(logger);

    // Check for tagged images in session
    const buildResult = (session as any)?.build_result;
    const imageTag = params.imageId || buildResult?.tags?.[0];

    if (!imageTag) {
      return Failure(
        'No image specified. Provide imageId parameter or ensure session has tagged images from tag-image tool.',
      );
    }

    logger.info({ imageTag, registry }, 'Pushing image to registry');

    // Push image using lib docker client
    // Extract repository and tag from imageTag
    const parts = imageTag.split(':');
    const repository = parts[0];
    const tag = parts[1] || 'latest';

    if (!repository) {
      return Failure('Invalid image tag format');
    }

    const pushResult = await dockerClient.pushImage(repository, tag);

    if (!pushResult.ok) {
      return Failure(`Failed to push image: ${pushResult.error ?? 'Unknown error'}`);
    }

    const { digest } = pushResult.value;

    // Update session with push results using standardized helper
    const updateResult = await updateSession(
      sessionId,
      {
        completed_steps: [...(session.completed_steps || []), 'push'],
        metadata: {
          ...session.metadata,
          pushResult: {
            registry,
            digest,
            pushedTags: [imageTag],
            timestamp: new Date().toISOString(),
          },
        },
      },
      context,
    );

    if (!updateResult.ok) {
      logger.warn({ error: updateResult.error }, 'Failed to update session, but push succeeded');
    }

    timer.end({
      imageTag,
      registry,
      digest,
    });

    logger.info(
      {
        imageTag,
        registry,
        digest,
      },
      'Image push completed',
    );

    return Success({
      success: true,
      sessionId,
      registry,
      digest,
      pushedTags: [imageTag],
    });
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Image push failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Push image tool
 */
export const pushImage = pushImageImpl;

/**
 * Default export
 */
export default pushImage;
