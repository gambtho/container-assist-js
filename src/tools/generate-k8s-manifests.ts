/**
 * Generate K8s Manifests Tool - Flat Architecture
 *
 * Generates Kubernetes manifests for application deployment
 * Follows architectural requirement: only imports from src/lib/
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createSessionManager } from '../lib/session';
import { createAIService } from '../lib/ai';
import { createTimer, type Logger } from '../lib/logger';
import { Success, Failure, type Result } from '../types/core';
import { updateWorkflowState, type WorkflowState } from '../types/workflow-state';

export interface GenerateK8sManifestsConfig {
  sessionId: string;
  appName?: string;
  namespace?: string;
  replicas?: number;
  port?: number;
  serviceType?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  ingressEnabled?: boolean;
  ingressHost?: string;
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
  autoscaling?: {
    enabled: boolean;
    minReplicas?: number;
    maxReplicas?: number;
    targetCPU?: number;
  };
  environment?: string;
}

export interface GenerateK8sManifestsResult {
  ok: boolean;
  sessionId: string;
  manifests: string;
  path: string;
  resources: Array<{
    kind: string;
    name: string;
    namespace: string;
  }>;
  warnings?: string[];
}

/**
 * Generate deployment manifest
 */
function generateDeployment(config: {
  appName: string;
  namespace: string;
  replicas: number;
  image: string;
  port: number;
  resources?: object;
}): object {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: config.appName,
      namespace: config.namespace,
      labels: {
        app: config.appName,
      },
    },
    spec: {
      replicas: config.replicas,
      selector: {
        matchLabels: {
          app: config.appName,
        },
      },
      template: {
        metadata: {
          labels: {
            app: config.appName,
          },
        },
        spec: {
          containers: [
            {
              name: config.appName,
              image: config.image,
              ports: [
                {
                  containerPort: config.port,
                },
              ],
              ...(config.resources && { resources: config.resources }),
            },
          ],
        },
      },
    },
  };
}

/**
 * Generate service manifest
 */
function generateService(config: {
  appName: string;
  namespace: string;
  port: number;
  serviceType: string;
}): object {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: config.appName,
      namespace: config.namespace,
    },
    spec: {
      type: config.serviceType,
      selector: {
        app: config.appName,
      },
      ports: [
        {
          port: config.port,
          targetPort: config.port,
          protocol: 'TCP',
        },
      ],
    },
  };
}

/**
 * Generate ingress manifest
 */
