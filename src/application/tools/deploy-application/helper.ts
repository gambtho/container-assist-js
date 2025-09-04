/**
 * Deploy Application - Helper Functions
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { KubernetesManifest, KubernetesDeploymentResult } from '../../../domain/types/index';

export type { KubernetesDeploymentResult };
import type { ToolContext } from '../tool-types';
import type { KubernetesService } from '../../services/interfaces';
import {
  KubernetesServiceResponse,
  isKubernetesServiceResponse,
} from '../../../domain/types/workflow-state';

export type DeployInput = {
  sessionId?: string | undefined;
  namespace?: string | undefined;
  wait?: boolean | undefined;
  timeout?: string | number | undefined;
  dryRun?: boolean | undefined;
};

/**
 * Load manifests from directory
 */
export async function loadManifests(manifestsPath: string): Promise<KubernetesManifest[]> {
  const manifests: KubernetesManifest[] = [];

  const files = await fs.readdir(manifestsPath);
  const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

  for (const file of yamlFiles) {
    if (file === 'kustomization.yaml') continue; // Skip kustomization file

    const filepath = path.join(manifestsPath, file);
    const content = await fs.readFile(filepath, 'utf-8');

    try {
      // Parse YAML (supports both single and multi-document files)
      const docs = yaml.loadAll(content) as KubernetesManifest[];
      manifests.push(
        ...docs.filter(
          (d: KubernetesManifest | null): d is KubernetesManifest =>
            d != null && typeof d === 'object' && 'kind' in d,
        ),
      ); // Filter out null/invalid docs
    } catch (error) {
      // Try JSON as fallback
      try {
        const jsonDoc = JSON.parse(content) as KubernetesManifest;
        if (jsonDoc && typeof jsonDoc === 'object' && 'kind' in jsonDoc) {
          manifests.push(jsonDoc);
        }
      } catch {
        throw new Error(`Failed to parse ${file}: ${String(error)}`);
      }
    }
  }

  return manifests;
}

/**
 * Order manifests for deployment (dependencies first)
 */
export function orderManifests(manifests: KubernetesManifest[]): KubernetesManifest[] {
  const order = [
    'Namespace',
    'ResourceQuota',
    'LimitRange',
    'ServiceAccount',
    'Secret',
    'ConfigMap',
    'PersistentVolumeClaim',
    'Service',
    'Deployment',
    'StatefulSet',
    'DaemonSet',
    'Job',
    'CronJob',
    'HorizontalPodAutoscaler',
    'PodDisruptionBudget',
    'Ingress',
    'NetworkPolicy',
  ];

  return manifests.sort((a, b) => {
    const aIndex = order.indexOf(a.kind) !== -1 ? order.indexOf(a.kind) : 999;
    const bIndex = order.indexOf(b.kind) !== -1 ? order.indexOf(b.kind) : 999;
    return aIndex - bIndex;
  });
}

/**
 * Deploy manifests to cluster
 */
