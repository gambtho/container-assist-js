/**
 * Generate K8s Manifests Tool - Standardized Implementation
 *
 * Generates Kubernetes manifests for application deployment
 * Uses standardized helpers for consistent behavior
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getSession, updateSession } from '@mcp/tools/session-helpers';
import { aiGenerate } from '@mcp/tools/ai-helpers';
import { createStandardProgress } from '@mcp/utils/progress-helper';
import { createTimer } from '@lib/logger';
import type { ToolContext } from '../../mcp/context/types';
import type { SessionData } from '../session-types';
import { Success, Failure, type Result } from '../../domain/types';
import { stripFencesAndNoise, isValidKubernetesContent } from '@lib/text-processing';

/**
 * Configuration for Kubernetes manifest generation
 */
export interface GenerateK8sManifestsConfig {
  /** Session identifier for storing results */
  sessionId?: string;
  /** Docker image ID to deploy (optional, defaults to build result) */
  imageId?: string;
  /** Application name (defaults to detected name) */
  appName?: string;
  /** Kubernetes namespace (defaults to 'default') */
  namespace?: string;
  /** Number of replicas (defaults to 1) */
  replicas?: number;
  /** Application port (defaults to detected port) */
  port?: number;
  /** Service type for external access */
  serviceType?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  /** Enable ingress controller */
  ingressEnabled?: boolean;
  /** Hostname for ingress routing */
  ingressHost?: string;
  /** Resource requests and limits */
  resources?: {
    requests?: {
      memory: string;
      cpu: string;
    };
    limits?: {
      memory: string;
      cpu: string;
    };
  };
  /** Environment variables to set */
  envVars?: Array<{ name: string; value: string }>;
  /** ConfigMap data */
  configMapData?: Record<string, string>;
  /** Health check configuration */
  healthCheck?: {
    enabled: boolean;
    path?: string;
    port?: number;
    initialDelaySeconds?: number;
  };
  /** Enable autoscaling */
  autoscaling?: {
    enabled: boolean;
    minReplicas?: number;
    maxReplicas?: number;
    targetCPUUtilizationPercentage?: number;
  };
}

/**
 * Result from K8s manifest generation
 */
export interface GenerateK8sManifestsResult {
  /** Generated manifests as YAML */
  manifests: string;
  /** Output directory path */
  outputPath: string;
  /** List of generated resources */
  resources: Array<{
    kind: string;
    name: string;
    namespace: string;
  }>;
  /** Warnings about manifest configuration */
  warnings?: string[];
  /** Session ID for reference */
  sessionId?: string;
}

/**
 * Kubernetes resource type definitions
 */
interface K8sResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, unknown>;
  data?: Record<string, string>;
}

/**
 * Parse K8s manifests from AI response
 */
function parseK8sManifestsFromAI(content: string): K8sResource[] {
  const manifests: K8sResource[] = [];

  try {
    // Try parsing as JSON array first
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.filter(validateK8sResource);
    } else if (validateK8sResource(parsed)) {
      return [parsed];
    }
  } catch {
    // Try YAML-like parsing
    const documents = content.split(/^---$/m);
    for (const doc of documents) {
      if (!doc.trim()) continue;

      try {
        // Simple conversion from YAML-like to JSON
        const jsonStr = doc
          .replace(/^(\s*)(\w+):/gm, '$1"$2":')
          .replace(/:\s*(\w+)$/gm, ': "$1"')
          .replace(/:\s*(\d+)$/gm, ': $1');

        const obj = JSON.parse(`{${jsonStr}}`);
        if (validateK8sResource(obj)) {
          manifests.push(obj);
        }
      } catch {
        // Skip invalid documents
      }
    }
  }

  return manifests;
}

/**
 * Validate a K8s resource object
 */
function validateK8sResource(obj: unknown): obj is K8sResource {
  if (!obj || typeof obj !== 'object') return false;
  const resource = obj as Record<string, unknown>;

  return Boolean(
    typeof resource.apiVersion === 'string' &&
      typeof resource.kind === 'string' &&
      resource.metadata &&
      typeof resource.metadata === 'object' &&
      resource.metadata !== null &&
      typeof (resource.metadata as Record<string, unknown>).name === 'string',
  );
}

/**
 * Generate basic K8s manifests (fallback)
 */
