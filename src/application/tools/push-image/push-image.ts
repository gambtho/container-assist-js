/**
 * Push Image - MCP SDK Compatible Version
 */

import { z } from 'zod';
import { ErrorCode, DomainError } from '../../../domain/types/errors';
import { PushImageInput, type PushImageParams, BaseSessionResultSchema } from '../schemas';
import type { ToolDescriptor, ToolContext } from '../tool-types';
import type { Session } from '../../../domain/types/session';
import { authenticateRegistry, pushImage } from './helper';

// Type aliases
export type PushInput = PushImageParams;
export type PushOutput = z.infer<typeof BaseSessionResultSchema> & { registry?: string };

// Helper functions are now imported from ./helper.js

/**
 * Main handler implementation
 */
const pushImageHandler: ToolDescriptor<PushInput, PushOutput> = {
  name: 'push_image',
  description: 'Push Docker images to container registry',
  category: 'workflow',
  inputSchema: PushImageInput,
  outputSchema: BaseSessionResultSchema.extend({ registry: z.string().optional() }),

  handler: async (input: PushInput, context: ToolContext): Promise<PushOutput> => {
    const { logger, sessionService, progressEmitter } = context;
    const { sessionId, registry } = input;

    logger.info({ sessionId, registry }, 'Starting image push');

    try {
      // Get session and image info
      if (!sessionService) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'Session service not available');
      }

      const session = sessionService.get(sessionId);
      if (!session) {
        throw new DomainError(ErrorCode.SessionNotFound, 'Session not found');
      }

      // Get build result from session
      const buildResult = session.workflow_state?.build_result;
      if (!buildResult?.tags || buildResult.tags.length === 0) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'No tagged images found in session');
      }

      const targetRegistry = registry ?? 'docker.io';
      const imagesToPush = buildResult.tags;

      // Emit progress
      if (progressEmitter) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'push_image',
          status: 'in_progress',
          message: `Pushing ${imagesToPush.length} images to ${targetRegistry}`,
          progress: 0.5,
        });
      }

      // Authenticate and push images using helper functions
      const credentials = {};
      const authenticated = authenticateRegistry(targetRegistry, credentials, context);

      if (!authenticated) {
        throw new DomainError(
          ErrorCode.AUTHENTICATION_ERROR,
          'Failed to authenticate with registry',
        );
      }

      // Push first image (simplified for consolidated schema)
      const firstTag = imagesToPush[0];
      if (!firstTag) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'No image tags to push');
      }

      const result = await pushImage(firstTag, targetRegistry, credentials, context);
      logger.info({ tag: firstTag, digest: result.digest }, 'Successfully pushed image');

      // Update session with push results
      sessionService.updateAtomic(sessionId, (session: Session) => ({
        ...session,
        workflow_state: {
          ...session.workflow_state,
          pushResult: {
            pushed: [{ tag: firstTag, digest: result.digest }],
            registry: targetRegistry,
            timestamp: new Date().toISOString(),
          },
        },
      }));

      // Emit completion
      if (progressEmitter) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'push_image',
          status: 'completed',
          message: `Successfully pushed image to ${targetRegistry}`,
          progress: 1.0,
        });
      }

      logger.info(
        {
          tag: firstTag,
          registry: targetRegistry,
        },
        'Image push completed',
      );

      return {
        success: true,
        sessionId,
        registry: targetRegistry,
      };
    } catch (error) {
      logger.error({ error }, 'Image push failed');

      if (progressEmitter) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'push_image',
          status: 'failed',
          message: `Image push failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'generate_k8s_manifests',
    reason: 'Generate Kubernetes manifests for deployment',
    paramMapper: (output) => ({
      registry: output.registry,
    }),
  },
};

// Default export for registry
export default pushImageHandler;
