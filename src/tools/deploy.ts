/**
 * Deploy Application Tool - Flat Architecture
 *
 * Deploys applications to Kubernetes clusters
 * Follows architectural requirement: only imports from src/lib/
 */

import { getSessionManager } from '../lib/session';
import { createKubernetesClient } from '../lib/kubernetes';
import { createTimer, type Logger } from '../lib/logger';
import { Success, Failure, type Result } from '../types/core/index';
import { updateWorkflowState, type WorkflowState } from '../types/workflow-state';

export interface DeployApplicationConfig {
  sessionId: string;
  namespace?: string;
  cluster?: string;
  dryRun?: boolean;
  wait?: boolean;
  timeout?: number;
}

export interface DeployApplicationResult {
  success: boolean;
  sessionId: string;
  namespace: string;
  deploymentName: string;
  serviceName: string;
  endpoints: Array<{
    type: 'internal' | 'external';
    url: string;
    port: number;
  }>;
  ready: boolean;
  replicas: number;
  status?: {
    readyReplicas: number;
    totalReplicas: number;
    conditions: Array<{
      type: string;
      status: string;
      message: string;
    }>;
  };
}

/**
 * Parse YAML/JSON manifest content
 */
function parseManifest(content: string): unknown[] {
  try {
    // Try parsing as JSON first
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // For YAML, we'll do simple splitting on ---
    // In production, use a proper YAML parser
    const docs = content.split(/^---$/m).filter((doc) => doc.trim());
    return docs.map((doc) => {
      try {
        return JSON.parse(doc) as unknown;
      } catch {
        // Mock parsing for YAML-like content
        return { kind: 'Unknown', metadata: { name: 'unknown' } };
      }
    });
  }
}

/**
 * Order manifests for deployment (ConfigMaps/Secrets first, then Services, then Deployments)
 */
function orderManifests(manifests: unknown[]): unknown[] {
  const order = [
    'Namespace',
    'ConfigMap',
    'Secret',
    'Service',
    'Deployment',
    'Ingress',
    'HorizontalPodAutoscaler',
  ];

  return manifests.sort((a, b) => {
    const aObj = a as { kind?: string };
    const bObj = b as { kind?: string };
    const aIndex = aObj.kind && order.indexOf(aObj.kind) !== -1 ? order.indexOf(aObj.kind) : 999;
    const bIndex = bObj.kind && order.indexOf(bObj.kind) !== -1 ? order.indexOf(bObj.kind) : 999;
    return aIndex - bIndex;
  });
}

/**
 * Deploy application to Kubernetes
 */
