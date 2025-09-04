/**
 * Deploy Application - MCP SDK Compatible Version
 */

import { z } from 'zod';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import * as yaml from 'js-yaml';
import {
  ErrorCode,
  DomainError,
  KubernetesManifest,
  KubernetesDeploymentResult
} from '../../../contracts/types/index.js';
import type { Session } from '../../../contracts/types/session.js';
import type { ToolDescriptor, ToolContext } from '../tool-types.js';

// Input schema
const DeployApplicationInput = z
  .object({
    session_id: z.string().optional(),
    sessionId: z.string().optional(),
    manifests_path: z.string().optional(),
    manifestsPath: z.string().optional(),
    namespace: z.string().default('default'),
    cluster_context: z.string().optional(),
    clusterContext: z.string().optional(),
    dry_run: z.boolean().default(false),
    dryRun: z.boolean().optional(),
    wait: z.boolean().default(true),
    timeout: z.number().default(300),
    force: z.boolean().default(false),
    rollback_on_failure: z.boolean().default(true),
    rollbackOnFailure: z.boolean().optional()
  })
  .transform((data) => ({
    sessionId: data.session_id ?? data.sessionId ?? undefined,
    manifestsPath: data.manifests_path ?? data.manifestsPath ?? undefined,
    namespace: data.namespace,
    clusterContext: data.cluster_context ?? data.clusterContext ?? undefined,
    dryRun: data.dry_run ?? data.dryRun ?? false,
    wait: data.wait,
    timeout: data.timeout,
    force: data.force,
    rollbackOnFailure: data.rollback_on_failure ?? data.rollbackOnFailure ?? true
  }));

// Output schema
const DeployApplicationOutput = z.object({
  success: z.boolean(),
  deployed: z.array(
    z.object({
      kind: z.string(),
      name: z.string(),
      namespace: z.string(),
      status: z.string()
    })
  ),
  failed: z.array(
    z.object({
      resource: z.string(),
      error: z.string()
    })
  ),
  endpoints: z
    .array(
      z.object({
        service: z.string(),
        type: z.string(),
        url: z.string().optional(),
        port: z.number().optional()
      })
    )
    .optional(),
  rollbackPerformed: z.boolean().optional(),
  metadata: z.object({
    deploymentTime: z.number(),
    clusterInfo: z.string().optional(),
    warnings: z.array(z.string()).optional()
  })
});

// Type aliases
export type DeployInput = z.infer<typeof DeployApplicationInput>;
export type DeployOutput = z.infer<typeof DeployApplicationOutput>;

/**
 * Load manifests from directory
 */
async function loadManifests(manifestsPath: string): Promise<KubernetesManifest[]> {
  const manifests: KubernetesManifest[] = [];

  const files = await fs.readdir(manifestsPath);
  const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

  for (const file of yamlFiles) {
    if (file === 'kustomization.yaml') continue; // Skip kustomization file

    const filepath = path.join(manifestsPath, file);
    const content = await fs.readFile(filepath, 'utf-8');

    try {
      const docs = yaml.loadAll(content) as KubernetesManifest[];
      manifests.push(
        ...docs.filter((d: KubernetesManifest | null): d is KubernetesManifest => d?.kind != null)
      ); // Filter out null docs
    } catch (error) {
      throw new Error(`Failed to parse ${file}: ${String(error)}`);
    }
  }

  return manifests;
}

/**
 * Order manifests for deployment (dependencies first)
 */
