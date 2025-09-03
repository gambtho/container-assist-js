/**
 * Deploy Application - Main Orchestration Logic
 */

import { z } from 'zod';
import { access } from 'node:fs/promises';
import {
  ErrorCode,
  DomainError
} from '../../../contracts/types/index.js';
import type { MCPToolDescriptor, MCPToolContext } from '../tool-types.js';
import {
  loadManifests,
  orderManifests,
  deployToCluster,
  rollbackDeployment,
  waitForAllDeployments,
  getEndpoints,
  getTargetPath,
  validatePath,
  type DeployInput as HelperDeployInput,
  type KubernetesDeploymentResult
} from './helper';

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
 * Main handler implementation
 */
const deployApplicationHandler: MCPToolDescriptor<DeployInput, DeployOutput> = {
  name: 'deploy_application',
  description: 'Deploy application to Kubernetes cluster',
  category: 'workflow',
  inputSchema: DeployApplicationInput,
  outputSchema: DeployApplicationOutput,

  handler: async (input: DeployInput, context: MCPToolContext): Promise<DeployOutput> => {
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
        await access(targetPath);
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
        await waitForAllDeployments(deploymentResult, input, context, progressEmitter, sessionId);
      }

      // Get endpoints if available
      let endpoints = deploymentResult.endpoints;

      if (!endpoints && kubernetesService && 'getEndpoints' in kubernetesService && !dryRun) {
        const endpointResult = await (kubernetesService as any).getEndpoints(namespace);
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
        await sessionService.updateAtomic(sessionId, (session) => ({
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