export async function deployToCluster(
  manifests: KubernetesManifest[],
  input: DeployInput,
  context: ToolContext,
): Promise<KubernetesDeploymentResult> {
  const kubernetesService = context.kubernetesService as KubernetesService;
  const { logger } = context;

  if (kubernetesService && 'deploy' in kubernetesService) {
    // Type commented out to avoid unused declaration
    // deploy: (config: {
    //   manifests: KubernetesManifest[];
    //   namespace: string;
    //   wait: boolean;
    //   timeout: number;
    //   dryRun: boolean;
    // }) => Promise<KubernetesServiceResponse>;

    // Use input parameters with fallback to defaults
    const namespace = input.namespace ?? 'default';
    const wait = input.wait ?? true;
    const dryRun = input.dryRun ?? false;

    // Convert timeout to number if it's a string, with fallback to default
    let timeout = 300 * 1000; // Default: 300 seconds in milliseconds
    if (input.timeout !== undefined) {
      if (typeof input.timeout === 'string') {
        const parsed = parseInt(input.timeout, 10);
        if (!isNaN(parsed)) {
          timeout = parsed * 1000; // Convert seconds to milliseconds
        }
      } else if (typeof input.timeout === 'number') {
        timeout = input.timeout * 1000; // Convert seconds to milliseconds
      }
    }

    const k8sService = kubernetesService as any;
    const serviceResponse = await k8sService.deploy({
      manifests,
      namespace,
      wait,
      timeout,
      dryRun,
    });

    if (
      isKubernetesServiceResponse(serviceResponse) &&
      serviceResponse.success &&
      serviceResponse.data
    ) {
      return serviceResponse.data as KubernetesDeploymentResult;
    }

    throw new Error(serviceResponse.error ?? 'Deployment failed');
  }

  // Mock deployment for testing
  logger.warn('Kubernetes service not available, simulating deployment');

  // Use same fallback logic for mock deployment
  const namespace = input.namespace ?? 'default';

  return {
    success: true,
    resources: manifests.map((m) => ({
      kind: m.kind,
      name: m.metadata.name,
      namespace,
      status: 'created' as const,
    })),
    deployed: manifests.map((m) => `${m.kind}/${m.metadata.name}`),
    failed: [],
    endpoints: [
      {
        service: manifests.find((m) => m.kind === 'Service')?.metadata.name ?? 'app',
        type: 'ClusterIP',
        port: 80,
      },
    ],
  };
}

/**
 * Perform rollback on failure
 */
export async function rollbackDeployment(
  deployed: string[],
  namespace: string,
  context: ToolContext,
): Promise<void> {
  const kubernetesService = context.kubernetesService as KubernetesService;
  const { logger } = context;

  type KubernetesServiceWithDelete = {
    delete: (resource: string, namespace: string) => Promise<void>;
  };

  logger.info({ resources: deployed.length }, 'Starting rollback');

  if (kubernetesService) {
    // Create a copy and reverse it to avoid mutation
    const resourcesToRollback = [...deployed].reverse();

    for (const resource of resourcesToRollback) {
      // Delete in reverse order
      try {
        if ('delete' in kubernetesService) {
          await (kubernetesService as KubernetesServiceWithDelete).delete(resource, namespace);
        }
        logger.info(`Rolled back ${resource}`);
      } catch (error) {
        logger.error({ error }, `Failed to rollback ${resource}`);
      }
    }
  }
}

/**
 * Wait for deployment to be ready
 */
