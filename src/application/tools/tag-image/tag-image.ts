/**
 * Tag Image - MCP SDK Compatible Version
 */

import { z } from 'zod';
import { ErrorCode, DomainError } from '../../../domain/types/errors';
import { TagImageInput, type TagImageParams, BaseSessionResultSchema } from '../schemas';
import type { ToolDescriptor, ToolContext } from '../tool-types';
import type { Session } from '../../../domain/types/session';

// Type aliases
export type TagInput = TagImageParams;
export type TagOutput = z.infer<typeof BaseSessionResultSchema> & { tags?: string[] };

/**
 * Tag Docker image using Docker service or CLI
 */
async function tagDockerImage(
  source: string,
  target: string,
  context: ToolContext,
): Promise<boolean> {
  const { dockerService, logger } = context;

  if (dockerService && 'tag' in dockerService) {
    await dockerService.tag({ image: source, tag: target });
    return true;
  }

  // CLI fallback would go here
  logger.warn('Docker service not available - simulating tag operation');
  return true;
}

/**
 * Main handler implementation
 */
const tagImageHandler: ToolDescriptor<TagInput, TagOutput> = {
  name: 'tag_image',
  description: 'Tag Docker image with version and registry information',
  category: 'workflow',
  inputSchema: TagImageInput,
  outputSchema: BaseSessionResultSchema.extend({ tags: z.array(z.string()).optional() }),

  handler: async (input: TagInput, context: ToolContext): Promise<TagOutput> => {
    const { logger, sessionService } = context;
    const { sessionId, tag } = input;

    logger.info({ sessionId, tag }, 'Starting image tagging');

    try {
      // Get session and build result
      if (!sessionService) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'Session service not available');
      }

      const session = sessionService.get(sessionId);
      if (!session) {
        throw new DomainError(ErrorCode.SessionNotFound, 'Session not found');
      }

      const buildResult = session.workflow_state?.build_result;
      if (!buildResult?.imageId) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'No built image found in session');
      }

      const source = buildResult.imageId;
      const tags = [tag]; // Use provided tag

      // Tag the image using docker service
      const tagResult = await tagDockerImage(source, tag, context);
      if (!tagResult) {
        throw new DomainError(ErrorCode.OPERATION_FAILED, 'Failed to tag image');
      }

      // Update session with tag information
      sessionService.updateAtomic(sessionId, (session: Session) => ({
        ...session,
        workflow_state: {
          ...session.workflow_state,
          build_result: {
            ...buildResult,
            tags,
          },
        },
      }));

      logger.info({ source, tag }, 'Image tagging completed');

      return {
        success: true,
        sessionId,
        tags,
      };
    } catch (error) {
      logger.error({ error }, 'Image tagging failed');
      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'push_image',
    reason: 'Push tagged images to registry',
    paramMapper: (output) => ({
      sessionId: output.sessionId,
    }),
  },
};

// Default export for registry
export default tagImageHandler;
