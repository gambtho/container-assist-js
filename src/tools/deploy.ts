/**
 * Deploy Application Tool - Flat Architecture
 *
 * Deploys applications to Kubernetes clusters
 * Follows architectural requirement: only imports from src/lib/
 */

import * as yaml from 'js-yaml';
import { createSessionManager } from '../lib/session';
import { createKubernetesClient } from '../lib/kubernetes';
import { createTimer, type Logger } from '../lib/logger';
import { Success, Failure, type Result } from '../types/core';
import { updateWorkflowState, type WorkflowState } from '../types/workflow-state';
import { DEFAULT_TIMEOUTS } from '../config/defaults';

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
    // Parse YAML documents (supports multi-document YAML)
    const documents = yaml.loadAll(content);
    return documents.filter((doc) => doc !== null && doc !== undefined);
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
  context?: import('../mcp/server-extensions.js').ToolContext,
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

    // Enhanced progress tracking
    await context?.progressUpdater?.(5, 'Initializing deployment...');

    // Create lib instances
    const sessionManager = createSessionManager(logger);
    const k8sClient = createKubernetesClient(logger);

    // Get session
    await context?.progressUpdater?.(10, 'Loading session data...');
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
    await context?.progressUpdater?.(20, 'Parsing Kubernetes manifests...');
    const manifests = parseManifest(k8sManifests.manifests);
    if (manifests.length === 0) {
      return Failure('No valid manifests found');
    }

    // Order manifests for deployment
    await context?.progressUpdater?.(25, 'Ordering manifests for deployment...');
    const orderedManifests = orderManifests(manifests);

    logger.info({ manifestCount: orderedManifests.length, dryRun }, 'Deploying manifests');
    await context?.progressUpdater?.(
      30,
      `Deploying ${orderedManifests.length} manifests...`,
      orderedManifests.length,
    );

    // Deploy manifests
    const deployedResources: Array<{ kind: string; name: string; namespace: string }> = [];

    if (!dryRun) {
      for (let i = 0; i < orderedManifests.length; i++) {
        const manifest = orderedManifests[i];
        await context?.progressUpdater?.(
          30 + ((i + 1) * 30) / orderedManifests.length,
          `Deploying ${(manifest as any)?.kind || 'resource'} ${i + 1}/${orderedManifests.length}...`,
        );
        try {
          const manifestObj = manifest as {
            kind?: string;
            metadata?: { name?: string; namespace?: string };
          };
          // Apply manifest using K8s client
          const applyResult = await k8sClient.applyManifest(manifest, namespace);
          if (!applyResult.ok) {
            logger.warn(
              {
                kind: manifestObj.kind,
                name: manifestObj.metadata?.name,
                error: applyResult.error,
              },
              'Failed to apply manifest',
            );
            continue;
          }

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

    // Wait for deployment to be ready
    let ready = false;
    let readyReplicas = 0;
    const totalReplicas = deployment?.spec?.replicas ?? 1;

    if (wait && !dryRun) {
      // Wait for deployment with configurable retry delay
      await context?.progressUpdater?.(70, `Waiting for ${deploymentName} to be ready...`);
      const startTime = Date.now();
      const retryDelay = DEFAULT_TIMEOUTS.deploymentPoll || 5000;
      while (Date.now() - startTime < timeout * 1000) {
        // Check deployment status
        const elapsedTime = Date.now() - startTime;
        const progressPercent = Math.min(70 + (elapsedTime / (timeout * 1000)) * 25, 95);
        await context?.progressUpdater?.(
          progressPercent,
          `Checking deployment status... (${Math.round(elapsedTime / 1000)}s elapsed)`,
        );

        const statusResult = await k8sClient.getDeploymentStatus(namespace, deploymentName);
        if (statusResult.ok && statusResult.value?.ready) {
          ready = true;
          readyReplicas = statusResult.value?.readyReplicas || 0;
          await context?.progressUpdater?.(95, 'Deployment is ready!');
          break;
        }
        // Wait before checking again using configured delay
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    } else if (dryRun) {
      // For dry runs, mark as ready
      ready = true;
      readyReplicas = totalReplicas;
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
    const updatedWorkflowState = updateWorkflowState(currentState ?? {}, {
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

    await context?.progressUpdater?.(100, 'Deployment complete');
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
 * Deploy application tool instance
 */
export const deployApplicationTool = {
  name: 'deploy',
  execute: (
    config: DeployApplicationConfig,
    logger: Logger,
    context?: import('../mcp/server-extensions.js').ToolContext,
  ) => deployApplication(config, logger, context),
};
