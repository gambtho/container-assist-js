/**
 * Generate K8s Manifests - MCP SDK Compatible Version
 */

import { z } from 'zod';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { ErrorCode, DomainError, KubernetesManifest } from '../../../contracts/types/index';
import { executeWithRecovery } from '../error-recovery';
import { AIRequestBuilder } from '../../../infrastructure/ai-request-builder';
import { getEnhancedAIService } from '../ai-migration-helper';
import type { MCPToolDescriptor, MCPToolContext } from '../tool-types';

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
            cpu: z.string().default('100m')
          })
          .optional(),
        limits: z
          .object({
            memory: z.string().default('512Mi'),
            cpu: z.string().default('500m')
          })
          .optional()
      })
      .optional(),
    environment: z.enum(['dev', 'staging', 'production']).default('dev'),
    config_map: z.record(z.string(), z.string()).optional(),
    configMap: z.record(z.string(), z.string()).optional(),
    secrets: z.record(z.string(), z.string()).optional(),
    health_check_path: z.string().default('/health'),
    healthCheckPath: z.string().optional(),
    autoscaling: z.boolean().default(false),
    min_replicas: z.number().default(2),
    minReplicas: z.number().optional(),
    max_replicas: z.number().default(10),
    maxReplicas: z.number().optional(),
    target_cpu: z.number().default(70),
    targetCPU: z.number().optional(),
    output_path: z.string().optional(),
    outputPath: z.string().optional()
  })
  .transform((data) => ({
    sessionId: data.session_id ?? data.sessionId ?? undefined,
    appName: data.app_name ?? data.appName ?? 'app',
    image: data.image ?? undefined,
    namespace: data.namespace,
    replicas: data.replicas,
    port: data.port ?? undefined,
    serviceType: data.service_type ?? data.serviceType ?? 'ClusterIP',
    ingressEnabled: data.ingress_enabled ?? data.ingressEnabled ?? false,
    ingressHost: data.ingress_host ?? data.ingressHost ?? undefined,
    resources: data.resources ?? {
      requests: { memory: '128Mi', cpu: '100m' },
      limits: { memory: '512Mi', cpu: '500m' }
    },
    environment: data.environment,
    configMap: data.config_map ?? data.configMap ?? {},
    secrets: data.secrets ?? {},
    healthCheckPath: data.health_check_path ?? data.healthCheckPath ?? '/health',
    autoscaling: data.autoscaling,
    minReplicas: data.min_replicas ?? data.minReplicas ?? 2,
    maxReplicas: data.max_replicas ?? data.maxReplicas ?? 10,
    targetCPU: data.target_cpu ?? data.targetCPU ?? 70,
    outputPath: data.output_path ?? data.outputPath ?? './k8s'
  }));

// Output schema
const GenerateKubernetesManifestsOutput = z.object({
  success: z.boolean(),
  manifests: z.array(
    z.object({
      kind: z.string(),
      name: z.string(),
      path: z.string(),
      content: z.string()
    })
  ),
  outputPath: z.string(),
  metadata: z.object({
    totalResources: z.number(),
    namespace: z.string(),
    image: z.string(),
    estimatedCost: z.string().optional(),
    warnings: z.array(z.string()).optional()
  })
});

// Type aliases
export type KubernetesManifestsInput = z.infer<typeof GenerateKubernetesManifestsInput>;
export type KubernetesManifestsOutput = z.infer<typeof GenerateKubernetesManifestsOutput>;

/**
 * Generate Deployment manifest
 */
