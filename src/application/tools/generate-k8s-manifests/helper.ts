/**
 * Generate K8s Manifests - Helper Functions
 */

import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import * as yaml from 'js-yaml';
import { KubernetesManifest } from '../../../contracts/types/index.js';
import { createDomainError, ErrorCode } from '../../../domain/types/errors.js';
import { executeWithRecovery } from '../error-recovery.js';
import {
  buildK8sRequest,
  buildKustomizationRequest,
  type K8sVariables
} from '../../../infrastructure/ai/index.js';
import type { ToolContext } from '../tool-types.js';

// Type for input options
interface K8sManifestInput {
  sessionId: string;
  appName: string;
  image?: string;
  namespace: string;
  replicas: number;
  port?: number;
  serviceType: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  ingressEnabled: boolean;
  ingressHost?: string | undefined;
  resources?:
    | {
        requests?: {
          memory: string;
          cpu: string;
        };
        limits?: {
          memory: string;
          cpu: string;
        };
      }
    | undefined;
  autoscaling?: {
    enabled: boolean;
    minReplicas?: number;
    maxReplicas?: number;
    targetCPU?: number;
    targetMemory?: number;
  };
  environment: string;
  outputPath: string;
}

interface GenerationResult {
  outputPath: string;
  manifests: Array<{
    kind: string;
    name: string;
    path?: string;
  }>;
  metadata: {
    appName: string;
    namespace: string;
    environment: string;
  };
  warnings: string[];
}

/**
 * Generate warnings based on input configuration
 */
function generateWarnings(input: K8sManifestInput): string[] {
  const warnings: string[] = [];

  if (!input.image) {
    warnings.push('No image specified, using default app:latest');
  }

  if (input.replicas === 1) {
    warnings.push('Single replica configuration - consider increasing for production');
  }

  if (!input.resources?.limits) {
    warnings.push('No resource limits specified - may cause resource contention');
  }

  if (input.ingressEnabled && !input.ingressHost) {
    warnings.push('Ingress enabled but no host specified');
  }

  if (input.serviceType === 'LoadBalancer') {
    warnings.push('LoadBalancer service type may incur cloud provider costs');
  }

  return warnings;
}

/**
 * Generate Kubernetes manifests using AI
 */
