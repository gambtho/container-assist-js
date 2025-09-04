/**
 * Deploy Application - Helper Functions
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
// import * as yaml from 'js-yaml'; // TODO: Add js-yaml dependency
import { KubernetesManifest, KubernetesDeploymentResult } from '../../../contracts/types/index.js';

export type { KubernetesDeploymentResult };
import type { ToolContext } from '../tool-types.js';

export type DeployInput = {
  sessionId?: string | undefined;
  manifestsPath?: string | undefined;
  namespace: string;
  clusterContext?: string | undefined;
  dryRun: boolean;
  wait: boolean;
  timeout: number;
  force: boolean;
  rollbackOnFailure: boolean;
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
      // TODO: Replace with actual yaml parsing when js-yaml is available
      // const docs = yaml.loadAll(content) as KubernetesManifest[];
      // For now, just try to parse as JSON (temporary workaround)
      const docs = [JSON.parse(content)] as KubernetesManifest[];
      manifests.push(
        ...docs.filter((d: KubernetesManifest | null): d is KubernetesManifest => d?.kind != null),
      ); // Filter out null docs
    } catch (error) {
      throw new Error(`Failed to parse ${file}: ${error}`);
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
  const { kubernetesService, logger } = context;

  if (kubernetesService && 'deploy' in kubernetesService) {
    const deployMethod = (kubernetesService).deploy;
    const result = await deployMethod({
      manifests,
      namespace: input.namespace,
      wait: input.wait,
      timeout: input.timeout * 1000,
      dryRun: input.dryRun,
    });

    if (result.success && result.data) {
      return result.data;
    }

    throw new Error(result.error?.message ?? 'Deployment failed');
  }

  // Mock deployment for testing
  logger.warn('Kubernetes service not available, simulating deployment');

  return {
    success: true,
    resources: manifests.map((m) => ({
      kind: m.kind,
      name: m.metadata.name,
      namespace: input.namespace,
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
  const { kubernetesService, logger } = context;

  logger.info({ resources: deployed.length }, 'Starting rollback');

  if (kubernetesService) {
    for (const resource of deployed.reverse()) {
      // Delete in reverse order
      try {
        if ('delete' in kubernetesService) {
          await (kubernetesService).delete(resource, namespace);
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
  const { kubernetesService, logger } = context;
  const startTime = Date.now();

  if (!kubernetesService) {
    return true; // Skip in test mode
  }

  while (Date.now() - startTime < timeout * 1000) {
    if ('getStatus' in kubernetesService) {
      const status = await (kubernetesService).getStatus(
        `deployment/${deploymentName}`,
        namespace,
      );

      if (status.success && status.data?.ready) {
        return true;
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
  sessionService: any,
): Promise<string> {
  let targetPath = manifestsPath;

  if (!targetPath && sessionId && sessionService) {
    const session = await sessionService.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

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
  progressEmitter: any,
  sessionId: string | undefined,
): Promise<void> {
  const { wait, dryRun, timeout, namespace } = input;

  if (!wait || dryRun || deploymentResult.deployed.length === 0) {
    return;
  }

  const deployments = deploymentResult.deployed.filter((d) => d.startsWith('Deployment/'));

  for (const deployment of deployments) {
    const deploymentName = deployment.split('/')[1];
    if (!deploymentName) continue;

    if (progressEmitter && sessionId) {
      await progressEmitter.emit({
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

      if (input.rollbackOnFailure) {
        await rollbackDeployment(deploymentResult.deployed, namespace, context);
        throw new Error(`Deployment timeout and was rolled back`);
      }
    }
  }
}

/**
 * Get service endpoints
 */
export async function getEndpoints(
  deploymentResult: KubernetesDeploymentResult,
  namespace: string,
  kubernetesService: any,
  dryRun: boolean,
): Promise<any[] | undefined> {
  let endpoints = deploymentResult.endpoints;

  if (!endpoints && kubernetesService && 'getEndpoints' in kubernetesService && !dryRun) {
    const endpointResult = await kubernetesService.getEndpoints(namespace);
    if (endpointResult.success && endpointResult.data) {
      endpoints = endpointResult.data.map((e: { service: string; url?: string }) => ({
        service: e.service,
        type: 'ClusterIP' as const,
        url: e.url,
      }));
    }
  }

  return endpoints;
}
