/**
 * Tag Image Tool - Standardized Implementation
 *
 * Tags Docker images with version and registry information
 * Uses standardized helpers for consistency
 */

import { wrapTool } from '@mcp/tools/tool-wrapper';
import { resolveSession, updateSessionData } from '@mcp/tools/session-helpers';
// import { formatStandardResponse } from '@mcp/tools/response-formatter'; // Not used directly, wrapped by wrapTool
import type { ExtendedToolContext } from '../shared-types';
import { createDockerClient } from '../../lib/docker';
import { createTimer, type Logger } from '../../lib/logger';
import { Success, Failure, type Result } from '../../domain/types';
import type { TagImageParams } from './schema';

export interface TagImageResult {
  success: boolean;
  sessionId: string;
  tags: string[];
  imageId: string;
}

/**
 * Core tag image implementation
 */
async function tagImageImpl(
  params: TagImageParams,
  context: ExtendedToolContext,
  logger: Logger,
): Promise<Result<TagImageResult>> {
  const timer = createTimer(logger, 'tag-image');

  try {
    const { tag } = params;

    if (!tag) {
      return Failure('Tag parameter is required');
    }

    // Resolve session (now always optional)
    const sessionResult = await resolveSession(logger, context, {
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
      defaultIdHint: 'tag-image',
      createIfNotExists: true,
    });

    if (!sessionResult.ok) {
      return Failure(sessionResult.error);
    }

    const { id: sessionId, state: session } = sessionResult.value;
    logger.info({ sessionId, tag }, 'Starting image tagging');

    const dockerClient = createDockerClient(logger);

    // Check for built image in session or use provided imageId
    const buildResult = (session as any)?.build_result;
    const source = params.imageId || buildResult?.imageId;

    if (!source) {
      return Failure(
        'No image specified. Provide imageId parameter or ensure session has built image from build-image tool.',
      );
    }

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

    // Update session with tag information using standardized helper
    const updateResult = await updateSessionData(
      sessionId,
      {
        build_result: {
          ...(buildResult || {}),
          imageId: source,
          tags,
        },
        completed_steps: [...(session.completed_steps || []), 'tag'],
      },
      logger,
      context,
    );

    if (!updateResult.ok) {
      logger.warn({ error: updateResult.error }, 'Failed to update session, but tagging succeeded');
    }

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
 * Wrapped tag image tool with standardized behavior
 */
export const tagImageTool = wrapTool('tag-image', tagImageImpl);

/**
 * Legacy export for backward compatibility during migration
 */
export const tagImage = async (
  params: TagImageParams,
  logger: Logger,
  context?: ExtendedToolContext,
): Promise<Result<TagImageResult>> => {
  return tagImageImpl(params, context || {}, logger);
};