export async function generateK8sManifests(
  input: K8sManifestInput,
  context: ToolContext
): Promise<GenerationResult> {
  const { aiService, progressEmitter, logger } = context;
  const { sessionId } = input;

  // Get session for analysis context (currently unused but may be needed for future enhancements)
  // let session: Session | null = null;
  // if (sessionId && sessionService) {
  //   try {
  //     session = await sessionService.get(sessionId);
  //   } catch (error) {
  //     logger?.warn({ error, sessionId }, 'Failed to get session for analysis context');
  //   }
  // }

  try {
    // Progress: Starting generation
    if (progressEmitter && sessionId) {
      await progressEmitter.emit({
        sessionId,
        step: 'generate_k8s_manifests',
        status: 'in_progress',
        message: 'Generating Kubernetes manifests',
        progress: 0.2
      });
    }

    // Generate manifests using AI
    const aiResult = await executeWithRecovery(async () => {
      const k8sVariables: K8sVariables = {
        appName: input.appName,
        image: input.image ?? 'app:latest',
        port: input.port ?? 8080,
        environment: input.environment,
        namespace: input.namespace,
        serviceType: input.serviceType,
        replicas: input.replicas,
        ingressEnabled: input.ingressEnabled,
        ...(input.ingressHost && { ingressHost: input.ingressHost }),
        autoscaling: input.autoscaling?.enabled || false
      };

      const builder = buildK8sRequest(k8sVariables, {
        temperature: 0.2,
        maxTokens: 2000
      });

      const result = await aiService.generate(builder);

      if (result.data) {
        return result.data;
      }

      throw new Error('Failed to generate manifests');
    });

    // Progress: Parsing manifests
    if (progressEmitter && sessionId) {
      await progressEmitter.emit({
        sessionId,
        step: 'generate_k8s_manifests',
        status: 'in_progress',
        message: 'Parsing generated manifests',
        progress: 0.5
      });
    }

    // Parse YAML manifests
    const documents = yaml.loadAll(aiResult);
    const validManifests: Array<{
      kind: string;
      name: string;
      manifest: KubernetesManifest;
    }> = [];

    for (const doc of documents) {
      if (doc && typeof doc === 'object' && 'kind' in doc && 'metadata' in doc) {
        const manifest = doc as KubernetesManifest;
        if (manifest.kind && manifest.metadata?.name) {
          validManifests.push({
            kind: manifest.kind,
            name: manifest.metadata.name,
            manifest
          });
        }
      }
    }

    if (validManifests.length === 0) {
      throw createDomainError(
        ErrorCode.AI_SERVICE_ERROR,
        'No valid Kubernetes manifests were generated'
      );
    }

    // Progress: Writing files
    if (progressEmitter && sessionId) {
      await progressEmitter.emit({
        sessionId,
        step: 'generate_k8s_manifests',
        status: 'in_progress',
        message: 'Writing manifest files',
        progress: 0.7
      });
    }

    // Create output directory
    const manifestDir = path.isAbsolute(input.outputPath)
      ? input.outputPath
      : path.join(process.cwd(), input.outputPath);
    await fs.mkdir(manifestDir, { recursive: true });

    // Write manifests to files
    const outputManifests: Array<{
      kind: string;
      name: string;
      path?: string;
      content?: string;
    }> = [];

    for (const { kind, name, manifest } of validManifests) {
      if (!manifest || !name) continue;

      const filename = `${kind.toLowerCase()}-${name}.yaml`;
      const filepath = path.join(manifestDir, filename);
      const content = yaml.dump(manifest, { lineWidth: -1 });

      await fs.writeFile(filepath, content, 'utf-8');

      outputManifests.push({
        kind,
        name,
        path: filepath,
        content
      });

      logger?.info({ kind, path: filepath }, `Generated ${kind}`);
    }

    // Generate kustomization.yaml using AI
    const kustomizationResult = await executeWithRecovery(async () => {
      const kustomizationBuilder = buildKustomizationRequest(
        {
          appName: input.appName,
          namespace: input.namespace,
          environment: input.environment,
          resources: outputManifests.filter((m) => m.path).map((m) => path.basename(m.path!)),
          commonLabels: {
            app: input.appName,
            environment: input.environment
          }
        },
        {
          temperature: 0.1,
          maxTokens: 600
        }
      );

      const result = await aiService.generate(kustomizationBuilder);

      if (result.data) {
        return result.data;
      }

      return `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: ${input.namespace}
resources:
${outputManifests
  .filter((m) => m.path)
  .map((m) => `  - ${path.basename(m.path!)}`)
  .join('\n')}
commonLabels:
  app: ${input.appName}
  environment: ${input.environment}`;
    });

    const kustomizationPath = path.join(manifestDir, 'kustomization.yaml');
    await fs.writeFile(kustomizationPath, kustomizationResult, 'utf-8');

    // Generate warnings
    const warnings = generateWarnings(input);

    // Progress: Complete
    if (progressEmitter && sessionId) {
      await progressEmitter.emit({
        sessionId,
        step: 'generate_k8s_manifests',
        status: 'completed',
        message: `Generated ${validManifests.length} manifests`,
        progress: 1.0
      });
    }

    return {
      outputPath: manifestDir,
      manifests: outputManifests,
      metadata: {
        appName: input.appName,
        namespace: input.namespace,
        environment: input.environment
      },
      warnings
    };
  } catch (error) {
    // Progress: Error
    if (progressEmitter && sessionId) {
      await progressEmitter.emit({
        sessionId,
        step: 'generate_k8s_manifests',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        progress: 0
      });
    }

    throw error instanceof Error ? error : new Error(String(error));
  }
}
