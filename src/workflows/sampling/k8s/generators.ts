import { Result, Success, Failure } from '../../../types/core.js';
import type { Logger } from 'pino';
import { Candidate, GenerationContext } from '../../../lib/sampling.js';
import { BaseCandidateGenerator } from '../base.js';

export interface K8sContext extends GenerationContext {
  appName?: string;
  namespace?: string;
  replicas?: number;
  cpuRequest?: string;
  cpuLimit?: string;
  memoryRequest?: string;
  memoryLimit?: string;
  port?: number;
  serviceType?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  imageName?: string;
  imageTag?: string;
  environment?: 'development' | 'staging' | 'production';
  enableIngress?: boolean;
  enableHPA?: boolean;
  persistentVolume?: {
    size: string;
    storageClass?: string;
    accessMode?: string;
  };
}

export interface K8sManifestSet {
  deployment: unknown;
  service: unknown;
  configMap?: unknown;
  ingress?: unknown;
  hpa?: unknown;
  pvc?: unknown;
}

// K8s manifest generation strategies
export class K8sManifestGenerator extends BaseCandidateGenerator<K8sManifestSet> {
  readonly name = 'k8s-manifest-generator';
  readonly supportedTypes = ['kubernetes'];

  private strategies = [
    new BasicDeploymentStrategy(),
    new StatefulSetStrategy(),
    new MicroserviceStrategy(),
    new HighAvailabilityStrategy(),
    new ProductionReadyStrategy(),
  ];

  constructor(logger: Logger) {
    super(logger);
  }

