/**
 * Verify Deployment - MCP SDK Compatible Version
 */

import { ErrorCode, DomainError } from '../../../contracts/types/index.js';
import {
  VerifyDeploymentInput,
  type VerifyDeploymentParams,
  DeploymentResultSchema,
  type DeploymentResult,
} from '../schemas.js';
import type { ToolDescriptor, ToolContext } from '../tool-types.js';
import { checkDeploymentHealth } from './helper.js';

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
    const { logger, sessionService, progressEmitter } = context;
    const { sessionId } = input;

    logger.info({ sessionId }, 'Starting deployment verification');

    try {
      // Get session and deployment info
      if (!sessionService) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'Session service not available');
      }

      const session = await sessionService.get(sessionId);
      if (!session) {
        throw new DomainError(ErrorCode.SessionNotFound, 'Session not found');
      }

      // Get deployment result from session
      const deploymentResult = session.workflow_state?.deployment_result;
      if (!deploymentResult?.deploymentName) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'No deployment found in session');
      }

      // Emit progress
      if (progressEmitter) {
        await progressEmitter.emit({
          sessionId,
          step: 'verify_deployment',
          status: 'in_progress',
          message: 'Verifying deployment health',
          progress: 0.5,
        });
      }

      // Check deployment health using existing helper
      const health = await checkDeploymentHealth(
        deploymentResult.deploymentName,
        deploymentResult.namespace,
        context,
      );

      const ready = health.status === 'healthy';
      const replicas = 1; // Default to 1 for now

      // Emit completion
      if (progressEmitter) {
        await progressEmitter.emit({
          sessionId,
          step: 'verify_deployment',
          status: ready ? 'completed' : 'failed',
          message: ready ? 'Deployment verified successfully' : 'Deployment verification failed',
          progress: 1.0,
        });
      }

      logger.info(
        {
          deploymentName: deploymentResult.deploymentName,
          namespace: deploymentResult.namespace,
          ready,
        },
        'Deployment verification completed',
      );

      return {
        success: true,
        sessionId,
        namespace: deploymentResult.namespace,
        deploymentName: deploymentResult.deploymentName,
        serviceName: deploymentResult.serviceName,
        endpoint: deploymentResult.endpoint,
        ready,
        replicas,
      };
    } catch (error) {
      logger.error({ error }, 'Verification failed'); // Fixed logger call

      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
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
