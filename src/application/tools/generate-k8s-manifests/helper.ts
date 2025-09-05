/**
 * Generate K8s Manifests - Helper Functions
 */

import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import * as yaml from 'js-yaml';
import { KubernetesManifest } from '../../../domain/types/index';
import { ErrorCode, DomainError } from '../../../domain/types/errors';
import { executeWithRecovery } from '../error-recovery';
import {
  buildK8sRequest,
  buildKustomizationRequest,
  type K8sVariables,
} from '../../../infrastructure/ai/index';
import type { ToolContext } from '../tool-types';

/**
 * Sanitize filename to be safe for filesystem
 */
function sanitizeFilename(name: string): string {
  // Replace unsafe characters with hyphens
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100); // Limit length
}

/**
 * Get default API version for a Kubernetes resource kind
 */
function getDefaultApiVersion(kind?: string): string {
  if (!kind) return 'v1';

  const apiVersionMap: Record<string, string> = {
    Deployment: 'apps/v1',
    StatefulSet: 'apps/v1',
    DaemonSet: 'apps/v1',
    ReplicaSet: 'apps/v1',
    Service: 'v1',
    Pod: 'v1',
    ConfigMap: 'v1',
    Secret: 'v1',
    PersistentVolume: 'v1',
    PersistentVolumeClaim: 'v1',
    ServiceAccount: 'v1',
    Role: 'rbac.authorization.k8s.io/v1',
    RoleBinding: 'rbac.authorization.k8s.io/v1',
    ClusterRole: 'rbac.authorization.k8s.io/v1',
    ClusterRoleBinding: 'rbac.authorization.k8s.io/v1',
    Ingress: 'networking.k8s.io/v1',
    NetworkPolicy: 'networking.k8s.io/v1',
    HorizontalPodAutoscaler: 'autoscaling/v2',
    Job: 'batch/v1',
    CronJob: 'batch/v1',
  };

  return apiVersionMap[kind] ?? 'v1';
}

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
  context: ToolContext,
): Promise<GenerationResult> {
  const { aiService: _aiService, sampleFunction, progressEmitter, logger } = context;
  const { sessionId } = input;

  try {
    // Progress: Starting generation
    if (progressEmitter && sessionId) {
      progressEmitter.emit('progress', {
        sessionId,
        step: 'generate_k8s_manifests',
        status: 'in_progress',
        message: 'Generating Kubernetes manifests',
        progress: 0.2,
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
        autoscaling: input.autoscaling?.enabled ?? false,
        ...(input.autoscaling?.enabled && {
          minReplicas: input.autoscaling.minReplicas ?? input.replicas,
          maxReplicas: input.autoscaling.maxReplicas ?? input.replicas * 3,
          targetCPU: input.autoscaling.targetCPU ?? 80,
        }),
      };

      const builder = buildK8sRequest(k8sVariables, {
        temperature: 0.2,
        maxTokens: 2000,
      });

      if (!sampleFunction) {
        throw new Error('AI service not available');
      }

      const result = await sampleFunction(builder);

      if (result.success && 'text' in result) {
        return result.text;
      }

      throw new Error('Failed to generate manifests');
    });

    // Progress: Parsing manifests
    if (progressEmitter && sessionId) {
      progressEmitter.emit('progress', {
        sessionId,
        step: 'generate_k8s_manifests',
        status: 'in_progress',
        message: 'Parsing generated manifests',
        progress: 0.5,
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

        // Require apiVersion for all manifests
        if (!manifest.apiVersion) {
          logger.warn({ kind: manifest.kind }, 'Manifest missing apiVersion, adding default');
          // Add default apiVersion based on kind
          manifest.apiVersion = getDefaultApiVersion(manifest.kind);
        }

        if (manifest.kind && manifest.metadata?.name && manifest.apiVersion) {
          validManifests.push({
            kind: manifest.kind,
            name: manifest.metadata.name,
            manifest,
          });
        }
      }
    }

    if (validManifests.length === 0) {
      throw new DomainError(
        ErrorCode.AIGenerationError,
        'No valid Kubernetes manifests were generated',
      );
    }

    // Progress: Writing files
    if (progressEmitter && sessionId) {
      progressEmitter.emit('progress', {
        sessionId,
        step: 'generate_k8s_manifests',
        status: 'in_progress',
        message: 'Writing manifest files',
        progress: 0.7,
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

      const sanitizedKind = sanitizeFilename(kind);
      const sanitizedName = sanitizeFilename(name);
      const filename = `${sanitizedKind}-${sanitizedName}.yaml`;
      const filepath = path.join(manifestDir, filename);
      const content = yaml.dump(manifest, { lineWidth: -1 });

      await fs.writeFile(filepath, content, 'utf-8');

      outputManifests.push({
        kind,
        name,
        path: filepath,
        content,
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
            environment: input.environment,
          },
        },
        {
          temperature: 0.1,
          maxTokens: 600,
        },
      );

      if (!sampleFunction) {
        // Fallback to basic kustomization without AI
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
      }

      const result = await sampleFunction(kustomizationBuilder);

      if (result.success && 'text' in result) {
        return result.text;
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
    await fs.writeFile(kustomizationPath, String(kustomizationResult || ''), 'utf-8');

    // Generate warnings
    const warnings = generateWarnings(input);

    // Progress: Complete
    if (progressEmitter && sessionId) {
      progressEmitter.emit('progress', {
        sessionId,
        step: 'generate_k8s_manifests',
        status: 'completed',
        message: `Generated ${validManifests.length} manifests`,
        progress: 1.0,
      });
    }

    return {
      outputPath: manifestDir,
      manifests: outputManifests,
      metadata: {
        appName: input.appName,
        namespace: input.namespace,
        environment: input.environment,
      },
      warnings,
    };
  } catch (error) {
    // Progress: Error
    if (progressEmitter && sessionId) {
      progressEmitter.emit('progress', {
        sessionId,
        step: 'generate_k8s_manifests',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        progress: 0,
      });
    }

    throw error instanceof Error ? error : new Error(String(error));
  }
}