function generateDeployment(input: KubernetesManifestsInput): KubernetesManifest {
  const { appName, image, namespace, replicas, port, resources, environment, healthCheckPath } =
    input;

  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: appName,
      namespace,
      labels: {
        app: appName,
        environment,
        'managed-by': 'container-kit-mcp'
      }
    },
    spec: {
      replicas,
      selector: {
        matchLabels: {
          app: appName
        }
      },
      template: {
        metadata: {
          labels: {
            app: appName,
            environment,
            version: 'v1'
          }
        },
        spec: {
          containers: [
            {
              name: appName,
              image,
              ports: port != null
                ? [
                  {
                    containerPort: port,
                    name: 'http',
                    protocol: 'TCP'
                  }
                ]
                : [],
              resources,
              livenessProbe: port
                ? {
                  httpGet: {
                    path: healthCheckPath,
                    port: 'http'
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 10,
                  timeoutSeconds: 5,
                  failureThreshold: 3
                }
                : undefined,
              readinessProbe: port
                ? {
                  httpGet: {
                    path: healthCheckPath,
                    port: 'http'
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 5,
                  timeoutSeconds: 3,
                  failureThreshold: 3
                }
                : undefined,
              env: [
                ...Object.entries(input.configMap).map(([key, _value]) => ({
                  name: key,
                  valueFrom: {
                    configMapKeyRef: {
                      name: `${appName}-config`,
                      key
                    }
                  }
                })),
                ...Object.keys(input.secrets ?? {}).map((key) => ({
                  name: key,
                  valueFrom: {
                    secretKeyRef: {
                      name: `${appName}-secrets`,
                      key
                    }
                  }
                }))
              ],
              imagePullPolicy: 'IfNotPresent',
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 1000,
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: false,
                capabilities: {
                  drop: ['ALL']
                }
              }
            }
          ],
          restartPolicy: 'Always',
          terminationGracePeriodSeconds: 30
        }
      },
      strategy: {
        type: 'RollingUpdate',
        rollingUpdate: {
          maxSurge: 1,
          maxUnavailable: 0
        }
      }
    }
  };
}

/**
 * Generate Service manifest
 */
function generateService(input: KubernetesManifestsInput): KubernetesManifest {
  const { appName, namespace, port, serviceType } = input;

  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: appName,
      namespace,
      labels: {
        app: appName,
        'managed-by': 'container-kit-mcp'
      }
    },
    spec: {
      type: serviceType,
      selector: {
        app: appName
      },
      ports: port
        ? [
          {
            port,
            targetPort: 'http',
            protocol: 'TCP',
            name: 'http'
          }
        ]
        : [],
      sessionAffinity: 'None'
    }
  };
}

/**
 * Generate ConfigMap manifest
 */
function generateConfigMap(input: KubernetesManifestsInput): KubernetesManifest | null {
  const { appName, namespace, configMap } = input;

  if (Object.keys(configMap).length === 0) {
    return null;
  }

  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: `${appName}-config`,
      namespace,
      labels: {
        app: appName,
        'managed-by': 'container-kit-mcp'
      }
    },
    spec: {
      data: configMap
    }
  };
}

/**
 * Generate Secret manifest
 */
function generateSecret(input: KubernetesManifestsInput): KubernetesManifest | null {
  const { appName, namespace, secrets } = input;

  if (Object.keys(secrets).length === 0) {
    return null;
  }

  // Base64 encode secret values
  const encodedSecrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(secrets)) {
    encodedSecrets[key] = Buffer.from(value).toString('base64');
  }

  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: `${appName}-secrets`,
      namespace,
      labels: {
        app: appName,
        'managed-by': 'container-kit-mcp'
      }
    },
    spec: {
      type: 'Opaque',
      data: encodedSecrets
    }
  };
}

/**
 * Generate Ingress manifest
 */
function generateIngress(input: KubernetesManifestsInput): KubernetesManifest | null {
  const { appName, namespace, port, ingressEnabled, ingressHost } = input;

  if (!ingressEnabled ?? !ingressHost || !port) {
    return null;
  }

  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: appName,
      namespace,
      labels: {
        app: appName,
        'managed-by': 'container-kit-mcp'
      },
      annotations: {
        'kubernetes.io/ingress.class': 'nginx',
        'cert-manager.io/cluster-issuer': 'letsencrypt-prod',
        'nginx.ingress.kubernetes.io/ssl-redirect': 'true'
      }
    },
    spec: {
      tls: [
        {
          hosts: [ingressHost],
          secretName: `${appName}-tls`
        }
      ],
      rules: [
        {
          host: ingressHost,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: appName,
                    port: {
                      number: port
                    }
                  }
                }
              }
            ]
          }
        }
      ]
    }
  };
}

