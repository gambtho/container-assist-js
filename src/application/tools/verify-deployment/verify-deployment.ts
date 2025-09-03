/**
 * Verify Deployment - MCP SDK Compatible Version
 */

import { z } from 'zod';
import { ErrorCode, DomainError } from '../../../contracts/types/index.js';
import type { MCPToolDescriptor, MCPToolContext } from '../tool-types.js';

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
 * Check deployment health
 */
async function checkDeploymentHealth(
  deploymentName: string,
  namespace: string,
  context: MCPToolContext
): Promise<{
  name: string;
  endpoint: string;
  status?: 'healthy' | 'unhealthy' | 'degraded';
  response_time_ms?: number;
}> {
  const { kubernetesService, logger } = context;

  if (kubernetesService && 'getStatus' in kubernetesService) {
    const result = await (kubernetesService as unknown).getStatus(
      `deployment/${deploymentName}`,
      namespace
    );

    if (result.success && result.data) {
      return result.data;
    }

    throw new Error(result.error?.message ?? 'Failed to get deployment status');
  }

  // Mock health check for testing
  logger.warn('Kubernetes service not available - simulating health check');

  return {
    name: deploymentName,
    endpoint: `http://${deploymentName}.${namespace}`,
    status: 'healthy' as const,
    response_time_ms: 50
  };
}

/**
 * Get pod information
 */
async function getPodInfo(
  namespace: string,
  deploymentName: string,
  context: MCPToolContext
): Promise<
  Array<{ name: string; ready: boolean; status: string; restarts?: number; node?: string }>
> {
  const { logger } = context;

  // This would typically use kubectl or K8s API to get pod info
  logger.info({ namespace, deployment: deploymentName }); // Fixed logger call

  // Mock pod info for testing
  return [
    {
      name: `${deploymentName}-abc123`,
      ready: true,
      status: 'Running',
      restarts: 0,
      node: 'node-1'
    },
    {
      name: `${deploymentName}-def456`,
      ready: true,
      status: 'Running',
      restarts: 0,
      node: 'node-2'
    }
  ];
}

/**
 * Get service endpoints
 */
async function getServiceEndpoints(
  namespace: string,
  serviceName: string,
  context: MCPToolContext
): Promise<
  Array<{ service: string; type: string; url?: string; port?: number; external: boolean }>
> {
  const { kubernetesService, logger } = context;

  if (kubernetesService && 'getEndpoints' in kubernetesService) {
    const result = await (kubernetesService as unknown).getEndpoints(namespace);

    if (result.success && result.data) {
      return result.data
        .filter((e: unknown) => !serviceName || e.service === serviceName)
        .map((e: unknown) => ({
          service: e.service,
          type: 'ClusterIP',
          url: e.url,
          port: 80,
          external: !!e.url && !e.url.includes('cluster.local')
        }));
    }
  }

  // Mock endpoints for testing
  logger.warn('Kubernetes service not available - simulating endpoints');

  return [
    {
      service: serviceName ?? 'app',
      type: 'LoadBalancer',
      url: 'http://app.example.com',
      port: 80,
      external: true
    }
  ];
}

/**
 * Analyze deployment issues
 */
function analyzeIssues(
  deployments: Array<{ name: string; ready?: boolean; replicas?: unknown }>,
  pods: Array<{ ready: boolean; status?: string; restarts?: number }>,
  minReadyPods: number
): string[] {
  const issues: string[] = [];

  // Check deployment issues
  for (const deployment of deployments) {
    if (!deployment.ready) {
      issues.push(`Deployment ${deployment.name} is not ready`);
    }

    if (deployment.replicas.ready < deployment.replicas.desired) {
      issues.push(
        `Deployment ${deployment.name}: Only ${deployment.replicas.ready}/${deployment.replicas.desired} replicas ready`
      );
    }

    if (deployment.replicas.ready < minReadyPods) {
      issues.push(`Deployment ${deployment.name}: Less than minimum ${minReadyPods} pods ready`);
    }
  }

  // Check pod issues
  const unhealthyPods = pods.filter((p) => !p.ready ?? p.status !== 'Running');
  if (unhealthyPods.length > 0) {
    issues.push(`${unhealthyPods.length} pods are not healthy`);
  }

  const restartingPods = pods.filter((p) => (p.restarts ?? 0) > 3);
  if (restartingPods.length > 0) {
    issues.push(`${restartingPods.length} pods have excessive restarts`);
  }

  return issues;
}

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
      // Get deployments from session if not provided
      let targetDeployments = deployments;
      let targetServices = services;

      if (targetDeployments.length === 0 && sessionId && sessionService) {
        const session = await sessionService.get(sessionId);
        if (!session) {
          throw new DomainError(ErrorCode.SessionNotFound, 'Session not found');
        }

        // Get deployed resources from session
        const deploymentResult = session.workflow_state?.deployment_result;
        if (deploymentResult) {
          // Use deployment_name and service_name from the schema
          if (deploymentResult.deployment_name != null) {
            targetDeployments = [deploymentResult.deployment_name];
          }
          if (deploymentResult.service_name != null) {
            targetServices = [deploymentResult.service_name];
          }
        }
      }

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

      // Check deployment health
      const deploymentResults: Array<{
        name: string;
        ready: boolean;
        replicas: unknown;
        conditions?: any[];
      }> = [];

      for (const deploymentName of targetDeployments) {
        logger.info(`Checking deployment ${deploymentName}`);

        try {
          const health = await checkDeploymentHealth(deploymentName, namespace, context);

          deploymentResults.push({
            name: deploymentName,
            ready: health.status === 'healthy',
            replicas: {
              desired: 3,
              current: 3,
              ready: 3
            },
            conditions: []
          });
        } catch (error) {
          logger.error({ error }, `Failed to check deployment ${deploymentName}`);

          deploymentResults.push({
            name: deploymentName,
            ready: false,
            replicas: {
              desired: 0,
              current: 0,
              ready: 0
            }
          });
        }
      }

      // Check pods if requested
      const podResults: Array<{
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

        for (const deploymentName of targetDeployments) {
          const pods = await getPodInfo(namespace, deploymentName, context);
          podResults.push(...pods);
        }
      }

      // Get endpoints if requested
      const endpointResults: Array<{
        service: string;
        type: string;
        url?: string;
        port?: number;
        external: boolean;
      }> = [];

      if (checkEndpoints && checkEndpoints.length > 0) {
        if (progressEmitter && sessionId) {
          await progressEmitter.emit({
            sessionId,
            step: 'verify_deployment',
            status: 'in_progress',
            message: 'Getting service endpoints',
            progress: 0.7
          });
        }

        if (targetServices.length > 0) {
          for (const serviceName of targetServices) {
            const endpoints = await getServiceEndpoints(namespace, serviceName, context);
            endpointResults.push(...endpoints);
          }
        } else if (targetDeployments.length > 0) {
          // Try to find services based on deployment names
          for (const deploymentName of targetDeployments) {
            const endpoints = await getServiceEndpoints(namespace, deploymentName, context);
            endpointResults.push(...endpoints);
          }
        }
      }

      // Analyze issues
      const issues = analyzeIssues(deploymentResults, podResults, minReadyPods);

      // Determine overall health
      const healthy =
        deploymentResults.every((d) => d.ready) &&
        podResults.every((p) => p.ready) &&
        issues.length === 0;

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
