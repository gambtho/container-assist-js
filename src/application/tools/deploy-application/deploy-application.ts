/**
 * Deploy Application - MCP SDK Compatible Version
 */

import { ErrorCode, DomainError } from '../../../domain/types/index';
import {
  DeployApplicationInput,
  type DeployApplicationParams,
  DeploymentResultSchema,
  type DeploymentResult,
} from '../schemas';
import type { Session } from '../../../domain/types/session';
import type { ToolDescriptor, ToolContext } from '../tool-types';
import type { SessionService } from '../../services/interfaces';
import { loadManifests, orderManifests, deployToCluster } from './helper';

// Type aliases
export type DeployInput = DeployApplicationParams;
export type DeployOutput = DeploymentResult;

/**
 * Main handler implementation
 */
const deployApplicationHandler: ToolDescriptor<DeployInput, DeployOutput> = {
  name: 'deploy_application',
  description: 'Deploy application to Kubernetes cluster',
  category: 'workflow',
  inputSchema: DeployApplicationInput,
  outputSchema: DeploymentResultSchema,

  handler: async (input: DeployInput, context: ToolContext): Promise<DeployOutput> => {
    const contextServices = context;
    const logger = contextServices.logger;
    const sessionService = contextServices.sessionService as SessionService;
    const progressEmitter = contextServices.progressEmitter;

    type ProgressEmitter = {
      emit: (progress: {
        sessionId: string;
        step: string;
        status: string;
        message: string;
        progress?: number;
      }) => Promise<void>;
    };
    const { sessionId } = input;

    // Validate sessionId early
    if (!sessionId || sessionId.trim() === '') {
      const errorMessage = 'sessionId is required';
      logger.error({ sessionId }, errorMessage);
      throw new DomainError(ErrorCode.VALIDATION_ERROR, errorMessage);
    }

    logger.info({ sessionId }, 'Starting application deployment');

    try {
      // Get session and manifests info
      if (!sessionService) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'Session service not available');
      }

      const sessionResult = await sessionService.get(sessionId);
      const session = sessionResult as Session;
      if (!session) {
        throw new DomainError(ErrorCode.SessionNotFound, 'Session not found');
      }

      // Get manifests from session
      const k8sResult = session.workflow_state?.k8s_result;
      if (!k8sResult?.output_path) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'No K8s manifests found in session');
      }

      const targetPath = k8sResult.output_path;

      // Emit progress
      if (progressEmitter) {
        await (progressEmitter as unknown as ProgressEmitter).emit({
          sessionId,
          step: 'deploy_application',
          status: 'in_progress',
          message: 'Deploying application to cluster',
          progress: 0.5,
        });
      }

      // Load and deploy manifests
      const manifests = await loadManifests(targetPath);
      if (manifests.length === 0) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'No valid manifests found');
      }

      const orderedManifests = orderManifests(manifests);

      const deploymentResult = await deployToCluster(orderedManifests, input, context);

      if (!deploymentResult) {
        throw new DomainError(ErrorCode.OPERATION_FAILED, 'Deployment failed');
      }

      // Extract deployment info - use first service and deployment
      const services = manifests.filter((m) => m.kind === 'Service');
      const deployments = manifests.filter((m) => m.kind === 'Deployment');

      const deploymentName = deployments[0]?.metadata.name ?? 'app';
      const serviceName = services[0]?.metadata.name ?? deploymentName;
      const namespace = input.namespace ?? 'default';
      const ready = true; // Simplified for consolidated schema
      const replicas = 1;

      // Update session with deployment info
      await sessionService.updateAtomic(sessionId, (currentSession: Session) => {
        const updatedSession: Session = {
          ...currentSession,
          workflow_state: {
            ...currentSession.workflow_state,
            deployment_result: {
              namespace,
              deployment_name: deploymentName,
              service_name: serviceName,
              endpoints: (deploymentResult.endpoints ?? []).map((e) => ({
                type: 'internal' as const,
                url: e.url ?? 'http://unknown',
                port: e.port ?? 80,
              })),
              ready,
              status: {
                ready_replicas: ready ? 1 : 0,
                total_replicas: 1,
                conditions: [
                  {
                    type: 'Available',
                    status: ready ? 'True' : 'False',
                    message: ready ? 'Deployment is available' : 'Deployment is pending',
                  },
                ],
              },
            },
            completed_steps: [
              ...(currentSession.workflow_state?.completed_steps ?? []),
              'deploy_application',
            ],
          },
        };
        return updatedSession;
      });

      // Emit completion
      if (progressEmitter) {
        await (progressEmitter as unknown as ProgressEmitter).emit({
          sessionId,
          step: 'deploy_application',
          status: 'completed',
          message: `Successfully deployed ${deploymentName}`,
          progress: 1.0,
        });
      }

      logger.info(
        {
          deploymentName,
          serviceName,
          namespace,
        },
        'Deployment completed',
      );

      return {
        success: true,
        sessionId,
        namespace,
        deploymentName,
        serviceName,
        endpoint: deploymentResult.endpoints?.[0]?.url,
        ready,
        replicas,
      };
    } catch (error) {
      logger.error({ error }, 'Deployment failed');

      if (progressEmitter) {
        await (progressEmitter as unknown as ProgressEmitter).emit({
          sessionId,
          step: 'deploy_application',
          status: 'failed',
          message: 'Deployment failed',
        });
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'verify_deployment',
    reason: 'Verify deployment health and get endpoints',
    paramMapper: (output: DeployOutput) => ({
      sessionId: output.sessionId,
    }),
  },
};

// Default export for registry
export default deployApplicationHandler;
