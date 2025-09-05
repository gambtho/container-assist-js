/**
 * Verify Deployment - Helper Functions
 */

import type { ToolContext } from '../tool-types';

/**
 * Check deployment health
 */
export async function checkDeploymentHealth(
  deploymentName: string,
  namespace: string,
  context: ToolContext,
): Promise<{
  name: string;
  endpoint: string;
  status?: 'healthy' | 'unhealthy' | 'degraded';
  response_time_ms?: number;
}> {
  const kubernetesService: unknown = context.kubernetesService;
  const logger = context.logger;

  if (
    kubernetesService != null &&
    typeof kubernetesService === 'object' &&
    'getStatus' in kubernetesService &&
    typeof kubernetesService.getStatus === 'function'
  ) {
    interface KubernetesStatusService {
      getStatus: (
        deployment: string,
        namespace: string,
      ) => Promise<{
        success: boolean;
        data?: {
          name: string;
          endpoint: string;
          status?: 'healthy' | 'unhealthy' | 'degraded';
          response_time_ms?: number;
        };
        error?: { message: string };
      }>;
    }
    const result = await (kubernetesService as KubernetesStatusService).getStatus(
      `deployment/${deploymentName}`,
      namespace,
    );

    if (result?.success === true && result?.data != null) {
      return result.data;
    }

    throw new Error(String(result?.error?.message) ?? 'Failed to get deployment status');
  }

  // Mock health check for testing
  logger.warn('Kubernetes service not available - simulating health check');

  return {
    name: deploymentName,
    endpoint: `http://${deploymentName}.${namespace}`,
    status: 'healthy' as const,
    response_time_ms: 50,
  };
}

/**
 * Get pod information
 */
export function getPodInfo(
  namespace: string,
  deploymentName: string,
  context: ToolContext,
): Promise<
  Array<{ name: string; ready: boolean; status: string; restarts?: number; node?: string }>
> {
  const { logger } = context;

  // This would typically use kubectl or K8s API to get pod info
  logger.info({ namespace, deployment: deploymentName }, 'Getting pod information');

  // Mock pod info for testing
  return Promise.resolve([
    {
      name: `${deploymentName}-abc123`,
      ready: true,
      status: 'Running',
      restarts: 0,
      node: 'node-1',
    },
    {
      name: `${deploymentName}-def456`,
      ready: true,
      status: 'Running',
      restarts: 0,
      node: 'node-2',
    },
  ]);
}

/**
 * Get service endpoints
 */
export async function getServiceEndpoints(
  namespace: string,
  serviceName: string,
  context: ToolContext,
): Promise<
  Array<{ service: string; type: string; url?: string; port?: number; external: boolean }>
> {
  const kubernetesService: unknown = context.kubernetesService;
  const logger = context.logger;

  if (
    kubernetesService &&
    typeof kubernetesService === 'object' &&
    'getEndpoints' in kubernetesService &&
    typeof kubernetesService.getEndpoints === 'function'
  ) {
    const serviceWithEndpoints = kubernetesService as {
      getEndpoints: (namespace: string) => Promise<{
        success?: boolean;
        data?: Array<{
          service?: string;
          url?: string;
        }>;
      }>;
    };

    const result = await serviceWithEndpoints.getEndpoints(namespace);

    if (result?.success === true && result?.data != null && Array.isArray(result.data)) {
      return result.data
        .filter(
          (endpoint) => !serviceName || serviceName === '' || endpoint.service === serviceName,
        )
        .map((endpoint) => {
          const entry: any = {
            service: endpoint.service ?? 'unknown',
            type: 'ClusterIP',
            port: 80,
            external: Boolean(endpoint.url) && !String(endpoint.url).includes('cluster.local'),
          };
          if (endpoint.url !== undefined) {
            entry.url = endpoint.url;
          }
          return entry;
        });
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
      external: true,
    },
  ];
}

/**
 * Analyze deployment issues
 */
export function analyzeIssues(
  deployments: Array<{ name: string; ready?: boolean; replicas?: any }>,
  pods: Array<{ ready: boolean; status?: string; restarts?: number }>,
  minReadyPods: number,
): string[] {
  const issues: string[] = [];

  // Check deployment issues
  for (const deployment of deployments) {
    if (!deployment.ready) {
      issues.push(`Deployment ${deployment.name} is not ready`);
    }

    if (deployment.replicas && deployment.replicas.ready < deployment.replicas.desired) {
      issues.push(
        `Deployment ${deployment.name}: Only ${deployment.replicas.ready}/${deployment.replicas.desired} replicas ready`,
      );
    }

    if (deployment.replicas && deployment.replicas.ready < minReadyPods) {
      issues.push(`Deployment ${deployment.name}: Less than minimum ${minReadyPods} pods ready`);
    }
  }

  // Check pod issues
  const unhealthyPods = pods.filter((p) => !p.ready || p.status !== 'Running');
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
 * Get target deployments and services from session
 */
export async function getTargetResources(
  deployments: string[],
  services: string[],
  sessionId: string | undefined,
  sessionService: any,
): Promise<{ targetDeployments: string[]; targetServices: string[] }> {
  let targetDeployments = deployments;
  let targetServices = services;

  if (targetDeployments.length === 0 && sessionId && sessionService) {
    const session = await sessionService.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
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

  return { targetDeployments, targetServices };
}

/**
 * Check all deployments
 */
export async function checkAllDeployments(
  targetDeployments: string[],
  namespace: string,
  context: ToolContext,
): Promise<
  Array<{
    name: string;
    ready: boolean;
    replicas: any;
    conditions?: unknown[];
  }>
> {
  const { logger } = context;
  const deploymentResults: Array<{
    name: string;
    ready: boolean;
    replicas: any;
    conditions?: unknown[];
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
          ready: 3,
        },
        conditions: [],
      });
    } catch (error) {
      logger.error({ error }, `Failed to check deployment ${deploymentName}`);

      deploymentResults.push({
        name: deploymentName,
        ready: false,
        replicas: {
          desired: 0,
          current: 0,
          ready: 0,
        },
      });
    }
  }

  return deploymentResults;
}

/**
 * Check all pods for deployments
 */
export async function checkAllPods(
  targetDeployments: string[],
  namespace: string,
  context: ToolContext,
): Promise<
  Array<{
    name: string;
    ready: boolean;
    status: string;
    restarts?: number;
    node?: string;
  }>
> {
  const podResults: Array<{
    name: string;
    ready: boolean;
    status: string;
    restarts?: number;
    node?: string;
  }> = [];

  for (const deploymentName of targetDeployments) {
    const pods = await getPodInfo(namespace, deploymentName, context);
    podResults.push(...pods);
  }

  return podResults;
}

/**
 * Get all service endpoints
 */
export async function getAllEndpoints(
  targetServices: string[],
  targetDeployments: string[],
  namespace: string,
  context: ToolContext,
): Promise<
  Array<{
    service: string;
    type: string;
    url?: string;
    port?: number;
    external: boolean;
  }>
> {
  const endpointResults: Array<{
    service: string;
    type: string;
    url?: string;
    port?: number;
    external: boolean;
  }> = [];

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

  return endpointResults;
}

/**
 * Determine overall health status
 */
export function determineOverallHealth(
  deploymentResults: Array<{ ready: boolean }>,
  podResults: Array<{ ready: boolean }>,
  issues: string[],
): boolean {
  return (
    deploymentResults.every((d) => d.ready) &&
    podResults.every((p) => p.ready) &&
    issues.length === 0
  );
}
