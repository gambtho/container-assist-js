/**
 * Tag Image Tool - Flat Architecture
 *
 * Tags Docker images with version and registry information
 * Follows architectural requirement: only imports from src/lib/
 */

import { createSessionManager } from '../../lib/session';
import type { ExtendedToolContext } from '../shared-types';
import { createDockerClient } from '../../lib/docker';
import { createTimer, type Logger } from '../../lib/logger';
import {
  Success,
  Failure,
  type Result,
  type TagImageParams,
  type WorkflowState,
} from '../../domain/types';

export interface TagImageConfig extends TagImageParams {
  sessionId: string;
  tag: string;
}

export interface TagImageResult {
  success: boolean;
  sessionId: string;
  tags: string[];
  imageId: string;
}

/**
 * Tag Docker image using lib utilities only
 */
export async function tagImage(
  config: TagImageConfig,
  logger: Logger,
  context?: ExtendedToolContext,
): Promise<Result<TagImageResult>> {
  const timer = createTimer(logger, 'tag-image');

  try {
    const { sessionId, tag } = config;

    logger.info({ sessionId, tag }, 'Starting image tagging');

    // Create lib instances - use shared sessionManager from context if available
    const sessionManager =
      (context && 'sessionManager' in context && context.sessionManager) ||
      createSessionManager(logger);
    const dockerClient = createDockerClient(logger);

    // Get session using lib session manager
    // Get or create session
    let session = await sessionManager.get(sessionId);
    if (!session) {
      // Create new session with the specified sessionId
      session = await sessionManager.create(sessionId);
    }

    const buildResult = (session?.workflow_state as WorkflowState)?.build_result as
      | { imageId?: string }
      | undefined;

    if (!buildResult?.imageId) {
      return Failure('No built image found in session - run build_image first');
    }

    const source = buildResult.imageId;

    // Tag image using lib docker client
    // Parse repository and tag from the tag parameter
    const parts = tag.split(':');
    const repository = parts[0];
    const tagName = parts[1] || 'latest';

    if (!repository) {
      return Failure('Invalid tag format');
    }

    const tagResult = await dockerClient.tagImage(source, repository, tagName);
    if (!tagResult.ok) {
      return Failure(`Failed to tag image: ${tagResult.error ?? 'Unknown error'}`);
    }

    const tags = [tag];

    // Update session with tag information using lib session manager
    await sessionManager.update(sessionId, {
      workflow_state: {
        ...(session?.workflow_state || {}),
        build_result: {
          ...buildResult,
          tags,
        },
      },
    });

    timer.end({ source, tag });
    logger.info({ source, tag }, 'Image tagging completed');

    return Success({
      success: true,
      sessionId,
      tags,
      imageId: source,
    });
  } catch (error) {
    timer.end({ error });
    logger.error({ error }, 'Image tagging failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Tag image tool instance
 */
export const tagImageTool = {
  name: 'tag',
  execute: (config: TagImageConfig, logger: Logger, context?: ExtendedToolContext) =>
    tagImage(config, logger, context),
};