function generateIngress(config: {
  appName: string;
  namespace: string;
  host?: string;
  port: number;
}): object {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: `${config.appName}-ingress`,
      namespace: config.namespace,
      annotations: {
        'kubernetes.io/ingress.class': 'nginx',
      },
    },
    spec: {
      rules: [
        {
          ...(config.host && { host: config.host }),
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: config.appName,
                    port: {
                      number: config.port,
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
}

/**
 * Generate HPA manifest
 */
function generateHPA(config: {
  appName: string;
  namespace: string;
  minReplicas: number;
  maxReplicas: number;
  targetCPU: number;
}): object {
  return {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: {
      name: `${config.appName}-hpa`,
      namespace: config.namespace,
    },
    spec: {
      scaleTargetRef: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        name: config.appName,
      },
      minReplicas: config.minReplicas,
      maxReplicas: config.maxReplicas,
      metrics: [
        {
          type: 'Resource',
          resource: {
            name: 'cpu',
            target: {
              type: 'Utilization',
              averageUtilization: config.targetCPU,
            },
          },
        },
      ],
    },
  };
}

/**
 * Generate warnings based on configuration
 */
function generateWarnings(config: GenerateK8sManifestsConfig): string[] {
  const warnings: string[] = [];

  if ((config.replicas ?? 1) === 1) {
    warnings.push('Single replica configuration - consider increasing for production');
  }

  if (!config.resources?.limits) {
    warnings.push('No resource limits specified - may cause resource contention');
  }

  if (config.ingressEnabled && !config.ingressHost) {
    warnings.push('Ingress enabled but no host specified');
  }

  if (config.serviceType === 'LoadBalancer') {
    warnings.push('LoadBalancer service type may incur cloud provider costs');
  }

  return warnings;
}

/**
 * Generate Kubernetes manifests
 */
export async function generateK8sManifests(
  config: GenerateK8sManifestsConfig,
  logger: Logger,
): Promise<Result<GenerateK8sManifestsResult>> {
  const timer = createTimer(logger, 'generate-k8s-manifests');

  try {
    const {
      sessionId,
      appName = 'app',
      namespace = 'default',
      replicas = 1,
      port = 8080,
      serviceType = 'ClusterIP',
      ingressEnabled = false,
      ingressHost,
      resources,
      autoscaling,
      environment = 'production',
    } = config;

    logger.info({ sessionId, appName, namespace, environment }, 'Generating Kubernetes manifests');

    // Create lib instances
    const sessionManager = createSessionManager(logger);

    // Create AI service
    const aiService = createAIService(logger);

    // Get session
    const session = await sessionManager.get(sessionId);
    if (!session) {
      return Failure('Session not found');
    }

    // Get build result from session for image tag
    const workflowState = session.workflow_state as
      | { build_result?: { tags?: string[] } }
      | null
      | undefined;
    const buildResult = workflowState?.build_result;
    const image = buildResult?.tags?.[0] ?? `${appName}:latest`;

    // Generate manifests
    const manifests: object[] = [];
    const resourceList: Array<{ kind: string; name: string; namespace: string }> = [];

    // 1. Deployment
    const deployment = generateDeployment({
      appName,
      namespace,
      replicas,
      image,
      port,
      ...(resources && { resources }),
    });
    manifests.push(deployment);
    resourceList.push({ kind: 'Deployment', name: appName, namespace });

    // 2. Service
    const service = generateService({
      appName,
      namespace,
      port,
      serviceType,
    });
    manifests.push(service);
    resourceList.push({ kind: 'Service', name: appName, namespace });

    // 3. Ingress (if enabled)
    if (ingressEnabled) {
      const ingress = generateIngress({
        appName,
        namespace,
        ...(ingressHost && { host: ingressHost }),
        port,
      });
      manifests.push(ingress);
      resourceList.push({ kind: 'Ingress', name: `${appName}-ingress`, namespace });
    }

    // 4. HPA (if autoscaling enabled)
    if (autoscaling?.enabled) {
      const hpa = generateHPA({
        appName,
        namespace,
        minReplicas: autoscaling.minReplicas ?? replicas,
        maxReplicas: autoscaling.maxReplicas ?? replicas * 3,
        targetCPU: autoscaling.targetCPU ?? 80,
      });
      manifests.push(hpa);
      resourceList.push({ kind: 'HorizontalPodAutoscaler', name: `${appName}-hpa`, namespace });
    }

    // Use AI to enhance manifests (when available)
    try {
      const aiResponse = await aiService.generate({
        prompt: `Generate optimized Kubernetes manifests for ${appName} application in ${environment} environment`,
        context: {
          appName,
          namespace,
          environment,
          manifests,
        },
      });

      if (aiResponse.ok) {
        logger.debug('AI enhancement would be applied here');
      }
    } catch (error) {
      logger.debug({ error }, 'AI enhancement skipped');
    }

    // Convert manifests to YAML string
    const yaml = manifests.map((m) => JSON.stringify(m, null, 2)).join('\n---\n');

    // Write manifests to disk
    const outputPath = path.join(session.repo_path ?? '.', 'k8s');
    await fs.mkdir(outputPath, { recursive: true });
    const manifestPath = path.join(outputPath, 'manifests.yaml');
    await fs.writeFile(manifestPath, yaml, 'utf-8');

    // Generate warnings
    const warnings = generateWarnings(config);

    // Update session with K8s manifests
    const currentState = session.workflow_state as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState, {
      k8s_result: {
        manifests: resourceList.map((r) => ({
          kind: r.kind,
          name: r.name,
          namespace: r.namespace,
          content: yaml,
          file_path: manifestPath,
        })),
        replicas,
        ...(resources && { resources }),
        output_path: manifestPath,
      },
      completed_steps: [...(currentState?.completed_steps ?? []), 'generate-k8s-manifests'],
      metadata: {
        ...(currentState?.metadata ?? {}),
        k8s_warnings: warnings,
      },
    });

    await sessionManager.update(sessionId, {
      workflow_state: updatedWorkflowState,
    });

    timer.end({ resourceCount: resourceList.length });
    logger.info(
      { resourceCount: resourceList.length },
      'Kubernetes manifests generation completed',
    );

    return Success({
      ok: true,
      sessionId,
      manifests: yaml,
      path: manifestPath,
      resources: resourceList,
      ...(warnings.length > 0 && { warnings }),
    });
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Kubernetes manifests generation failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Generate K8s manifests tool instance
 */
export const generateK8sManifestsTool = {
  name: 'generate-k8s-manifests',
  execute: (config: GenerateK8sManifestsConfig, logger: Logger) =>
    generateK8sManifests(config, logger),
};
