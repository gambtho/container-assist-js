/**
 * Generate K8s Manifests - MCP SDK Compatible Version
 */

import { z } from 'zod';
import { generateK8sManifests } from './helper.js';
import type { ToolDescriptor, ToolContext } from '../tool-types.js';

// Input schema with support for both snake_case and camelCase
const GenerateKubernetesManifestsInput = z
  .object({
    session_id: z.string().optional(),
    sessionId: z.string().optional(),
    app_name: z.string().optional(),
    appName: z.string().optional(),
    image: z.string().optional(),
    namespace: z.string().default('default'),
    replicas: z.number().default(3),
    port: z.number().optional(),
    service_type: z.enum(['ClusterIP', 'NodePort', 'LoadBalancer']).default('ClusterIP'),
    serviceType: z.enum(['ClusterIP', 'NodePort', 'LoadBalancer']).optional(),
    ingress_enabled: z.boolean().default(false),
    ingressEnabled: z.boolean().optional(),
    ingress_host: z.string().optional(),
    ingressHost: z.string().optional(),
    resources: z
      .object({
        requests: z
          .object({
            memory: z.string().default('128Mi'),
            cpu: z.string().default('100m'),
          })
          .optional(),
        limits: z
          .object({
            memory: z.string().default('512Mi'),
            cpu: z.string().default('500m'),
          })
          .optional(),
      })
      .optional(),
    autoscaling: z.boolean().default(false),
    min_replicas: z.number().optional(),
    minReplicas: z.number().optional(),
    max_replicas: z.number().optional(),
    maxReplicas: z.number().optional(),
    target_cpu: z.number().optional(),
    targetCPU: z.number().optional(),
    target_memory: z.number().optional(),
    targetMemory: z.number().optional(),
    environment: z.string().default('development'),
    output_path: z.string().default('./k8s/'),
    outputPath: z.string().optional(),
    security_context: z
      .object({
        runAsNonRoot: z.boolean().optional(),
        runAsUser: z.number().optional(),
        readOnlyRootFilesystem: z.boolean().optional(),
      })
      .optional(),
    securityContext: z
      .object({
        runAsNonRoot: z.boolean().optional(),
        runAsUser: z.number().optional(),
        readOnlyRootFilesystem: z.boolean().optional(),
      })
      .optional(),
  })
  .transform((data) => ({
    sessionId: data.session_id ?? data.sessionId ?? '',
    appName: data.app_name ?? data.appName ?? 'app',
    image: data.image,
    namespace: data.namespace,
    replicas: data.replicas,
    port: data.port,
    serviceType: data.service_type ?? data.serviceType ?? 'ClusterIP',
    ingressEnabled: data.ingress_enabled ?? data.ingressEnabled ?? false,
    ingressHost: data.ingress_host ?? data.ingressHost,
    resources: data.resources,
    autoscaling: data.autoscaling,
    minReplicas: data.min_replicas ?? data.minReplicas,
    maxReplicas: data.max_replicas ?? data.maxReplicas,
    targetCPU: data.target_cpu ?? data.targetCPU,
    targetMemory: data.target_memory ?? data.targetMemory,
    environment: data.environment,
    outputPath: data.output_path ?? data.outputPath ?? './k8s/',
    securityContext: data.security_context ?? data.securityContext,
  }));

type KubernetesManifestsInput = z.infer<typeof GenerateKubernetesManifestsInput>;

// Output schema
const GenerateKubernetesManifestsOutput = z.object({
  success: z.boolean(),
  manifests: z.array(
    z.object({
      kind: z.string(),
      name: z.string(),
      path: z.string(),
      content: z.string(),
    }),
  ),
  outputPath: z.string(),
  metadata: z.object({
    totalResources: z.number(),
    namespace: z.string(),
    image: z.string(),
    estimatedCost: z.number(),
    warnings: z.array(z.string()).optional(),
  }),
});

type KubernetesManifestsOutput = z.infer<typeof GenerateKubernetesManifestsOutput>;

const generateKubernetesManifestsHandler: ToolDescriptor = {
  name: 'generate_k8s_manifests',
  description: 'Generate production-ready Kubernetes manifests for application deployment',
  category: 'utility',

  inputSchema: GenerateKubernetesManifestsInput,
  outputSchema: GenerateKubernetesManifestsOutput,

  handler: async (
    input: KubernetesManifestsInput,
    context: ToolContext,
  ): Promise<KubernetesManifestsOutput> => {
    const { logger, sessionService } = context;
    const { sessionId, outputPath } = input;

    logger.info(
      {
        sessionId,
        appName: input.appName,
        namespace: input.namespace,
        environment: input.environment,
      },
      'Starting K8s manifest generation',
    );

    try {
      // Get image from session if not provided
      let image = input.image;
      let port = input.port;

      if ((!image || !port) && sessionId && sessionService) {
        const session = await sessionService.get(sessionId);
        if (session) {
          const workflowState = session.workflow_state;
          if (workflowState?.build_result?.image_name) {
            image = workflowState.build_result.image_name;
          } else if (workflowState?.analysis_result?.language) {
            const lang = workflowState.analysis_result.language;
            image = `${input.appName}-${lang}:latest`;
          }

          if (workflowState?.analysis_result?.ports?.[0]) {
            port = workflowState.analysis_result.ports[0];
          }
        }
      }

      const result = await generateK8sManifests(
        {
          sessionId: sessionId || '',
          appName: input.appName,
          image: image || `${input.appName}:latest`,
          namespace: input.namespace,
          replicas: input.replicas,
          port: port || input.port || 8080,
          serviceType: input.serviceType,
          ingressEnabled: input.ingressEnabled,
          ingressHost: input.ingressHost,
          resources: input.resources
            ? {
              ...(input.resources.requests && { requests: input.resources.requests }),
              ...(input.resources.limits && { limits: input.resources.limits }),
            }
            : undefined,
          autoscaling: {
            enabled: input.autoscaling || false,
            ...(input.minReplicas !== undefined && { minReplicas: input.minReplicas }),
            ...(input.maxReplicas !== undefined && { maxReplicas: input.maxReplicas }),
            ...(input.targetCPU !== undefined && { targetCPU: input.targetCPU }),
            ...(input.targetMemory !== undefined && { targetMemory: input.targetMemory }),
          },
          environment: input.environment,
          outputPath,
        },
        context,
      );

      // Estimate monthly cost (simple calculation)
      const estimatedCost = (() => {
        const baseInstanceCost = 50;
        const serviceTypeCost = input.serviceType === 'LoadBalancer' ? 20 : 0;
        const ingressCost = input.ingressEnabled ? 10 : 0;
        return input.replicas * baseInstanceCost + serviceTypeCost + ingressCost;
      })();

      return {
        success: true,
        manifests: result.manifests.map((m) => ({
          kind: m.kind,
          name: m.name,
          path: m.path ?? '',
          content: '',
        })),
        outputPath: result.outputPath,
        metadata: {
          totalResources: result.manifests.length,
          namespace: result.metadata.namespace,
          image: image || `${input.appName}:latest`,
          estimatedCost,
          warnings: result.warnings,
        },
      };
    } catch (error) {
      logger.error({ error }, 'K8s manifest generation failed');
      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'deploy_application',
    reason: 'Deploy generated manifests to Kubernetes cluster',
    paramMapper: (output) => ({
      manifests_path: output.outputPath,
      namespace: output.metadata.namespace,
    }),
  },
};

// Default export for registry
export default generateKubernetesManifestsHandler;