function generateBasicManifests(
  params: GenerateK8sManifestsConfig,
  image: string,
): Result<{ manifests: K8sResource[]; aiUsed: boolean }> {
  const {
    appName = 'app',
    namespace = 'default',
    replicas = 1,
    port = 8080,
    serviceType = 'ClusterIP',
    ingressEnabled = false,
    ingressHost,
    resources,
    envVars = [],
    configMapData,
    healthCheck,
    autoscaling,
  } = params;

  const manifests: K8sResource[] = [];
  const labels = { app: appName };

  // Deployment
  const deployment: K8sResource = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: appName,
      namespace,
      labels,
    },
    spec: {
      replicas: autoscaling?.enabled ? undefined : replicas,
      selector: {
        matchLabels: labels,
      },
      template: {
        metadata: {
          labels,
        },
        spec: {
          containers: [
            {
              name: appName,
              image,
              ports: [{ containerPort: port }],
              ...(envVars.length > 0 && { env: envVars }),
              ...(resources && { resources }),
              ...(healthCheck?.enabled && {
                livenessProbe: {
                  httpGet: {
                    path: healthCheck.path || '/health',
                    port: healthCheck.port || port,
                  },
                  initialDelaySeconds: healthCheck.initialDelaySeconds || 30,
                  periodSeconds: 10,
                },
                readinessProbe: {
                  httpGet: {
                    path: healthCheck.path || '/health',
                    port: healthCheck.port || port,
                  },
                  initialDelaySeconds: healthCheck.initialDelaySeconds || 5,
                  periodSeconds: 5,
                },
              }),
            },
          ],
        },
      },
    },
  };
  manifests.push(deployment);

  // Service
  const service: K8sResource = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: appName,
      namespace,
      labels,
    },
    spec: {
      type: serviceType,
      selector: labels,
      ports: [
        {
          port,
          targetPort: port,
          protocol: 'TCP',
        },
      ],
    },
  };
  manifests.push(service);

  // ConfigMap
  if (configMapData && Object.keys(configMapData).length > 0) {
    const configMap: K8sResource = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `${appName}-config`,
        namespace,
        labels,
      },
      data: configMapData,
    };
    manifests.push(configMap);
  }

  // Ingress
  if (ingressEnabled) {
    const ingress: K8sResource = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: appName,
        namespace,
        labels,
        annotations: {
          'nginx.ingress.kubernetes.io/rewrite-target': '/',
        },
      },
      spec: {
        rules: [
          {
            host: ingressHost || `${appName}.example.com`,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: appName,
                      port: {
                        number: port,
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    };
    manifests.push(ingress);
  }

  // HPA
  if (autoscaling?.enabled) {
    const hpa: K8sResource = {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: {
        name: appName,
        namespace,
        labels,
      },
      spec: {
        scaleTargetRef: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: appName,
        },
        minReplicas: autoscaling.minReplicas || 1,
        maxReplicas: autoscaling.maxReplicas || 10,
        metrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              target: {
                type: 'Utilization',
                averageUtilization: autoscaling.targetCPUUtilizationPercentage || 70,
              },
            },
          },
        ],
      },
    };
    manifests.push(hpa);
  }

  return Success({ manifests, aiUsed: false });
}

/**
 * Build prompt arguments for K8s manifest generation
 */
function buildK8sManifestPromptArgs(
  params: GenerateK8sManifestsConfig,
  image: string,
): Record<string, unknown> {
  return {
    appName: params.appName || 'app',
    namespace: params.namespace || 'default',
    image,
    replicas: params.replicas || 1,
    port: params.port || 8080,
    serviceType: params.serviceType || 'ClusterIP',
    ingressEnabled: params.ingressEnabled || false,
    ingressHost: params.ingressHost,
    resources: params.resources,
    envVars: params.envVars,
    healthCheckEnabled: params.healthCheck?.enabled || false,
    autoscalingEnabled: params.autoscaling?.enabled || false,
  };
}

// computeHash function removed - was unused after tool wrapper elimination

/**
 * Generate K8s manifests implementation with selective progress reporting
 */