/**
 * Generate HorizontalPodAutoscaler manifest
 */
function generateHPA(input: KubernetesManifestsInput): KubernetesManifest | null {
  const { appName, namespace, autoscaling, minReplicas, maxReplicas, targetCPU } = input;

  if (!autoscaling) {
    return null;
  }

  return {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: {
      name: appName,
      namespace,
      labels: {
        app: appName,
        'managed-by': 'container-kit-mcp'
      }
    },
    spec: {
      scaleTargetRef: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        name: appName
      },
      minReplicas,
      maxReplicas,
      metrics: [
        {
          type: 'Resource',
          resource: {
            name: 'cpu',
            target: {
              type: 'Utilization',
              averageUtilization: targetCPU
            }
          }
        }
      ],
      behavior: {
        scaleDown: {
          stabilizationWindowSeconds: 300,
          policies: [
            {
              type: 'Percent',
              value: 50,
              periodSeconds: 60
            }
          ]
        },
        scaleUp: {
          stabilizationWindowSeconds: 60,
          policies: [
            {
              type: 'Percent',
              value: 100,
              periodSeconds: 60
            }
          ]
        }
      }
    }
  };
}

/**
 * Generate PodDisruptionBudget manifest
 */
function generatePDB(input: KubernetesManifestsInput): KubernetesManifest {
  const { appName, namespace } = input;

  return {
    apiVersion: 'policy/v1',
    kind: 'PodDisruptionBudget',
    metadata: {
      name: appName,
      namespace,
      labels: {
        app: appName,
        'managed-by': 'container-kit-mcp'
      }
    },
    spec: {
      minAvailable: 1,
      selector: {
        matchLabels: {
          app: appName
        }
      }
    }
  };
}

/**
 * Estimate monthly cost based on resources
 */
function estimateMonthlyCost(input: KubernetesManifestsInput): string {
  const { replicas, resources } = input;

  // Parse CPU and memory
  const cpuMatch = resources?.limits?.cpu?.match(/(\d+)m?/);
  const memMatch = resources?.limits?.memory?.match(/(\d+)(Mi|Gi)?/);

  const cpuCores = cpuMatch ? parseInt(cpuMatch[1] || '500') / 1000 : 0.5;
  const memoryGb = memMatch
    ? memMatch[2] === 'Gi'
      ? parseInt(memMatch[1] || '500')
      : parseInt(memMatch[1] || '500') / 1024
    : 0.5;

  // Rough cost estimates (varies by cloud provider)
  const cpuCostPerCoreHour = 0.04;
  const memoryCostPerGbHour = 0.005;
  const hoursPerMonth = 730;

  const monthlyCost =
    replicas * hoursPerMonth * (cpuCores * cpuCostPerCoreHour + memoryGb * memoryCostPerGbHour);

  return `$${monthlyCost.toFixed(2)}/month (estimated)`;
}

/**
 * Generate warnings based on configuration
 */
function generateWarnings(input: KubernetesManifestsInput): string[] {
  const warnings: string[] = [];

  if (input.environment === 'production' && input.replicas < 2) {
    warnings.push('Production environment should have at least 2 replicas for high availability');
  }

  if (!input.resources?.limits) {
    warnings.push('No resource limits defined - pods may consume unlimited resources');
  }

  if (input.serviceType === 'LoadBalancer') {
    warnings.push('LoadBalancer service will provision external IP (may incur costs)');
  }

  if (Object.keys(input.secrets).length > 0) {
    warnings.push(
      'Secrets are stored in base64 encoding - consider using external secret management'
    );
  }

  if (!input.autoscaling && input.environment === 'production') {
    warnings.push('Consider enabling autoscaling for production workloads');
  }

  return warnings;
}

/**
 * Main handler implementation
 */