  async generate(context: GenerationContext, count = 3): Promise<Result<Candidate<K8sManifestSet>[]>> {
    try {
      this.logger.debug({ context, count }, 'Generating K8s manifest candidates');

      const k8sContext = context as K8sContext;
      const candidates: Candidate<K8sManifestSet>[] = [];

      const selectedStrategies = this.selectStrategies(count);
      const progressToken = `k8s-gen-${context.sessionId}`;
      this.notifyProgress(progressToken, 0, 'Starting K8s manifest generation');

      for (let i = 0; i < selectedStrategies.length; i++) {
        const strategy = selectedStrategies[i];

        try {
          const manifests = await strategy.generateManifests(k8sContext);
          const candidateId = this.createCandidateId(strategy.name, context);

          const candidate: Candidate<K8sManifestSet> = {
            id: candidateId,
            content: manifests,
            metadata: {
              strategy: strategy.name,
              source: 'k8s-manifest-generator',
              confidence: strategy.confidence,
              estimatedDeployTime: strategy.estimatedDeployTime,
              resourceEfficiency: strategy.resourceEfficiency,
              securityRating: strategy.securityRating,
            },
            generatedAt: new Date(),
          };

          candidates.push(candidate);

          const progress = Math.round(((i + 1) / selectedStrategies.length) * 100);
          this.notifyProgress(progressToken, progress, `Generated candidate ${i + 1}/${selectedStrategies.length}`);

        } catch (error) {
          this.logger.warn({ strategy: strategy.name, error }, 'Strategy failed, skipping');
          continue;
        }
      }

      if (candidates.length === 0) {
        return Failure('No K8s manifest candidates could be generated');
      }

      this.logger.debug({ count: candidates.length }, 'Successfully generated K8s manifest candidates');
      return Success(candidates);

    } catch (error) {
      const errorMessage = `K8s manifest generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error({ error, context }, errorMessage);
      return Failure(errorMessage);
    }
  }

  async validate(candidate: Candidate<K8sManifestSet>): Promise<Result<boolean>> {
    try {
      const manifests = candidate.content;

      // Basic validation checks
      const validationChecks = [
        this.hasRequiredDeployment(manifests),
        this.hasRequiredService(manifests),
        this.hasValidResourceLimits(manifests),
        this.hasSecurityContext(manifests),
      ];

      const isValid = validationChecks.every(check => check);
      return Success(isValid);

    } catch (error) {
      return Failure(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private selectStrategies(count: number): K8sManifestStrategy[] {
    const maxStrategies = Math.min(count, this.strategies.length);
    return this.strategies.slice(0, maxStrategies);
  }

  private hasRequiredDeployment(manifests: K8sManifestSet): boolean {
    const deployment = manifests.deployment as any;
    return deployment?.apiVersion && deployment.kind && deployment.metadata?.name;
  }

  private hasRequiredService(manifests: K8sManifestSet): boolean {
    const service = manifests.service as any;
    return service?.apiVersion && service.kind && service.metadata?.name;
  }

  private hasValidResourceLimits(manifests: K8sManifestSet): boolean {
    const deployment = manifests.deployment as any;
    const containers = deployment?.spec?.template?.spec?.containers || [];

    return containers.every((container: any) => {
      const resources = container.resources;
      return resources && (resources.limits || resources.requests);
    });
  }

  private hasSecurityContext(manifests: K8sManifestSet): boolean {
    const deployment = manifests.deployment as any;
    const containers = deployment?.spec?.template?.spec?.containers || [];

    return containers.some((container: any) =>
      container.securityContext?.runAsNonRoot,
    );
  }
}

// Abstract strategy interface
abstract class K8sManifestStrategy {
  abstract readonly name: string;
  abstract readonly confidence: number;
  abstract readonly estimatedDeployTime: number; // seconds
  abstract readonly resourceEfficiency: number; // 1-10 scale
  abstract readonly securityRating: number; // 1-10 scale

  abstract generateManifests(context: K8sContext): Promise<K8sManifestSet>;
}

// Strategy implementations
class BasicDeploymentStrategy extends K8sManifestStrategy {
  readonly name = 'basic-deployment';
  readonly confidence = 0.8;
  readonly estimatedDeployTime = 30; // 30 seconds
  readonly resourceEfficiency = 6;
  readonly securityRating = 6;

  async generateManifests(context: K8sContext): Promise<K8sManifestSet> {
    const appName = context.appName || 'app';
    const namespace = context.namespace || 'default';
    const replicas = context.replicas || 2;
    const port = context.port || 3000;
    const imageName = context.imageName || 'app';
    const imageTag = context.imageTag || 'latest';

    const deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: appName,
        namespace,
        labels: {
          app: appName,
          version: 'v1',
        },
      },
      spec: {
        replicas,
        selector: {
          matchLabels: {
            app: appName,
          },
        },
        template: {
          metadata: {
            labels: {
              app: appName,
              version: 'v1',
            },
          },
          spec: {
            containers: [
              {
                name: appName,
                image: `${imageName}:${imageTag}`,
                ports: [
                  {
                    containerPort: port,
                    protocol: 'TCP',
                  },
                ],
                resources: {
                  requests: {
                    cpu: context.cpuRequest || '100m',
                    memory: context.memoryRequest || '128Mi',
                  },
                  limits: {
                    cpu: context.cpuLimit || '500m',
                    memory: context.memoryLimit || '512Mi',
                  },
                },
                livenessProbe: {
                  httpGet: {
                    path: '/health',
                    port,
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 10,
                },
                readinessProbe: {
                  httpGet: {
                    path: '/ready',
                    port,
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 5,
                },
              },
            ],
          },
        },
      },
    };

    const service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: appName,
        namespace,
        labels: {
          app: appName,
        },
      },
      spec: {
        type: context.serviceType || 'ClusterIP',
        ports: [
          {
            port: 80,
            targetPort: port,
            protocol: 'TCP',
          },
        ],
        selector: {
          app: appName,
        },
      },
    };

    return { deployment, service };
  }
}

class StatefulSetStrategy extends K8sManifestStrategy {
  readonly name = 'stateful-set';
  readonly confidence = 0.9;
  readonly estimatedDeployTime = 60; // 1 minute
  readonly resourceEfficiency = 8;
  readonly securityRating = 8;

  async generateManifests(context: K8sContext): Promise<K8sManifestSet> {
    const appName = context.appName || 'app';
    const namespace = context.namespace || 'default';
    const replicas = context.replicas || 3;
    const port = context.port || 3000;
    const imageName = context.imageName || 'app';
    const imageTag = context.imageTag || 'latest';

    const deployment = {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: {
        name: appName,
        namespace,
      },
      spec: {
        serviceName: appName,
        replicas,
        selector: {
          matchLabels: {
            app: appName,
          },
        },
        template: {
          metadata: {
            labels: {
              app: appName,
            },
          },
          spec: {
            securityContext: {
              runAsNonRoot: true,
              runAsUser: 1001,
              fsGroup: 2000,
            },
            containers: [
              {
                name: appName,
                image: `${imageName}:${imageTag}`,
                ports: [
                  {
                    containerPort: port,
                    name: 'http',
                  },
                ],
                securityContext: {
                  allowPrivilegeEscalation: false,
                  readOnlyRootFilesystem: true,
                  runAsNonRoot: true,
                },
                resources: {
                  requests: {
                    cpu: context.cpuRequest || '200m',
                    memory: context.memoryRequest || '256Mi',
                  },
                  limits: {
                    cpu: context.cpuLimit || '1000m',
                    memory: context.memoryLimit || '1Gi',
                  },
                },
                volumeMounts: [
                  {
                    name: 'data',
                    mountPath: '/app/data',
                  },
                ],
              },
            ],
          },
        },
        volumeClaimTemplates: [
          {
            metadata: {
              name: 'data',
            },
            spec: {
              accessModes: ['ReadWriteOnce'],
              storageClassName: context.persistentVolume?.storageClass || 'standard',
              resources: {
                requests: {
                  storage: context.persistentVolume?.size || '1Gi',
                },
              },
            },
          },
        ],
      },
    };

    const service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: appName,
        namespace,
      },
      spec: {
        clusterIP: 'None',
        ports: [
          {
            port: 80,
            targetPort: 'http',
          },
        ],
        selector: {
          app: appName,
        },
      },
    };

    return { deployment, service };
  }
}

class MicroserviceStrategy extends K8sManifestStrategy {
  readonly name = 'microservice';
  readonly confidence = 0.85;
  readonly estimatedDeployTime = 45;
  readonly resourceEfficiency = 7;
  readonly securityRating = 8;

  async generateManifests(context: K8sContext): Promise<K8sManifestSet> {
    const appName = context.appName || 'app';
    const namespace = context.namespace || 'default';
    const replicas = context.replicas || 2;
    const port = context.port || 3000;
    const imageName = context.imageName || 'app';
    const imageTag = context.imageTag || 'latest';

    const deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: appName,
        namespace,
        labels: {
          app: appName,
          tier: 'backend',
          version: 'v1',
        },
      },
      spec: {
        replicas,
        strategy: {
          type: 'RollingUpdate',
          rollingUpdate: {
            maxSurge: 1,
            maxUnavailable: 0,
          },
        },
        selector: {
          matchLabels: {
            app: appName,
            tier: 'backend',
          },
        },
        template: {
          metadata: {
            labels: {
              app: appName,
              tier: 'backend',
              version: 'v1',
            },
          },
          spec: {
            securityContext: {
              runAsNonRoot: true,
              runAsUser: 1000,
            },
            containers: [
              {
                name: appName,
                image: `${imageName}:${imageTag}`,
                ports: [
                  {
                    containerPort: port,
                    name: 'http',
                  },
                ],
                env: [
                  {
                    name: 'NODE_ENV',
                    value: context.environment || 'production',
                  },
                  {
                    name: 'PORT',
                    value: port.toString(),
                  },
                ],
                securityContext: {
                  allowPrivilegeEscalation: false,
                  readOnlyRootFilesystem: true,
                  runAsNonRoot: true,
                },
                resources: {
                  requests: {
                    cpu: context.cpuRequest || '100m',
                    memory: context.memoryRequest || '128Mi',
                  },
                  limits: {
                    cpu: context.cpuLimit || '500m',
                    memory: context.memoryLimit || '512Mi',
                  },
                },
                livenessProbe: {
                  httpGet: {
                    path: '/health',
                    port: 'http',
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 10,
                  timeoutSeconds: 5,
                  failureThreshold: 3,
                },
                readinessProbe: {
                  httpGet: {
                    path: '/ready',
                    port: 'http',
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 5,
                  timeoutSeconds: 3,
                  failureThreshold: 3,
                },
              },
            ],
          },
        },
      },
    };

    const service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: appName,
        namespace,
        labels: {
          app: appName,
        },
      },
      spec: {
        type: 'ClusterIP',
        ports: [
          {
            port: 80,
            targetPort: 'http',
            protocol: 'TCP',
            name: 'http',
          },
        ],
        selector: {
          app: appName,
          tier: 'backend',
        },
      },
    };

    const configMap = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `${appName}-config`,
        namespace,
      },
      data: {
        'app.properties': `
# Application Configuration
app.name=${appName}
app.version=v1
app.environment=${context.environment || 'production'}
        `,
      },
    };

    return { deployment, service, configMap };
  }
}

class HighAvailabilityStrategy extends K8sManifestStrategy {
  readonly name = 'high-availability';
  readonly confidence = 0.95;
  readonly estimatedDeployTime = 90;
  readonly resourceEfficiency = 9;
  readonly securityRating = 9;

  async generateManifests(context: K8sContext): Promise<K8sManifestSet> {
    const appName = context.appName || 'app';
    const namespace = context.namespace || 'default';
    const replicas = Math.max(context.replicas || 3, 3); // Minimum 3 for HA
    const port = context.port || 3000;
    const imageName = context.imageName || 'app';
    const imageTag = context.imageTag || 'latest';

    const deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: appName,
        namespace,
        labels: {
          app: appName,
          tier: 'backend',
          version: 'v1',
        },
      },
      spec: {
        replicas,
        strategy: {
          type: 'RollingUpdate',
          rollingUpdate: {
            maxSurge: '25%',
            maxUnavailable: '25%',
          },
        },
        selector: {
          matchLabels: {
            app: appName,
          },
        },
        template: {
          metadata: {
            labels: {
              app: appName,
              tier: 'backend',
              version: 'v1',
            },
          },
          spec: {
            affinity: {
              podAntiAffinity: {
                preferredDuringSchedulingIgnoredDuringExecution: [
                  {
                    weight: 100,
                    podAffinityTerm: {
                      labelSelector: {
                        matchExpressions: [
                          {
                            key: 'app',
                            operator: 'In',
                            values: [appName],
                          },
                        ],
                      },
                      topologyKey: 'kubernetes.io/hostname',
                    },
                  },
                ],
              },
            },
            securityContext: {
              runAsNonRoot: true,
              runAsUser: 1000,
              fsGroup: 2000,
            },
            containers: [
              {
                name: appName,
                image: `${imageName}:${imageTag}`,
                ports: [
                  {
                    containerPort: port,
                    name: 'http',
                  },
                ],
                securityContext: {
                  allowPrivilegeEscalation: false,
                  readOnlyRootFilesystem: true,
                  runAsNonRoot: true,
                  capabilities: {
                    drop: ['ALL'],
                  },
                },
                resources: {
                  requests: {
                    cpu: context.cpuRequest || '200m',
                    memory: context.memoryRequest || '256Mi',
                  },
                  limits: {
                    cpu: context.cpuLimit || '1000m',
                    memory: context.memoryLimit || '1Gi',
                  },
                },
                livenessProbe: {
                  httpGet: {
                    path: '/health',
                    port: 'http',
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 10,
                  timeoutSeconds: 5,
                  failureThreshold: 3,
                },
                readinessProbe: {
                  httpGet: {
                    path: '/ready',
                    port: 'http',
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 5,
                  timeoutSeconds: 3,
                  failureThreshold: 3,
                },
              },
            ],
          },
        },
      },
    };

    const service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: appName,
        namespace,
      },
      spec: {
        type: 'ClusterIP',
        ports: [
          {
            port: 80,
            targetPort: 'http',
            protocol: 'TCP',
            name: 'http',
          },
        ],
        selector: {
          app: appName,
        },
      },
    };

    const hpa = {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: {
        name: appName,
        namespace,
      },
      spec: {
        scaleTargetRef: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: appName,
        },
        minReplicas: replicas,
        maxReplicas: replicas * 3,
        metrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              target: {
                type: 'Utilization',
                averageUtilization: 70,
              },
            },
          },
          {
            type: 'Resource',
            resource: {
              name: 'memory',
              target: {
                type: 'Utilization',
                averageUtilization: 80,
              },
            },
          },
        ],
      },
    };

    return { deployment, service, hpa };
  }
}

class ProductionReadyStrategy extends K8sManifestStrategy {
  readonly name = 'production-ready';
  readonly confidence = 1.0;
  readonly estimatedDeployTime = 120;
  readonly resourceEfficiency = 10;
  readonly securityRating = 10;

  async generateManifests(context: K8sContext): Promise<K8sManifestSet> {
    const appName = context.appName || 'app';
    const namespace = context.namespace || 'default';
    const replicas = Math.max(context.replicas || 3, 3);
    const port = context.port || 3000;
    const imageName = context.imageName || 'app';
    const imageTag = context.imageTag || 'latest';

    const deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: appName,
        namespace,
        labels: {
          app: appName,
          tier: 'backend',
          version: 'v1',
        },
        annotations: {
          'deployment.kubernetes.io/revision': '1',
        },
      },
      spec: {
        replicas,
        revisionHistoryLimit: 3,
        strategy: {
          type: 'RollingUpdate',
          rollingUpdate: {
            maxSurge: 1,
            maxUnavailable: 0,
          },
        },
        selector: {
          matchLabels: {
            app: appName,
          },
        },
        template: {
          metadata: {
            labels: {
              app: appName,
              tier: 'backend',
              version: 'v1',
            },
            annotations: {
              'prometheus.io/scrape': 'true',
              'prometheus.io/port': port.toString(),
              'prometheus.io/path': '/metrics',
            },
          },
          spec: {
            serviceAccountName: appName,
            automountServiceAccountToken: false,
            affinity: {
              podAntiAffinity: {
                requiredDuringSchedulingIgnoredDuringExecution: [
                  {
                    labelSelector: {
                      matchExpressions: [
                        {
                          key: 'app',
                          operator: 'In',
                          values: [appName],
                        },
                      ],
                    },
                    topologyKey: 'kubernetes.io/hostname',
                  },
                ],
              },
            },
            securityContext: {
              runAsNonRoot: true,
              runAsUser: 1000,
              runAsGroup: 3000,
              fsGroup: 2000,
              seccompProfile: {
                type: 'RuntimeDefault',
              },
            },
            containers: [
              {
                name: appName,
                image: `${imageName}:${imageTag}`,
                imagePullPolicy: 'Always',
                ports: [
                  {
                    containerPort: port,
                    name: 'http',
                    protocol: 'TCP',
                  },
                ],
                securityContext: {
                  allowPrivilegeEscalation: false,
                  readOnlyRootFilesystem: true,
                  runAsNonRoot: true,
                  capabilities: {
                    drop: ['ALL'],
                  },
                },
                resources: {
                  requests: {
                    cpu: context.cpuRequest || '250m',
                    memory: context.memoryRequest || '512Mi',
                  },
                  limits: {
                    cpu: context.cpuLimit || '1000m',
                    memory: context.memoryLimit || '2Gi',
                  },
                },
                startupProbe: {
                  httpGet: {
                    path: '/health',
                    port: 'http',
                  },
                  initialDelaySeconds: 10,
                  periodSeconds: 10,
                  timeoutSeconds: 5,
                  failureThreshold: 30,
                },
                livenessProbe: {
                  httpGet: {
                    path: '/health',
                    port: 'http',
                  },
                  initialDelaySeconds: 0,
                  periodSeconds: 10,
                  timeoutSeconds: 5,
                  failureThreshold: 3,
                },
                readinessProbe: {
                  httpGet: {
                    path: '/ready',
                    port: 'http',
                  },
                  initialDelaySeconds: 0,
                  periodSeconds: 5,
                  timeoutSeconds: 3,
                  failureThreshold: 3,
                },
                volumeMounts: [
                  {
                    name: 'tmp',
                    mountPath: '/tmp',
                  },
                ],
              },
            ],
            volumes: [
              {
                name: 'tmp',
                emptyDir: {},
              },
            ],
          },
        },
      },
    };

    const service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: appName,
        namespace,
        labels: {
          app: appName,
        },
      },
      spec: {
        type: 'ClusterIP',
        ports: [
          {
            port: 80,
            targetPort: 'http',
            protocol: 'TCP',
            name: 'http',
          },
        ],
        selector: {
          app: appName,
        },
      },
    };

    const hpa = {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: {
        name: appName,
        namespace,
      },
      spec: {
        scaleTargetRef: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: appName,
        },
        minReplicas: replicas,
        maxReplicas: replicas * 4,
        metrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              target: {
                type: 'Utilization',
                averageUtilization: 60,
              },
            },
          },
          {
            type: 'Resource',
            resource: {
              name: 'memory',
              target: {
                type: 'Utilization',
                averageUtilization: 70,
              },
            },
          },
        ],
        behavior: {
          scaleDown: {
            stabilizationWindowSeconds: 300,
            policies: [
              {
                type: 'Percent',
                value: 10,
                periodSeconds: 60,
              },
            ],
          },
          scaleUp: {
            stabilizationWindowSeconds: 60,
            policies: [
              {
                type: 'Percent',
                value: 100,
                periodSeconds: 15,
              },
              {
                type: 'Pods',
                value: 4,
                periodSeconds: 15,
              },
            ],
            selectPolicy: 'Max',
          },
        },
      },
    };

    const ingress = context.enableIngress ? {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: appName,
        namespace,
        annotations: {
          'nginx.ingress.kubernetes.io/rewrite-target': '/',
          'cert-manager.io/cluster-issuer': 'letsencrypt-prod',
        },
      },
      spec: {
        tls: [
          {
            hosts: [`${appName}.example.com`],
            secretName: `${appName}-tls`,
          },
        ],
        rules: [
          {
            host: `${appName}.example.com`,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: appName,
                      port: {
                        number: 80,
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    } : undefined;

    return {
      deployment,
      service,
      hpa,
      ...(ingress && { ingress }),
    };
  }
}