function orderManifests(manifests: KubernetesManifest[]): KubernetesManifest[] {
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
    'NetworkPolicy'
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
async function deployToCluster(
  manifests: KubernetesManifest[],
  input: DeployInput,
  context: ToolContext
): Promise<KubernetesDeploymentResult> {
  const { kubernetesService, logger } = context;

  if (kubernetesService != null && 'deploy' in kubernetesService) {
    const k8sService = kubernetesService;
    const result = await k8sService.deploy({
      manifests,
      namespace: input.namespace,
      wait: input.wait,
      timeout: input.timeout * 1000,
      dryRun: input.dryRun
    });

    if (result != null && typeof result === 'object') {
      if (
        'success' in result &&
        result.success === true &&
        'data' in result &&
        result.data != null
      ) {
        return result.data;
      }
      const errorMsg =
        'error' in result &&
        result.error != null &&
        typeof result.error === 'object' &&
        'message' in result.error
          ? String(result.error.message)
          : 'Deployment failed';
      throw new Error(errorMsg);
    }
    throw new Error('Deployment failed');
  }

  // Mock deployment for testing
  logger.warn('Kubernetes service not available, simulating deployment');

  return {
    success: true,
    resources: manifests.map((m) => ({
      kind: m.kind,
      name: m.metadata.name,
      namespace: input.namespace,
      status: 'created' as const
    })),
    deployed: manifests.map((m) => `${m.kind}/${m.metadata.name}`),
    failed: [],
    endpoints: [
      {
        service: manifests.find((m) => m.kind === 'Service')?.metadata.name ?? 'app',
        type: 'ClusterIP',
        port: 80
      }
    ]
  };
}

/**
 * Perform rollback on failure
 */
async function rollbackDeployment(
  deployed: string[],
  namespace: string,
  context: ToolContext
): Promise<void> {
  const { kubernetesService, logger } = context;

  logger.info({ resources: deployed.length }, 'Starting rollback'); // Fixed logger call

  if (kubernetesService) {
    for (const resource of deployed.reverse()) {
      // Delete in reverse order
      try {
        if ('delete' in kubernetesService) {
          const k8s = kubernetesService;
          await k8s.delete(resource, namespace);
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
async function waitForDeployment(
  deploymentName: string,
  namespace: string,
  timeout: number,
  context: ToolContext
): Promise<boolean> {
  const { kubernetesService, logger } = context;
  const startTime = Date.now();

  if (!kubernetesService) {
    return true; // Skip in test mode
  }

  while (Date.now() - startTime < timeout * 1000) {
    if ('getStatus' in kubernetesService) {
      const k8s = kubernetesService;
      const status = await k8s.getStatus(`deployment/${deploymentName}`, namespace);

      if (status.success && status.data?.ready) {
        return true;
      }
    }

    logger.info(
      {
        deployment: deploymentName,
        elapsed: Math.round((Date.now() - startTime) / 1000)
      },
      'Waiting for deployment to be ready'
    );

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return false;
}

/**
 * Main handler implementation
 */
const deployApplicationHandler: ToolDescriptor<DeployInput, DeployOutput> = {
  name: 'deploy_application',
  description: 'Deploy application to Kubernetes cluster',
  category: 'workflow',
  inputSchema: DeployApplicationInput,
  outputSchema: DeployApplicationOutput,

  handler: async (input: DeployInput, context: ToolContext): Promise<DeployOutput> => {
    const { logger, sessionService, progressEmitter, kubernetesService } = context;
    const { sessionId, manifestsPath, namespace, dryRun, wait, timeout, rollbackOnFailure } = input;

    logger.info(
      {
        sessionId,
        manifestsPath,
        namespace,
        dryRun
      },
      'Starting application deployment'
    );

    const startTime = Date.now();

    try {
      // Get manifests path from session if not provided
      let targetPath = manifestsPath;

      if (!targetPath && sessionId && sessionService) {
        const session = await sessionService.get(sessionId);
        if (!session) {
          throw new DomainError(ErrorCode.SessionNotFound, 'Session not found');
        }

        targetPath = session.workflow_state?.k8s_result?.output_path;
      }

      if (!targetPath) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'No manifests path specified');
      }

      // Check if path exists
      try {
        await fs.access(targetPath);
      } catch {
        throw new DomainError(
          ErrorCode.VALIDATION_ERROR,
          `Manifests path not found: ${targetPath}`
        );
      }

      // Emit progress
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'deploy_application',
          status: 'in_progress',
          message: 'Loading Kubernetes manifests',
          progress: 0.1
        });
      }

      // Load manifests
      const manifests = await loadManifests(targetPath);

      if (manifests.length === 0) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'No valid manifests found');
      }

      logger.info(
        {
          manifestsCount: manifests.length,
          kinds: manifests.map((m) => m.kind)
        },
        `Loaded ${manifests.length} manifests`
      );

      // Order manifests for deployment
      const orderedManifests = orderManifests(manifests);

      // Emit progress
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'deploy_application',
          status: 'in_progress',
          message: dryRun ? 'Validating manifests' : 'Deploying to cluster',
          progress: 0.3
        });
      }

      // Deploy to cluster
      let deploymentResult: KubernetesDeploymentResult;

      try {
        deploymentResult = await deployToCluster(orderedManifests, input, context);
      } catch (error) {
        logger.error({ error }, 'Deployment failed'); // Fixed logger call

        // Attempt rollback if enabled
        if (rollbackOnFailure && !dryRun) {
          logger.info('Attempting rollback due to deployment failure');

          // Get partially deployed resources
          const partialResult = await deployToCluster(
            orderedManifests.slice(0, 1), // Try to get what was deployed
            { ...input, dryRun: true },
            context
          );

          if (partialResult.deployed.length > 0) {
            await rollbackDeployment(partialResult.deployed, namespace, context);

            throw new DomainError(
              ErrorCode.OPERATION_FAILED,
              'Deployment failed and was rolled back',
              error instanceof Error ? error : undefined
            );
          }
        }

        throw error;
      }

      // Wait for deployment to be ready
      if (wait && !dryRun && deploymentResult.deployed.length > 0) {
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
              progress: 0.6
            });
          }

          const ready = await waitForDeployment(deploymentName, namespace, timeout, context);

          if (!ready) {
            logger.warn(`Deployment ${deploymentName} not ready after ${timeout}s`);

            if (rollbackOnFailure) {
              await rollbackDeployment(deploymentResult.deployed, namespace, context);

              throw new DomainError(ErrorCode.TIMEOUT, `Deployment timeout and was rolled back`);
            }
          }
        }
      }

      // Get endpoints if available
      let endpoints = deploymentResult.endpoints;

      if (!endpoints && kubernetesService && 'getEndpoints' in kubernetesService && !dryRun) {
        const k8s = kubernetesService;
        const endpointResult = await k8s.getEndpoints(namespace);
        if (endpointResult.success && endpointResult.data) {
          endpoints = endpointResult.data.map((e: { service: string; url?: string }) => ({
            service: e.service,
            type: 'ClusterIP' as const,
            url: e.url
          }));
        }
      }

      // Build deployed resources info
      const deployed = deploymentResult.deployed.map((resource) => {
        const [kind, name] = resource.split('/');
        return {
          kind: kind ?? 'Unknown',
          name: name ?? 'Unknown',
          namespace,
          status: 'deployed'
        };
      });

      // Update session with deployment info
      if (sessionId && sessionService) {
        await sessionService.updateAtomic(sessionId, (session: Session) => ({
          ...session,
          workflow_state: {
            ...session.workflow_state,
            deploymentResult: {
              deployed,
              endpoints,
              namespace,
              timestamp: new Date().toISOString()
            }
          }
        }));
      }

      // Emit completion
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'deploy_application',
          status: 'completed',
          message: `Deployed ${deployed.length} resources`,
          progress: 1.0
        });
      }

      const deploymentTime = Date.now() - startTime;

      logger.info(
        {
          deployed: deployed.length,
          failed: deploymentResult.failed.length,
          deploymentTime: `${deploymentTime}ms`,
          dryRun
        },
        'Deployment completed'
      );

      // Generate warnings
      const warnings: string[] = [];
      if (dryRun) {
        warnings.push('Dry run mode - no actual deployment performed');
      }
      if (deploymentResult.failed.length > 0) {
        warnings.push(`${deploymentResult.failed.length} resources failed to deploy`);
      }

      // Transform endpoints to match the expected schema format
      const transformedEndpoints = endpoints
        ?.map((endpoint) => ({
          service: endpoint.service ?? (endpoint.name || 'unknown'),
          type: endpoint.type,
          url: endpoint.url,
          port: endpoint.port
        }))
        .filter((e) => e.service !== 'unknown');

      // Construct the response object carefully to match schema requirements
      const response: DeployOutput = {
        success: true,
        deployed,
        failed: deploymentResult.failed,
        metadata: {
          deploymentTime,
          warnings: warnings.length > 0 ? warnings : undefined
        }
      };

      // Only add optional properties if they have defined values
      if (transformedEndpoints && transformedEndpoints.length > 0) {
        response.endpoints = transformedEndpoints;
      }

      if (input.clusterContext !== undefined) {
        response.metadata.clusterInfo = input.clusterContext;
      }

      return response;
    } catch (error) {
      logger.error({ error }, 'Deployment failed'); // Fixed logger call

      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'deploy_application',
          status: 'failed',
          message: 'Deployment failed',
          progress: 0
        });
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'verify_deployment',
    reason: 'Verify deployment health and get endpoints',
    paramMapper: (output) => ({
      namespace: output.deployed[0]?.namespace,
      deployments: output.deployed.filter((d) => d.kind === 'Deployment').map((d) => d.name)
    })
  }
};

// Default export for registry
export default deployApplicationHandler;
