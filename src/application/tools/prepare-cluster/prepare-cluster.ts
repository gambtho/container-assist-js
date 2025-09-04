/**
 * Prepare Cluster - MCP SDK Compatible Version
 */

import { z } from 'zod';
import { ErrorCode, InfrastructureError } from '../../../contracts/types/errors.js';
import type { ToolDescriptor, ToolContext } from '../tool-types.js';
import type { Session } from '../../../contracts/types/session.js';

// Input schema
const PrepareClusterInputRaw = z.object({
  session_id: z.string().optional(),
  sessionId: z.string().optional(),
  cluster_context: z.string().optional(),
  clusterContext: z.string().optional(),
  namespace: z.string().default('default'),
  dry_run: z.boolean().default(false),
  dryRun: z.boolean().optional(),
  validate_only: z.boolean().default(false),
  validateOnly: z.boolean().optional(),
});

const PrepareClusterInput = PrepareClusterInputRaw.transform((data) => {
  const sessionId = data.session_id ?? data.sessionId;
  if (!sessionId) {
    throw new Error('session_id or sessionId is required');
  }

  return {
    sessionId,
    clusterContext: data.cluster_context ?? (data.clusterContext || 'default'),
    namespace: data.namespace,
    dryRun: data.dry_run ?? data.dryRun ?? false,
    validateOnly: data.validate_only ?? data.validateOnly ?? false,
  };
});

// Output schema
const PrepareClusterOutput = z.object({
  success: z.boolean(),
  sessionId: z.string(),
  cluster: z.object({
    context: z.string(),
    version: z.string(),
    nodes: z.number(),
    ready: z.boolean(),
  }),
  namespace: z.object({
    name: z.string(),
    exists: z.boolean(),
    created: z.boolean().optional(),
  }),
  validation: z.object({
    connectivity: z.boolean(),
    permissions: z.boolean(),
    resources: z.boolean(),
    ingress: z.boolean().optional(),
  }),
  recommendations: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Type aliases
export type PrepareClusterInput = {
  sessionId: string;
  clusterContext: string;
  namespace: string;
  dryRun: boolean;
  validateOnly: boolean;
};
export type PrepareClusterOutput = z.infer<typeof PrepareClusterOutput>;

/**
 * Prepare Cluster Handler Implementation
 */
const prepareClusterHandler: ToolDescriptor<PrepareClusterInput, PrepareClusterOutput> = {
  name: 'prepare_cluster',
  description: 'Prepare and validate Kubernetes cluster for application deployment',
  category: 'workflow',
  inputSchema: PrepareClusterInput,
  outputSchema: PrepareClusterOutput,
  timeout: 60000, // 60 seconds for cluster operations

  handler: async (
    input: PrepareClusterInput,
    context: ToolContext,
  ): Promise<PrepareClusterOutput> => {
    const {
      logger,
      sessionService,
      progressEmitter,
      kubernetesService: _kubernetesService,
    } = context;
    const { sessionId, clusterContext, namespace, dryRun, validateOnly } = input;

    logger.info(
      {
        sessionId,
        clusterContext,
        namespace,
        dryRun,
        validateOnly,
      },
      'Starting cluster preparation',
    );

    try {
      // Get session data
      if (!sessionService) {
        throw new InfrastructureError(
          ErrorCode.ServiceUnavailable,
          'Session service not available',
        );
      }

      const session = await sessionService.get(sessionId);
      if (!session) {
        throw new InfrastructureError(ErrorCode.SessionNotFound, `Session ${sessionId} not found`);
      }

      // Emit progress
      if (progressEmitter) {
        await progressEmitter.emit({
          sessionId,
          step: 'prepare_cluster',
          status: 'in_progress',
          message: 'Validating cluster connectivity',
          progress: 0.1,
        });
      }

      // Simulate cluster preparation - replace with kubernetesService integration
      const clusterInfo = simulateClusterPreparation(
        clusterContext ?? 'default',
        namespace,
        dryRun,
        validateOnly,
        logger,
      );

      // Emit progress
      if (progressEmitter) {
        await progressEmitter.emit({
          sessionId,
          step: 'prepare_cluster',
          status: 'in_progress',
          message: 'Preparing namespace and resources',
          progress: 0.6,
        });
      }

      // Store cluster info in session
      await sessionService.updateAtomic(sessionId, (session: Session) => ({
        ...session,
        workflow_state: {
          ...session.workflow_state,
          clusterResult: clusterInfo,
        },
      }));

      // Emit completion
      if (progressEmitter) {
        await progressEmitter.emit({
          sessionId,
          step: 'prepare_cluster',
          status: 'completed',
          message: 'Cluster preparation complete',
          progress: 1.0,
        });
      }

      return {
        success: true,
        sessionId,
        ...clusterInfo,
        metadata: {
          timestamp: new Date().toISOString(),
          dryRun,
          validateOnly,
        },
      };
    } catch (error) {
      logger.error({ error, sessionId }); // Fixed logger call

      // Emit error
      if (progressEmitter) {
        await progressEmitter.emit({
          sessionId,
          step: 'prepare_cluster',
          status: 'failed',
          message: `Cluster preparation failed: ${error instanceof Error ? error.message : String(error)}`,
          progress: 0,
        });
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'deploy_application',
    reason: 'Deploy application to prepared cluster',
    paramMapper: (output) => ({
      session_id: output.sessionId,
      namespace: output.namespace.name,
      cluster_context: output.cluster.context,
    }),
  },
};

/**
 * Simulate cluster preparation for demo purposes
 * In production, this would interact with real Kubernetes API
 */
function simulateClusterPreparation(
  context: string,
  namespace: string,
  dryRun: boolean,
  validateOnly: boolean,
  logger: unknown,
): {
  cluster: PrepareClusterOutput['cluster'];
  namespace: PrepareClusterOutput['namespace'];
  validation: PrepareClusterOutput['validation'];
  recommendations?: string[];
} {
  (logger as any).info({ context, namespace, dryRun, validateOnly }); // Fixed logger call

  // Simulate cluster information
  const cluster = {
    context,
    version: 'v1.28.0',
    nodes: 3,
    ready: true,
  };

  // Simulate namespace operations
  const namespaceInfo = {
    name: namespace,
    exists: namespace === 'default', // Assume default exists
    created: !dryRun && namespace !== 'default',
  };

  // Simulate validation checks
  const validation = {
    connectivity: true,
    permissions: true,
    resources: true,
    ingress: true,
  };

  // Generate recommendations
  const recommendations = [];
  if (namespace === 'default') {
    recommendations.push('Consider using a dedicated namespace for better resource isolation');
  }
  if (cluster.nodes < 2) {
    recommendations.push('Consider using multiple nodes for high availability');
  }
  recommendations.push('Ensure resource quotas are configured for the namespace');
  recommendations.push('Verify network policies if using NetworkPolicy resources');

  return {
    cluster,
    namespace: namespaceInfo,
    validation,
    recommendations,
  };
}

// Default export for registry
export default prepareClusterHandler;
