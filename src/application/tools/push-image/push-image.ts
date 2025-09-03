/**
 * Push Image - Main Orchestration Logic
 */

import { z } from 'zod';
import { ErrorCode, DomainError } from '../../../contracts/types/errors.js';
import type { MCPToolDescriptor, MCPToolContext } from '../tool-types.js';
import {
  authenticateRegistry,
  getImagesToPush,
  pushImagesParallel,
  pushImagesSequential,
  calculatePushTotals
} from './helper';

// Input schema with support for both snake_case and camelCase
const PushImageInput = z
  .object({
    session_id: z.string().optional(),
    sessionId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    image_tags: z.array(z.string()).optional(),
    imageTags: z.array(z.string()).optional(),
    image: z.string().optional(),
    registry: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    auth_token: z.string().optional(),
    authToken: z.string().optional(),
    retry_on_failure: z.boolean().default(true),
    retryOnFailure: z.boolean().optional(),
    parallel: z.boolean().default(false)
  })
  .transform((data) => ({
    sessionId: data.session_id ?? data.sessionId,
    tags: data.tags ?? data.image_tags ?? data.imageTags ?? (data.image ? [data.image] : []),
    registry: data.registry,
    username: data.username,
    password: data.password,
    authToken: data.auth_token ?? data.authToken,
    retryOnFailure: data.retry_on_failure ?? data.retryOnFailure ?? true,
    parallel: data.parallel
  }));

// Output schema
const PushImageOutput = z.object({
  success: z.boolean(),
  pushed: z.array(
    z.object({
      tag: z.string(),
      digest: z.string(),
      size: z.number().optional(),
      pushTime: z.number()
    })
  ),
  failed: z.array(
    z.object({
      tag: z.string(),
      error: z.string()
    })
  ),
  registry: z.string(),
  metadata: z.object({
    totalSize: z.number().optional(),
    totalPushTime: z.number(),
    timestamp: z.string()
  })
});

// Type aliases
export type PushInput = z.infer<typeof PushImageInput>;
export type PushOutput = z.infer<typeof PushImageOutput>;


/**
 * Main handler implementation
 */
const pushImageHandler: MCPToolDescriptor<PushInput, PushOutput> = {
  name: 'push_image',
  description: 'Push Docker images to container registry',
  category: 'workflow',
  inputSchema: PushImageInput,
  outputSchema: PushImageOutput,

  handler: async (input: PushInput, context: MCPToolContext): Promise<PushOutput> => {
    const { logger, sessionService, progressEmitter } = context;
    const { sessionId, tags, registry, username, password, authToken, retryOnFailure, parallel } =
      input;

    logger.info(
      {
        sessionId,
        tags: tags.length,
        registry,
        parallel
      },
      'Starting image push'
    );

    try {
      // Determine images to push using helper function
      const imagesToPush = await getImagesToPush(tags, sessionId, sessionService);
      let targetRegistry = registry;

      // Get registry from session if not provided
      if (!targetRegistry && sessionId && sessionService) {
        const session = await sessionService.get(sessionId);
        if (session?.workflow_state?.tag_result) {
          targetRegistry = session.workflow_state.tag_result.registry;
        }
      }

      if (imagesToPush.length === 0) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'No images specified for push');
      }

      if (!targetRegistry) {
        // Default to Docker Hub
        targetRegistry = 'docker.io';
        logger.info('No registry specified - using Docker Hub');
      }

      // Authenticate with registry
      const credentials: { username?: string; password?: string; authToken?: string } = {};

      if (username !== undefined) credentials.username = username;
      if (password !== undefined) credentials.password = password;
      if (authToken !== undefined) credentials.authToken = authToken;

      const authenticated = await authenticateRegistry(targetRegistry, credentials, context);

      if (!authenticated) {
        throw new DomainError(
          ErrorCode.AUTHENTICATION_ERROR,
          'Failed to authenticate with registry'
        );
      }

      // Emit progress
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'push_image',
          status: 'in_progress',
          message: `Pushing ${imagesToPush.length} images to ${targetRegistry}`,
          progress: 0.1
        });
      }

      // Setup authentication
      const auth: { username?: string; password?: string } = {};
      if (username !== undefined) auth.username = username;
      if (password !== undefined) auth.password = password;

      // Push images using helper functions
      let pushed: Array<{ tag: string; digest: string; size?: number; pushTime?: number }>;
      let failed: Array<{ tag: string; error?: string }>;

      if (parallel) {
        // Push in parallel
        const result = await pushImagesParallel(
          imagesToPush,
          targetRegistry ?? '',
          auth,
          retryOnFailure,
          context
        );
        pushed = result.pushed;
        failed = result.failed;
      } else {
        // Push sequentially with progress updates
        const progressCallback = async (i: number, tag: string) => {
          if (progressEmitter && sessionId) {
            await progressEmitter.emit({
              sessionId,
              step: 'push_image',
              status: 'in_progress',
              message: `Pushing ${tag} (${i + 1}/${imagesToPush.length})`,
              progress: 0.1 + 0.8 * (i / imagesToPush.length)
            });
          }
        };

        const result = await pushImagesSequential(
          imagesToPush,
          targetRegistry ?? '',
          auth,
          retryOnFailure,
          context,
          progressCallback
        );
        pushed = result.pushed;
        failed = result.failed;
      }

      // Calculate totals using helper function
      const { totalSize, totalPushTime } = calculatePushTotals(pushed);

      // Update session with push results
      if (sessionId && sessionService) {
        await sessionService.updateAtomic(sessionId, (session: any) => ({
          ...session,
          workflow_state: {
            ...session.workflow_state,
            pushResult: {
              pushed: pushed.map((p) => ({ tag: p.tag, digest: p.digest })),
              failed,
              registry: targetRegistry,
              timestamp: new Date().toISOString()
            }
          }
        }));
      }

      // Emit completion
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'push_image',
          status: pushed.length > 0 ? 'completed' : 'failed',
          message: `Pushed ${pushed.length}/${imagesToPush.length} images`,
          progress: 1.0
        });
      }

      // Check if any pushes succeeded
      if (pushed.length === 0) {
        throw new DomainError(
          ErrorCode.OPERATION_FAILED,
          `All ${failed.length} image pushes failed`
        );
      }

      logger.info(
        {
          pushed: pushed.length,
          failed: failed.length,
          registry: targetRegistry
        },
        'Image push completed'
      );

      return {
        success: true,
        pushed: pushed.map((p) => ({
          tag: p.tag,
          digest: p.digest,
          size: p.size,
          pushTime: p.pushTime ?? 0
        })),
        failed: failed.map((f) => ({
          tag: f.tag,
          error: f.error ?? 'Unknown error'
        })),
        registry: targetRegistry,
        metadata: {
          totalSize: totalSize > 0 ? totalSize : undefined,
          totalPushTime,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error({ error }, 'Error occurred during image push');

      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'push_image',
          status: 'failed',
          message: 'Image push failed'
        });
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'generate_k8s_manifests',
    reason: 'Generate Kubernetes manifests for deployment',
    paramMapper: (output) => ({
      image: output.pushed[0]?.tag,
      registry: output.registry
    })
  }
};

// Default export for registry
export default pushImageHandler;