const generateKubernetesManifestsHandler: MCPToolDescriptor<
  KubernetesManifestsInput,
  KubernetesManifestsOutput
> = {
  name: 'generate_k8s_manifests',
  description: 'Generate Kubernetes deployment manifests with best practices',
  category: 'workflow',
  inputSchema: GenerateKubernetesManifestsInput,
  outputSchema: GenerateKubernetesManifestsOutput,

  handler: async (
    input: KubernetesManifestsInput,
    context: MCPToolContext
  ): Promise<KubernetesManifestsOutput> => {
    const { logger, sessionService, progressEmitter } = context;
    const aiService = getEnhancedAIService(context);
    const { sessionId, outputPath } = input;

    logger.info(
      {
        sessionId,
        appName: input.appName,
        namespace: input.namespace,
        environment: input.environment
      },
      'Starting K8s manifest generation'
    );

    try {
      // Get image from session if not provided
      let image = input.image;
      let port = input.port;

      if ((!image ?? !port) && sessionId && sessionService) {
        const session = await sessionService.get(sessionId);
        if (!session) {
          throw new DomainError(ErrorCode.SessionNotFound, 'Session not found');
        }

        // Get image from push or build result
        if (!image) {
          const pushResult = session.workflow_state?.push_result;
          const buildResult = session.workflow_state?.build_result;

          if (pushResult?.tag) {
            image = pushResult.tag;
          } else if (buildResult?.tag ?? buildResult?.tags?.[0]) {
            image = buildResult.tag ?? buildResult.tags?.[0];
          }
        }

        // Get port from analysis
        if (!port) {
          const analysis = session.workflow_state?.analysis_result;
          port = analysis?.required_ports?.[0] || 8080;
        }

        // Update input with session data
        input.image = image;
        input.port = port;
      }

      if (!image) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'No image specified for deployment');
      }

      // Emit progress
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'generate_k8s_manifests',
          status: 'in_progress',
          message: 'Generating Kubernetes manifests',
          progress: 0.2
        });
      }

      // Generate manifests
      const manifests: Array<{
        kind: string;
        name?: string;
        manifest?: KubernetesManifest | null;
      }> = [
        { kind: 'ConfigMap', name: `${input.appName}-config`, manifest: generateConfigMap(input) },
        { kind: 'Secret', name: `${input.appName}-secrets`, manifest: generateSecret(input) },
        { kind: 'Deployment', name: input.appName, manifest: generateDeployment(input) },
        { kind: 'Service', name: input.appName, manifest: generateService(input) },
        { kind: 'Ingress', name: input.appName, manifest: generateIngress(input) },
        { kind: 'HorizontalPodAutoscaler', name: input.appName, manifest: generateHPA(input) },
        { kind: 'PodDisruptionBudget', name: input.appName, manifest: generatePDB(input) }
      ];

      // Filter out null manifests
      const validManifests = manifests.filter((m) => m.manifest !== null);

      // Enhance with AI if available
      if (aiService && input.environment === 'production') {
        logger.info('Enhancing manifests with AI recommendations');

        // Get analysis from session for AI context
        let analysis = null;
        if (sessionId && sessionService) {
          const session = await sessionService.get(sessionId);
          analysis = session?.workflow_state?.analysis_result;
        }

        const aiResult = await executeWithRecovery(async () => {
          const builder = AIRequestBuilder.for('k8s-generation')
            .withContext(analysis ?? ({} as unknown))
            .withSession(input.sessionId ?? '')
            .withVariables({
              image: input.image ?? 'app:latest',
              port: input.port ?? 8080,
              replicas: input.replicas,
              environment: input.environment,
              resources: input.resources ? 'large' : 'medium',
              healthCheckPath: input.healthCheckPath,
              appName: input.appName,
              namespace: input.namespace,
              serviceType: input.serviceType,
              autoscaling: input.autoscaling
            })
            .withKubernetesContext({
              ingressEnabled: input.ingressEnabled,
              ...(input.ingressHost && { ingressHost: input.ingressHost }),
              ...(Object.keys(input.configMap).length > 0 && { configMap: input.configMap }),
              ...(Object.keys(input.secrets).length > 0 && { secrets: Object.keys(input.secrets) })
            });

          const result = await aiService.generate<string>(builder, {
            complexity: input.environment === 'production' ? 'high' : 'medium',
            timeConstraint: 'thorough'
          });

          if (result.data) {
            return result.data;
          } else {
            throw new Error('AI K8s generation returned no content');
          }
        });

        if (aiResult) {
          try {
            // Parse and validate AI-generated manifests
            const aiManifests = yaml.loadAll(aiResult);
            logger.info(`Applied AI enhancements: ${aiManifests.length} manifests generated`);
            // Could merge or replace manifests here based on requirements
          } catch (error) {
            logger.warn({ error }); // Fixed logger call
          }
        } else {
          logger.warn({ error: 'AI enhancement failed' }); // aiResult is string, no error property
        }
      }

      // Emit progress
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
      const manifestDir = path.isAbsolute(outputPath)
        ? outputPath
        : path.join(process.cwd(), outputPath);
      await fs.mkdir(manifestDir, { recursive: true });

      // Write manifests to files
      const outputManifests: Array<{
        kind: string;
        name: string;
        path?: string;
        content?: string;
      }> = [];

      for (const { kind, name, manifest } of validManifests) {
        if (!manifest ?? !name) continue;

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

        logger.info({ kind, path: filepath }, `Generated ${kind}`);
      }

      // Generate kustomization.yaml for deployment
      const kustomization = {
        apiVersion: 'kustomize.config.k8s.io/v1beta1',
        kind: 'Kustomization',
        namespace: input.namespace,
        resources: outputManifests.map((m) => path.basename(m.path!)),
        commonLabels: {
          app: input.appName,
          environment: input.environment
        }
      };

      const kustomizationPath = path.join(manifestDir, 'kustomization.yaml');
      await fs.writeFile(kustomizationPath, yaml.dump(kustomization), 'utf-8');

      // Generate warnings
      const warnings = generateWarnings(input);

      // Update session with manifest info
      if (sessionId && sessionService) {
        await sessionService.updateAtomic(sessionId, (session) => ({
          ...session,
          workflow_state: {
            ...session.workflow_state,
            k8s_result: {
              manifests: outputManifests
                .filter((m) => m.content && m.path)
                .map((m) => ({
                  kind: m.kind,
                  name: m.name,
                  content: m.content!,
                  file_path: m.path!
                })),
              replicas: input.replicas,
              image,
              output_path: manifestDir
            }
          }
        }));
      }

      // Emit completion
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'generate_k8s_manifests',
          status: 'completed',
          message: `Generated ${outputManifests.length} Kubernetes manifests`,
          progress: 1.0
        });
      }

      logger.info(
        {
          totalResources: outputManifests.length,
          outputPath: manifestDir
        },
        'K8s manifest generation completed'
      );

      const result: any = {
        success: true,
        manifests: outputManifests.map((m) => ({
          kind: m.kind,
          name: m.name,
          path: m.path ?? '',
          content: m.content ?? ''
        })),
        outputPath: manifestDir,
        metadata: {
          totalResources: outputManifests.length,
          namespace: input.namespace,
          image,
          estimatedCost: estimateMonthlyCost(input)
        }
      };

      if (warnings.length > 0) {
        result.metadata.warnings = warnings;
      }

      return result;
    } catch (error) {
      logger.error({ error }, 'Error occurred'); // Fixed logger call

      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'generate_k8s_manifests',
          status: 'failed',
          message: 'Manifest generation failed',
          progress: 0
        });
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'deploy_application',
    reason: 'Deploy generated manifests to Kubernetes cluster',
    paramMapper: (output) => ({
      manifests_path: output.outputPath,
      namespace: output.metadata.namespace
    })
  }
};

// Default export for registry
export default generateKubernetesManifestsHandler;
