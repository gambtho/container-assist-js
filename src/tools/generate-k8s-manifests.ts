/**
 * Generate K8s Manifests Tool - Flat Architecture
 *
 * Generates Kubernetes manifests for application deployment
 * Follows architectural requirement: only imports from src/lib/
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createSessionManager } from '../lib/session';
import { createMCPHostAI, type MCPHostAI } from '../lib/mcp-host-ai';
import { createTimer, type Logger } from '../lib/logger';
import {
  Success,
  Failure,
  type Result,
  updateWorkflowState,
  type WorkflowState,
} from '../core/types';

/**
 * Configuration for Kubernetes manifest generation
 */
export interface GenerateK8sManifestsConfig {
  /** Session identifier for storing results */
  sessionId: string;
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
  /** Horizontal pod autoscaling configuration */
  autoscaling?: {
    enabled: boolean;
    minReplicas?: number;
    maxReplicas?: number;
    targetCPU?: number;
  };
  /** Deployment environment (development, staging, production) */
  environment?: string;
  /** Security hardening level */
  securityLevel?: 'standard' | 'strict';
  /** Enable high availability features */
  highAvailability?: boolean;
  /** Enable monitoring/observability */
  monitoring?: boolean;
  /** Include ConfigMap for configuration */
  hasConfig?: boolean;
  hasSecrets?: boolean;
}

/**
 * Result of Kubernetes manifest generation operation
 */
export interface GenerateK8sManifestsResult {
  /** Whether the generation was successful */
  ok: boolean;
  /** Session identifier used for generation */
  sessionId: string;
  /** Generated YAML manifest content */
  manifests: string;
  /** Path where manifests were written */
  path: string;
  /** List of generated Kubernetes resources */
  resources: Array<{
    /** Resource type (Deployment, Service, etc.) */
    kind: string;
    /** Resource name */
    name: string;
    /** Target namespace */
    namespace: string;
  }>;
  /** Optional warnings about the configuration */
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
 * AI-powered manifest generation with advanced features
 */
async function generateAIK8sManifests(
  config: GenerateK8sManifestsConfig,
  mcpHostAI: MCPHostAI,
  logger: Logger,
  image: string,
): Promise<object[]> {
  try {
    const {
      appName = 'app',
      namespace = 'default',
      replicas = 1,
      environment = 'production',
      securityLevel = 'standard',
      highAvailability = false,
      monitoring = false,
      hasConfig = false,
      hasSecrets = false,
    } = config;

    const context = {
      appName,
      namespace,
      environment,
      replicas,
      image,
      resources: config.resources,
      features: {
        autoscaling: environment === 'production',
        podDisruptionBudget: highAvailability,
        networkPolicies: securityLevel === 'strict',
        serviceMonitor: monitoring,
        configMaps: hasConfig,
        secrets: hasSecrets,
      },
      expectsAIResponse: true,
      type: 'kubernetes',
    };

    const prompt = `Generate production-ready Kubernetes manifests with:
    - Deployment with ${replicas} replicas
    - Service (ClusterIP or LoadBalancer based on environment)
    - Ingress with TLS
    ${context.features.autoscaling ? '- HorizontalPodAutoscaler' : ''}
    ${context.features.podDisruptionBudget ? '- PodDisruptionBudget' : ''}
    ${context.features.networkPolicies ? '- NetworkPolicy for security' : ''}
    ${context.features.serviceMonitor ? '- ServiceMonitor for Prometheus' : ''}
    
    Follow best practices for ${environment} environment.`;

    const result = await mcpHostAI.submitPrompt(prompt, context);

    if (result.ok) {
      logger.debug({ appName, environment }, 'AI-enhanced K8s manifests generated');
      return parseK8sManifestsFromAI(result.value);
    } else {
      logger.warn({ error: result.error }, 'AI K8s generation failed, falling back to basic');
    }
  } catch (error) {
    logger.warn({ error }, 'AI K8s generation error, falling back to basic');
  }

  // Fall back to basic manifest generation
  return generateBasicManifests(config, image);
}

/**
 * Parse K8s manifests from AI response
 */
function parseK8sManifestsFromAI(aiResponse: string): object[] {
  try {
    // Look for YAML code blocks first
    const yamlMatch = aiResponse.match(/```(?:yaml|yml)?\n([\s\S]*?)\n```/i);
    const yamlContent = yamlMatch?.[1] ? yamlMatch[1] : aiResponse;

    // Basic YAML parsing - split by document separator
    const documents = yamlContent.split(/^---\s*$/m).filter((doc) => doc.trim());

    const manifests: object[] = [];

    for (const doc of documents) {
      const trimmedDoc = doc.trim();
      if (!trimmedDoc) continue;

      try {
        // Simple YAML to JSON conversion for basic structures
        const manifest = parseYAMLtoJSON(trimmedDoc);
        if (manifest && typeof manifest === 'object' && (manifest as any).kind) {
          manifests.push(manifest);
        }
      } catch (parseError) {
        // If YAML parsing fails, skip this document
        continue;
      }
    }

    return manifests.length > 0 ? manifests : [];
  } catch (error) {
    return [];
  }
}

/**
 * Simple YAML to JSON parser for basic K8s manifests
 * Note: This is a simplified parser for demo purposes
 */
function parseYAMLtoJSON(yamlString: string): object | null {
  try {
    // This is a very basic YAML parser - in production you'd use a proper YAML library
    const lines = yamlString.split('\n');
    const result: any = {};
    let currentObj = result;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIndex = trimmed.indexOf(':');

      if (colonIndex === -1) continue;

      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      // Simple value assignment
      if (value && value !== '') {
        if (value.startsWith('"') && value.endsWith('"')) {
          currentObj[key] = value.slice(1, -1);
        } else if (value === 'true' || value === 'false') {
          currentObj[key] = value === 'true';
        } else if (!isNaN(Number(value))) {
          currentObj[key] = Number(value);
        } else {
          currentObj[key] = value;
        }
      } else {
        currentObj[key] = {};
        currentObj = currentObj[key];
      }
    }

    return result.kind ? result : null;
  } catch (error) {
    return null;
  }
}

