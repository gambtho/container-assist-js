/**
 * Verify Deployment - MCP SDK Compatible Version
 */

import { z } from 'zod';
import { ErrorCode, DomainError } from '../../../contracts/types/index.js';
import type { MCPToolDescriptor, MCPToolContext } from '../tool-types.js';
import {
  checkDeploymentHealth,
  getPodInfo,
  getServiceEndpoints,
  analyzeIssues,
  getTargetResources,
  checkAllDeployments,
  checkAllPods,
  getAllEndpoints,
  determineOverallHealth
} from './helper';

// Input schema
const VerifyDeploymentInput = z
  .object({
    session_id: z.string().optional(),
    sessionId: z.string().optional(),
    namespace: z.string().default('default'),
    deployments: z.array(z.string()).optional(),
    services: z.array(z.string()).optional(),
    check_endpoints: z.boolean().default(true),
    checkEndpoints: z.boolean().optional(),
    check_pods: z.boolean().default(true),
    checkPods: z.boolean().optional(),
    timeout: z.number().default(60),
    min_ready_pods: z.number().default(1),
    minReadyPods: z.number().optional()
  })
  .transform((data) => ({
    sessionId: data.session_id ?? data.sessionId,
    namespace: data.namespace,
    deployments: data.deployments ?? [],
    services: data.services ?? [],
    checkEndpoints: data.check_endpoints ?? data.checkEndpoints ?? true,
    checkPods: data.check_pods ?? data.checkPods ?? true,
    timeout: data.timeout,
    minReadyPods: data.min_ready_pods ?? (data.minReadyPods || 1)
  }));

// Output schema
const VerifyDeploymentOutput = z.object({
  success: z.boolean(),
  healthy: z.boolean(),
  deployments: z.array(
    z.object({
      name: z.string(),
      ready: z.boolean(),
      replicas: z.object({
        desired: z.number(),
        current: z.number(),
        ready: z.number(),
        available: z.number().optional()
      }),
      conditions: z
        .array(
          z.object({
            type: z.string(),
            status: z.string(),
            reason: z.string().optional(),
            message: z.string().optional()
          })
        )
        .optional()
    })
  ),
  pods: z
    .array(
      z.object({
        name: z.string(),
        ready: z.boolean(),
        status: z.string(),
        restarts: z.number().optional(),
        node: z.string().optional()
      })
    )
    .optional(),
  endpoints: z
    .array(
      z.object({
        service: z.string(),
        type: z.string(),
        url: z.string().optional(),
        port: z.number().optional(),
        external: z.boolean()
      })
    )
    .optional(),
  issues: z.array(z.string()).optional(),
  metadata: z.object({
    checkTime: z.number(),
    namespace: z.string(),
    clusterVersion: z.string().optional()
  })
});

// Type aliases
export type VerifyInput = z.infer<typeof VerifyDeploymentInput>;
export type VerifyOutput = z.infer<typeof VerifyDeploymentOutput>;


/**
 * Main handler implementation
 */
const verifyDeploymentHandler: MCPToolDescriptor<VerifyInput, VerifyOutput> = {
  name: 'verify_deployment',
  description: 'Verify Kubernetes deployment health and get endpoints',
  category: 'workflow',
  inputSchema: VerifyDeploymentInput,
  outputSchema: VerifyDeploymentOutput,

  handler: async (input: VerifyInput, context: MCPToolContext): Promise<VerifyOutput> => {
    const { logger, sessionService, progressEmitter } = context;
    const { sessionId, namespace, deployments, services, checkEndpoints, checkPods, minReadyPods } =
      input;

    logger.info(
      {
        sessionId,
        namespace,
        deployments: deployments.length,
        services: services.length
      },
      'Starting deployment verification'
    );

    const startTime = Date.now();

    try {
      // Get target resources from session if not provided
      const { targetDeployments, targetServices } = await getTargetResources(
        deployments,
        services,
        sessionId,
        sessionService
      );

      if (targetDeployments.length === 0 && targetServices.length === 0) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'No deployments or services to verify');
      }

      // Emit progress
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'verify_deployment',
          status: 'in_progress',
          message: 'Checking deployment health',
          progress: 0.2
        });
      }

      // Check all deployments
      const deploymentResults = await checkAllDeployments(targetDeployments, namespace, context);

      // Check all pods if requested
      let podResults: Array<{
        name: string;
        ready: boolean;
        status: string;
        restarts?: number;
        node?: string;
      }> = [];

      if (checkPods && targetDeployments.length > 0) {
        if (progressEmitter && sessionId) {
          await progressEmitter.emit({
            sessionId,
            step: 'verify_deployment',
            status: 'in_progress',
            message: 'Checking pod status',
            progress: 0.5
          });
        }
        podResults = await checkAllPods(targetDeployments, namespace, context);
      }

      // Get all endpoints if requested
      let endpointResults: Array<{
        service: string;
        type: string;
        url?: string;
        port?: number;
        external: boolean;
      }> = [];

      if (checkEndpoints) {
        if (progressEmitter && sessionId) {
          await progressEmitter.emit({
            sessionId,
            step: 'verify_deployment',
            status: 'in_progress',
            message: 'Getting service endpoints',
            progress: 0.7
          });
        }
        endpointResults = await getAllEndpoints(targetServices, targetDeployments, namespace, context);
      }

      // Analyze issues
      const issues = analyzeIssues(deploymentResults, podResults, minReadyPods);

      // Determine overall health
      const healthy = determineOverallHealth(deploymentResults, podResults, issues);

      // Update session with verification results
      if (sessionId && sessionService) {
        await sessionService.updateAtomic(sessionId, (session) => ({
          ...session,
          workflow_state: {
            ...session.workflow_state,
            verificationResult: {
              healthy,
              deployments: deploymentResults,
              endpoints: endpointResults,
              issues,
              timestamp: new Date().toISOString()
            }
          }
        }));
      }

      // Emit completion
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'verify_deployment',
          status: healthy ? 'completed' : 'completed',
          message: healthy
            ? 'Deployment verified successfully'
            : `Deployment has ${issues.length} issues`,
          progress: 1.0
        });
      }

      const checkTime = Date.now() - startTime;

      logger.info(
        {
          healthy,
          deployments: deploymentResults.length,
          pods: podResults.length,
          endpoints: endpointResults.length,
          issues: issues.length,
          checkTime: `${checkTime}ms`
        },
        'Deployment verification completed'
      );

      // Log accessible endpoints
      const externalEndpoints = endpointResults.filter((e) => e.external);
      if (externalEndpoints.length > 0) {
        logger.info(
          {
            endpoints: externalEndpoints.map((e) => e.url).filter(Boolean)
          },
          'Application accessible at:'
        );
      }

      return {
        success: true,
        healthy,
        deployments: deploymentResults.map((d) => ({
          name: d.name,
          ready: d.ready,
          replicas: {
            desired: d.replicas.desired,
            current: d.replicas.current,
            ready: d.replicas.ready,
            available: d.replicas.available
          },
          conditions: d.conditions
        })),
        pods: podResults.length > 0 ? podResults : undefined,
        endpoints: endpointResults.length > 0 ? endpointResults : undefined,
        issues: issues.length > 0 ? issues : undefined,
        metadata: {
          checkTime,
          namespace,
          clusterVersion: undefined // Would be populated by actual K8s API
        }
      };
    } catch (error) {
      logger.error({ error }, 'Verification failed'); // Fixed logger call

      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'verify_deployment',
          status: 'failed',
          message: 'Verification failed'
        });
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  }
};

// Default export for registry
export default verifyDeploymentHandler;
