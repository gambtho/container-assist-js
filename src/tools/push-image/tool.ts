/**
 * Push Image Tool - Standardized Implementation
 *
 * Pushes Docker images to container registries
 * Uses standardized helpers for consistency
 */

import { wrapTool } from '@mcp/tools/tool-wrapper';
import { resolveSession, updateSessionData } from '@mcp/tools/session-helpers';
// import { formatStandardResponse } from '@mcp/tools/response-formatter'; // Not used directly, wrapped by wrapTool
import type { ExtendedToolContext } from '../shared-types';
import { createDockerClient } from '../../lib/docker';
import { createTimer, type Logger } from '../../lib/logger';
import {
  Success,
  Failure,
  type Result,
  // updateWorkflowState, // Not used directly
  // type WorkflowState, // Not used directly
} from '../../domain/types';
import type { PushImageParams } from './schema';

export interface PushImageResult {
  success: boolean;
  sessionId: string;
  registry: string;
  digest: string;
  pushedTags: string[];
}

/**
 * Core push image implementation
 */
async function pushImageImpl(
  params: PushImageParams,
  context: ExtendedToolContext,
  logger: Logger,
): Promise<Result<PushImageResult>> {
  const timer = createTimer(logger, 'push-image');

  try {
    const { registry = 'docker.io' } = params;
    // const { credentials } = params; // TODO: implement credential handling

    // Resolve session (now always optional)
    const sessionResult = await resolveSession(logger, context, {
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
      defaultIdHint: 'push-image',
      createIfNotExists: true,
    });

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
    const updateResult = await updateSessionData(
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
      logger,
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
 * Wrapped push image tool with standardized behavior
 */
export const pushImageTool = wrapTool('push-image', pushImageImpl);

/**
 * Legacy export for backward compatibility during migration
 */
export const pushImage = async (
  params: PushImageParams,
  logger: Logger,
  context?: ExtendedToolContext,
): Promise<Result<PushImageResult>> => {
  return pushImageImpl(params, context || {}, logger);
};