/**
 * Generate basic manifests (fallback when AI is unavailable)
 */
function generateBasicManifests(config: GenerateK8sManifestsConfig, image: string): object[] {
  const {
    appName = 'app',
    namespace = 'default',
    replicas = 1,
    port = 8080,
    serviceType = 'ClusterIP',
    ingressEnabled = false,
    ingressHost,
    resources,
    autoscaling,
  } = config;

  const manifests: object[] = [];

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

  // 2. Service
  const service = generateService({
    appName,
    namespace,
    port,
    serviceType,
  });
  manifests.push(service);

  // 3. Ingress (if enabled)
  if (ingressEnabled) {
    const ingress = generateIngress({
      appName,
      namespace,
      ...(ingressHost && { host: ingressHost }),
      port,
    });
    manifests.push(ingress);
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
  }

  return manifests;
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
      environment = 'production',
    } = config;

    logger.info({ sessionId, appName, namespace, environment }, 'Generating Kubernetes manifests');

    // Create lib instances
    const sessionManager = createSessionManager(logger);

    // Create AI service
    const mcpHostAI = createMCPHostAI(logger);

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

    // Generate manifests with AI enhancement when available
    let manifests: object[];
    let aiGenerated = false;

    try {
      if (mcpHostAI.isAvailable()) {
        logger.debug('Using AI-enhanced K8s manifest generation');
        manifests = await generateAIK8sManifests(config, mcpHostAI, logger, image);
        aiGenerated = manifests.length > 0;
      } else {
        logger.debug('Using basic K8s manifest generation');
        manifests = generateBasicManifests(config, image);
      }
    } catch (error) {
      logger.warn({ error }, 'AI manifest generation failed, falling back to basic');
      manifests = generateBasicManifests(config, image);
    }

    // If AI didn't generate any manifests, fall back to basic generation
    if (manifests.length === 0) {
      logger.debug('No AI manifests generated, using basic generation');
      manifests = generateBasicManifests(config, image);
      aiGenerated = false;
    }

    // Build resource list from manifests
    const resourceList: Array<{ kind: string; name: string; namespace: string }> = [];
    for (const manifest of manifests) {
      const m = manifest as any;
      if (m.kind && m.metadata?.name) {
        resourceList.push({
          kind: m.kind,
          name: m.metadata.name,
          namespace: m.metadata.namespace || namespace,
        });
      }
    }

    // Store AI generation info in workflow state
    if (aiGenerated) {
      const currentState = session.workflow_state as WorkflowState | undefined;
      const updatedContext = updateWorkflowState(currentState ?? {}, {
        metadata: {
          ...(currentState?.metadata ?? {}),
          ai_enhancement_used: true,
          ai_generation_type: 'kubernetes',
          timestamp: new Date().toISOString(),
        },
      });
      await sessionManager.update(sessionId, {
        workflow_state: updatedContext,
      });
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
    const updatedWorkflowState = updateWorkflowState(currentState ?? {}, {
      k8s_result: {
        manifests: resourceList.map((r) => ({
          kind: r.kind,
          name: r.name,
          namespace: r.namespace,
          content: yaml,
          file_path: manifestPath,
        })),
        replicas: config.replicas ?? 1,
        ...(config.resources && { resources: config.resources }),
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
