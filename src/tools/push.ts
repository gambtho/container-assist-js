/**
 * Push Image Tool - Flat Architecture
 *
 * Pushes Docker images to container registries
 * Follows architectural requirement: only imports from src/lib/
 */

import { createSessionManager } from '../lib/session';
import { createDockerClient } from '../lib/docker';
import { createTimer, type Logger } from '../lib/logger';
import { Success, Failure, type Result } from '../types/core/index';
import { updateWorkflowState, type WorkflowState } from '../types/workflow-state';

export interface PushImageConfig {
  sessionId: string;
  registry?: string;
  username?: string;
  password?: string;
}

export interface PushImageResult {
  success: boolean;
  sessionId: string;
  registry: string;
  digest: string;
  pushedTags: string[];
}

/**
 * Push Docker image to registry using lib utilities only
 */
export async function pushImage(
  config: PushImageConfig,
  logger: Logger,
): Promise<Result<PushImageResult>> {
  const timer = createTimer(logger, 'push-image');

  try {
    const { sessionId, registry = 'docker.io' } = config;

    logger.info({ sessionId, registry }, 'Starting image push');

    // Create lib instances
    const sessionManager = createSessionManager(logger);
    const dockerClient = createDockerClient(logger);

    // Get session using lib session manager
    const session = await sessionManager.get(sessionId);
    if (!session) {
      return Failure('Session not found');
    }

    const workflowState = session.workflow_state as
      | { build_result?: { tags?: string[] } }
      | null
      | undefined;
    const buildResult = workflowState?.build_result;

    if (!buildResult?.tags || buildResult.tags.length === 0) {
      return Failure('No tagged images found in session - run tag_image first');
    }

    // Get the first tag to push
    const imageTag = buildResult.tags[0];
    if (!imageTag) {
      return Failure('No image tags available to push');
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

    // Update session with push results
    const currentState = session.workflow_state as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState, {
      completed_steps: [...(currentState?.completed_steps ?? []), 'push'],
      metadata: {
        ...(currentState?.metadata ?? {}),
        pushResult: {
          registry,
          digest,
          pushedTags: [imageTag],
          timestamp: new Date().toISOString(),
        },
      },
    });

    await sessionManager.update(sessionId, {
      workflow_state: updatedWorkflowState,
    });

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
 * Push image tool instance
 */
export const pushImageTool = {
  name: 'push',
  execute: (config: PushImageConfig, logger: Logger) => pushImage(config, logger),
};
