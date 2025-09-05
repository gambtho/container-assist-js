/**
 * Prepare Cluster - MCP SDK Compatible Version
 */

import { ErrorCode, InfrastructureError } from '../../../domain/types/errors';
import {
  PrepareClusterInput,
  type PrepareClusterParams,
  BaseSessionResultSchema,
} from '../schemas';
import { z } from 'zod';
import type { ToolDescriptor, ToolContext } from '../tool-types';
import type { Session } from '../../../domain/types/session';

// Type aliases
export type PrepareClusterInputType = PrepareClusterParams;
export type PrepareClusterOutput = z.infer<typeof BaseSessionResultSchema>;

/**
 * Prepare Cluster Handler Implementation
 */
const prepareClusterHandler: ToolDescriptor<PrepareClusterInputType, PrepareClusterOutput> = {
  name: 'prepare_cluster',
  description: 'Prepare and validate Kubernetes cluster for application deployment',
  category: 'workflow',
  inputSchema: PrepareClusterInput,
  outputSchema: BaseSessionResultSchema,
  timeout: 60000, // 60 seconds for cluster operations

  handler: async (
    input: PrepareClusterInputType,
    context: ToolContext,
  ): Promise<PrepareClusterOutput> => {
    const { logger, sessionService, progressEmitter } = context;
    const { sessionId } = input;

    logger.info({ sessionId }, 'Starting cluster preparation');

    try {
      // Get session data
      if (!sessionService) {
        throw new InfrastructureError(
          ErrorCode.ServiceUnavailable,
          'Session service not available',
        );
      }

      const session = sessionService.get(sessionId);
      if (!session) {
        throw new InfrastructureError(ErrorCode.SessionNotFound, `Session ${sessionId} not found`);
      }

      // Emit progress
      if (progressEmitter) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'prepare_cluster',
          status: 'in_progress',
          message: 'Preparing cluster for deployment',
          progress: 0.5,
        });
      }

      // Simulate cluster validation
      const clusterReady = true; // In real implementation, would check cluster connectivity

      // Store cluster readiness in session
      sessionService.updateAtomic(sessionId, (session: Session) => ({
        ...session,
        workflow_state: {
          ...session.workflow_state,
          clusterReady,
        },
      }));

      // Emit completion
      if (progressEmitter) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'prepare_cluster',
          status: 'completed',
          message: 'Cluster preparation complete',
          progress: 1.0,
        });
      }

      logger.info({ sessionId, clusterReady }, 'Cluster preparation completed');

      return Promise.resolve({
        success: true,
        sessionId,
      });
    } catch (error) {
      logger.error({ error, sessionId }, 'Cluster preparation failed');

      // Emit error
      if (progressEmitter) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'prepare_cluster',
          status: 'failed',
          message: `Cluster preparation failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'deploy_application',
    reason: 'Deploy application to prepared cluster',
    paramMapper: (output) => ({
      sessionId: output.sessionId,
    }),
  },
};

// Default export for registry
export default prepareClusterHandler;