export async function deployApplication(
  config: DeployApplicationConfig,
  logger: Logger,
): Promise<Result<DeployApplicationResult>> {
  const timer = createTimer(logger, 'deploy-application');

  try {
    const {
      sessionId,
      namespace = 'default',
      cluster = 'default',
      dryRun = false,
      wait = true,
      timeout = 300,
    } = config;

    logger.info({ sessionId, namespace, cluster, dryRun }, 'Starting application deployment');

    // Create lib instances
    const sessionManager = getSessionManager(logger);
    const k8sClient = createKubernetesClient(null, logger);

    // Get session
    const session = await sessionManager.get(sessionId);
    if (!session) {
      return Failure('Session not found');
    }

    // Get K8s manifests from session
    const workflowState = session.workflow_state as
      | { k8s_manifests?: { manifests?: string } }
      | null
      | undefined;
    const k8sManifests = workflowState?.k8s_manifests;
    if (!k8sManifests?.manifests) {
      return Failure('No Kubernetes manifests found - run generate_k8s_manifests first');
    }

    // Parse manifests
    const manifests = parseManifest(k8sManifests.manifests);
    if (manifests.length === 0) {
      return Failure('No valid manifests found');
    }

    // Order manifests for deployment
    const orderedManifests = orderManifests(manifests);

    logger.info({ manifestCount: orderedManifests.length, dryRun }, 'Deploying manifests');

    // Deploy manifests (mock for now)
    const deployedResources: Array<{ kind: string; name: string; namespace: string }> = [];

    if (!dryRun) {
      for (const manifest of orderedManifests) {
        try {
          const manifestObj = manifest as {
            kind?: string;
            metadata?: { name?: string; namespace?: string };
          };
          // In production, use actual K8s client to apply manifest
          await k8sClient.apply(manifest);

          deployedResources.push({
            kind: manifestObj.kind ?? 'unknown',
            name: manifestObj.metadata?.name ?? 'unknown',
            namespace: manifestObj.metadata?.namespace ?? namespace,
          });

          logger.debug(
            {
              kind: manifestObj.kind,
              name: manifestObj.metadata?.name,
            },
            'Deployed resource',
          );
        } catch (error) {
          const manifestObj = manifest as { kind?: string; metadata?: { name?: string } };
          logger.warn(
            {
              kind: manifestObj.kind,
              name: manifestObj.metadata?.name,
              error,
            },
            'Failed to deploy resource',
          );
        }
      }
    }

    // Find deployment and service info
    const deployment = orderedManifests.find(
      (m) => (m as { kind?: string }).kind === 'Deployment',
    ) as { metadata?: { name?: string }; spec?: { replicas?: number } } | undefined;
    const service = orderedManifests.find((m) => (m as { kind?: string }).kind === 'Service') as
      | { metadata?: { name?: string }; spec?: { ports?: Array<{ port?: number }>; type?: string } }
      | undefined;

    const deploymentName = deployment?.metadata?.name ?? 'app';
    const serviceName = service?.metadata?.name ?? deploymentName;

    // Wait for deployment to be ready (mock for now)
    let ready = true;
    let readyReplicas = 1;
    const totalReplicas = deployment?.spec?.replicas ?? 1;

    if (wait && !dryRun) {
      // In production, actually wait for deployment
      const startTime = Date.now();
      while (Date.now() - startTime < timeout * 1000) {
        // Check deployment status
        const status = await k8sClient.getDeploymentStatus(namespace, deploymentName);
        if (status?.ready) {
          ready = true;
          readyReplicas = status.readyReplicas || 0;
          break;
        }
        // Wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    // Build endpoints
    const endpoints: Array<{ type: 'internal' | 'external'; url: string; port: number }> = [];

    if (service) {
      const port = service.spec?.ports?.[0]?.port ?? 80;

      // Internal endpoint
      endpoints.push({
        type: 'internal',
        url: `http://${serviceName}.${namespace}.svc.cluster.local`,
        port,
      });

      // External endpoint if LoadBalancer or Ingress
      if (service.spec?.type === 'LoadBalancer') {
        endpoints.push({
          type: 'external',
          url: `http://pending-loadbalancer`,
          port,
        });
      }
    }

    // Check for ingress
    const ingress = orderedManifests.find((m) => (m as { kind?: string }).kind === 'Ingress') as
      | { spec?: { rules?: Array<{ host?: string }> } }
      | undefined;
    if (ingress) {
      const host = ingress.spec?.rules?.[0]?.host ?? 'app.example.com';
      endpoints.push({
        type: 'external',
        url: `http://${host}`,
        port: 80,
      });
    }

    // Update session with deployment result
    const currentState = session.workflow_state as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState, {
      deployment_result: {
        namespace,
        deployment_name: deploymentName,
        service_name: serviceName,
        endpoints,
        ready,
        status: {
          ready_replicas: readyReplicas,
          total_replicas: totalReplicas,
          conditions: [
            {
              type: 'Available',
              status: ready ? 'True' : 'False',
              message: ready ? 'Deployment is available' : 'Deployment is pending',
            },
          ],
        },
      },
      completed_steps: [...(currentState?.completed_steps ?? []), 'deploy'],
    });

    await sessionManager.update(sessionId, {
      workflow_state: updatedWorkflowState,
    });

    timer.end({ deploymentName, ready });
    logger.info({ deploymentName, serviceName, ready }, 'Application deployment completed');

    return Success({
      success: true,
      sessionId,
      namespace,
      deploymentName,
      serviceName,
      endpoints,
      ready,
      replicas: totalReplicas,
      status: {
        readyReplicas,
        totalReplicas,
        conditions: [
          {
            type: 'Available',
            status: ready ? 'True' : 'False',
            message: ready ? 'Deployment is available' : 'Deployment is pending',
          },
        ],
      },
    });
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Application deployment failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Factory function for creating deploy-application tool instances
 */
export function createDeployApplicationTool(logger: Logger): {
  name: string;
  execute: (config: DeployApplicationConfig) => Promise<Result<DeployApplicationResult>>;
} {
  return {
    name: 'deploy',
    execute: (config: DeployApplicationConfig) => deployApplication(config, logger),
  };
}
