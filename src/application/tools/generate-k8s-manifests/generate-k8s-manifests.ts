/**
 * Generate K8s Manifests - MCP SDK Compatible Version
 */

import path from 'node:path';
import { generateK8sManifests } from './helper';
import {
  GenerateK8sManifestsInput,
  type GenerateK8sManifestsParams,
  K8sManifestsResultSchema,
  type K8sManifestsResult,
} from '../schemas';
import type { ToolDescriptor, ToolContext } from '../tool-types';

const generateKubernetesManifestsHandler: ToolDescriptor<
  GenerateK8sManifestsParams,
  K8sManifestsResult
> = {
  name: 'generate_k8s_manifests',
  description: 'Generate production-ready Kubernetes manifests for application deployment',
  category: 'utility',

  inputSchema: GenerateK8sManifestsInput,
  outputSchema: K8sManifestsResultSchema,

  handler: async (
    input: GenerateK8sManifestsParams,
    context: ToolContext,
  ): Promise<K8sManifestsResult> => {
    const { logger } = context;
    const { sessionId } = input;

    logger.info(
      {
        sessionId,
      },
      'Starting K8s manifest generation',
    );

    try {
      const result = await generateK8sManifests(
        {
          sessionId: sessionId || '',
          appName: 'app',
          namespace: 'default',
          replicas: 1,
          serviceType: 'ClusterIP',
          ingressEnabled: false,
          environment: 'prod',
          outputPath: path.join('k8s', sessionId || 'default'),
        },
        context,
      );

      return {
        success: true,
        sessionId: sessionId || '',
        manifests: Array.isArray(result.manifests)
          ? JSON.stringify(result.manifests)
          : result.manifests || '',
        path: './k8s/',
        resources: Array.isArray((result as any).resources) ? (result as any).resources : [],
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
      sessionId: output.sessionId,
    }),
  },
};

// Default export for registry
export default generateKubernetesManifestsHandler;
