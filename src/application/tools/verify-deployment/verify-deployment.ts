/**
 * Verify Deployment - MCP SDK Compatible Version
 */

import { ErrorCode, DomainError } from '../../../domain/types/index';
import {
  VerifyDeploymentInput,
  type VerifyDeploymentParams,
  DeploymentResultSchema,
  type DeploymentResult,
} from '../schemas';
import type { ToolDescriptor, ToolContext } from '../tool-types';
import { checkDeploymentHealth } from './helper';

// Type aliases
export type VerifyInput = VerifyDeploymentParams;
export type VerifyOutput = DeploymentResult;

/**
 * Main handler implementation
 */
const verifyDeploymentHandler: ToolDescriptor<VerifyInput, VerifyOutput> = {
  name: 'verify_deployment',
  description: 'Verify Kubernetes deployment health and get endpoints',
  category: 'workflow',
  inputSchema: VerifyDeploymentInput,
  outputSchema: DeploymentResultSchema,

  handler: async (input: VerifyInput, context: ToolContext): Promise<VerifyOutput> => {
    const logger = context.logger;
    const sessionService = context.sessionService;
    const progressEmitter = context.progressEmitter;
    const { sessionId } = input;

    logger.info({ sessionId }, 'Starting deployment verification');

    try {
      // Get session and deployment info
      if (!sessionService) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'Session service not available');
      }

      interface SessionWithWorkflowState {
        workflow_state?: {
          deployment_result?: {
            deploymentName?: string;
            deployment_name?: string;
            namespace?: string;
            serviceName?: string;
            service_name?: string;
            endpoint?: string;
          };
        };
      }

      const session = sessionService.get(sessionId) as SessionWithWorkflowState | null;
      if (!session) {
        throw new DomainError(ErrorCode.SessionNotFound, 'Session not found');
      }

      // Get deployment result from session
      const deploymentResult = session.workflow_state?.deployment_result;
      const deploymentName = deploymentResult?.deploymentName ?? deploymentResult?.deployment_name;
      if (!deploymentName) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'No deployment found in session');
      }

      // Emit progress
      if (progressEmitter) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'verify_deployment',
          status: 'in_progress',
          message: 'Verifying deployment health',
          progress: 0.5,
        });
      }

      // Check deployment health using existing helper
      const health = await checkDeploymentHealth(
        deploymentName,
        deploymentResult?.namespace ?? 'default',
        context,
      );

      const ready = health.status === 'healthy';
      const replicas = 1; // Default replica count

      // Emit completion
      if (progressEmitter) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'verify_deployment',
          status: ready ? 'completed' : 'failed',
          message: ready ? 'Deployment verified successfully' : 'Deployment verification failed',
          progress: 1.0,
        });
      }

      logger.info(
        {
          deploymentName,
          namespace: deploymentResult?.namespace ?? 'default',
          ready,
        },
        'Deployment verification completed',
      );

      return {
        success: true,
        sessionId,
        namespace: deploymentResult?.namespace ?? 'default',
        deploymentName,
        serviceName: deploymentResult?.serviceName ?? deploymentResult?.service_name ?? '',
        endpoint: deploymentResult?.endpoint ?? '',
        ready,
        replicas,
      };
    } catch (error) {
      logger.error({ error }, 'Verification failed'); // Fixed logger call

      if (progressEmitter && sessionId) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'verify_deployment',
          status: 'failed',
          message: 'Verification failed',
        });
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  },
};

// Default export for registry
export default verifyDeploymentHandler;