async function generateK8sManifestsImpl(
  params: GenerateK8sManifestsConfig,
  context: ToolContext,
): Promise<Result<GenerateK8sManifestsResult>> {
  // Basic parameter validation
  if (!params || typeof params !== 'object') {
    return Failure('Invalid parameters provided');
  }

  // Progress reporting for complex manifest generation
  const progress = context.progress ? createStandardProgress(context.progress) : undefined;
  const logger = context.logger;
  const timer = createTimer(logger, 'generate-k8s-manifests');

  try {
    const { appName = 'app', namespace = 'default' } = params;

    // Progress: Starting validation and analysis
    if (progress) await progress('VALIDATING');

    // Resolve session with optional sessionId
    const sessionResult = await getSession(params.sessionId, context);

    if (!sessionResult.ok) {
      return Failure(sessionResult.error);
    }

    const session = sessionResult.value;
    const sessionData = session.state as unknown as SessionData;

    // Get build result from session for image tag
    const buildResult = sessionData?.build_result || sessionData?.workflow_state?.build_result;
    const image = params.imageId || buildResult?.tags?.[0] || `${appName}:latest`;

    // Progress: Main execution phase (manifest generation)
    if (progress) await progress('EXECUTING');

    // Generate K8s manifests with AI or fallback
    let result: Result<{ manifests: K8sResource[]; aiUsed: boolean }>;

    try {
      const aiResult = await aiGenerate(logger, context, {
        promptName: 'generate-k8s-manifests',
        promptArgs: buildK8sManifestPromptArgs(params, image),
        expectation: 'yaml' as const,
        maxRetries: 2,
        fallbackBehavior: 'default',
      });

      if (aiResult.ok) {
        const cleaned = stripFencesAndNoise(aiResult.value.content);

        if (isValidKubernetesContent(cleaned)) {
          const manifests = parseK8sManifestsFromAI(cleaned);
          if (manifests.length > 0) {
            result = Success({
              manifests,
              aiUsed: true,
            });
          } else {
            result = generateBasicManifests(params, image);
          }
        } else {
          result = generateBasicManifests(params, image);
        }
      } else {
        result = generateBasicManifests(params, image);
      }
    } catch {
      // Fallback to basic generation
      result = generateBasicManifests(params, image);
    }

    if (!result.ok) {
      return Failure('Failed to generate K8s manifests');
    }

    // Progress: Finalizing results
    if (progress) await progress('FINALIZING');

    // Build resource list
    const resourceList: Array<{ kind: string; name: string; namespace: string }> = [];
    const manifests = result.value.manifests || [];

    for (const manifest of manifests) {
      if (manifest.kind && manifest.metadata?.name) {
        resourceList.push({
          kind: manifest.kind,
          name: manifest.metadata.name,
          namespace: manifest.metadata.namespace || namespace,
        });
      }
    }

    // Convert manifests to YAML string
    const yaml = manifests.map((m: K8sResource) => JSON.stringify(m, null, 2)).join('\n---\n');

    // Write manifests to disk
    const repoPath =
      sessionData?.metadata?.repo_path || sessionData?.workflow_state?.metadata?.repo_path || '.';
    const outputPath = path.join(repoPath, 'k8s');
    await fs.mkdir(outputPath, { recursive: true });

    const manifestPath = path.join(outputPath, 'manifests.yaml');
    await fs.writeFile(manifestPath, yaml, 'utf-8');

    // Check for warnings
    const warnings: string[] = [];
    if (!params.resources) {
      warnings.push('No resource limits specified - consider adding for production');
    }
    if (!params.healthCheck?.enabled) {
      warnings.push('No health checks configured - consider adding for resilience');
    }
    if (params.serviceType === 'LoadBalancer' && !params.ingressEnabled) {
      warnings.push('LoadBalancer service without Ingress may incur cloud costs');
    }

    // Update session with K8s result using standardized helper
    const updateResult = await updateSession(
      session.id,
      {
        k8s_result: {
          manifests: [
            {
              kind: 'Multiple',
              name: appName,
              namespace,
              content: yaml,
              file_path: manifestPath,
            },
          ],
          replicas: params.replicas,
          resources: params.resources,
          output_path: outputPath,
        },
        completed_steps: [...(sessionData?.completed_steps || []), 'k8s'],
        metadata: {
          ...(sessionData?.metadata || {}),
          ai_enhancement_used: result.value.aiUsed || false,
          ai_generation_type: 'k8s-manifests',
          k8s_warnings: warnings,
        },
      },
      context,
    );

    if (!updateResult.ok) {
      logger.warn(
        { error: updateResult.error },
        'Failed to update session, but K8s generation succeeded',
      );
    }

    // Progress: Complete
    if (progress) await progress('COMPLETE');

    timer.end({ outputPath });

    // Return result with file indicator and chain hint
    return Success({
      manifests: yaml,
      outputPath,
      resources: resourceList,
      ...(warnings.length > 0 && { warnings }),
      sessionId: session.id,
      _fileWritten: true,
      _fileWrittenPath: outputPath,
      _chainHint:
        'Next: prepare_cluster to set up Kubernetes or deploy_application if cluster is ready',
    });
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'K8s manifest generation failed');
    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Generate K8s manifests tool with selective progress reporting
 */
export const generateK8sManifests = generateK8sManifestsImpl;