export async function waitForDeployment(
  deploymentName: string,
  namespace: string,
  timeout: number,
  context: ToolContext,
): Promise<boolean> {
  const kubernetesService = context.kubernetesService as KubernetesService;
  const { logger } = context;
  const startTime = Date.now();

  if (!kubernetesService) {
    return true; // Skip in test mode
  }

  type KubernetesServiceWithStatus = {
    getStatus: (resource: string, namespace: string) => Promise<KubernetesServiceResponse>;
  };

  while (Date.now() - startTime < timeout * 1000) {
    if ('getStatus' in kubernetesService) {
      const k8sService = kubernetesService as KubernetesServiceWithStatus;
      const statusResponse = await k8sService.getStatus(`deployment/${deploymentName}`, namespace);

      if (
        isKubernetesServiceResponse(statusResponse) &&
        statusResponse.success &&
        statusResponse.data
      ) {
        const statusData = statusResponse.data as { ready?: boolean };
        if (statusData.ready) {
          return true;
        }
      }
    }

    logger.info(
      {
        deployment: deploymentName,
        elapsed: Math.round((Date.now() - startTime) / 1000),
      },
      'Waiting for deployment to be ready',
    );

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return false;
}

/**
 * Get target manifests path from session
 */
export async function getTargetPath(
  manifestsPath: string | undefined,
  sessionId: string | undefined,
  sessionService: unknown,
): Promise<string> {
  let targetPath = manifestsPath;

  if (!targetPath && sessionId && sessionService) {
    type SessionService = { get: (id: string) => Promise<unknown> };
    const sessionResult = await (sessionService as SessionService).get(sessionId);
    if (!sessionResult) {
      throw new Error('Session not found');
    }

    const session = sessionResult as { workflow_state?: { k8s_result?: { output_path?: string } } };
    targetPath = session.workflow_state?.k8s_result?.output_path;
  }

  if (!targetPath) {
    throw new Error('No manifests path specified');
  }

  return targetPath;
}

/**
 * Check if path exists
 */
export async function validatePath(targetPath: string): Promise<void> {
  try {
    await fs.access(targetPath);
  } catch {
    throw new Error(`Manifests path not found: ${targetPath}`);
  }
}

/**
 * Wait for all deployments to be ready
 */
export async function waitForAllDeployments(
  deploymentResult: KubernetesDeploymentResult,
  input: DeployInput,
  context: ToolContext,
  progressEmitter: unknown,
  sessionId: string | undefined,
): Promise<void> {
  type ProgressEmitter = {
    emit: (progress: {
      sessionId: string;
      step: string;
      status: string;
      message: string;
      progress?: number;
    }) => Promise<void>;
  };
  // Use same fallback logic as deployToCluster
  const wait = input.wait ?? true;
  const dryRun = input.dryRun ?? false;
  const namespace = input.namespace ?? 'default';

  // Convert timeout to number if it's a string, with fallback to default
  let timeout = 300; // Default: 300 seconds
  if (input.timeout !== undefined) {
    if (typeof input.timeout === 'string') {
      const parsed = parseInt(input.timeout, 10);
      if (!isNaN(parsed)) {
        timeout = parsed;
      }
    } else if (typeof input.timeout === 'number') {
      timeout = input.timeout;
    }
  }

  if (!wait || dryRun || deploymentResult.deployed.length === 0) {
    return;
  }

  const deployments = deploymentResult.deployed.filter((d) => d.startsWith('Deployment/'));

  for (const deployment of deployments) {
    const deploymentName = deployment.split('/')[1];
    if (!deploymentName) continue;

    if (progressEmitter && sessionId) {
      await (progressEmitter as ProgressEmitter).emit({
        sessionId,
        step: 'deploy_application',
        status: 'in_progress',
        message: `Waiting for ${deploymentName} to be ready`,
        progress: 0.6,
      });
    }

    const ready = await waitForDeployment(deploymentName, namespace, timeout, context);

    if (!ready) {
      const { logger } = context;
      logger.warn(`Deployment ${deploymentName} not ready after ${timeout}s`);
    }
  }
}

/**
 * Get service endpoints
 */
export async function getEndpoints(
  deploymentResult: KubernetesDeploymentResult,
  namespace: string,
  kubernetesService: unknown,
  dryRun: boolean,
): Promise<
  | Array<{
      name?: string;
      service?: string;
      url?: string;
      type: 'service' | 'ingress' | 'route' | 'ClusterIP' | 'NodePort' | 'LoadBalancer';
      port?: number;
    }>
  | undefined
> {
  let endpoints = deploymentResult.endpoints;

  if (
    !endpoints &&
    kubernetesService &&
    typeof kubernetesService === 'object' &&
    kubernetesService !== null &&
    'getEndpoints' in kubernetesService &&
    !dryRun
  ) {
    type KubernetesServiceWithEndpoints = {
      getEndpoints: (namespace: string) => Promise<KubernetesServiceResponse>;
    };

    const k8sService = kubernetesService as KubernetesServiceWithEndpoints;
    const endpointResponse = await k8sService.getEndpoints(namespace);

    if (
      isKubernetesServiceResponse(endpointResponse) &&
      endpointResponse.success &&
      endpointResponse.data
    ) {
      const endpointData = endpointResponse.data as Array<{ service: string; url?: string }>;
      endpoints = endpointData.map((e) => {
        const endpoint: {
          name?: string;
          service?: string;
          url?: string;
          type: 'service' | 'ingress' | 'route' | 'ClusterIP' | 'NodePort' | 'LoadBalancer';
          port?: number;
        } = {
          type: 'ClusterIP' as const,
        };
        if (e.service) {
          endpoint.service = e.service;
          endpoint.name = e.service; // Use service name as endpoint name
        }
        if (e.url) {
          endpoint.url = e.url;
        }
        endpoint.port = 80; // Default port
        return endpoint;
      });
    }
  }

  return endpoints;
}
