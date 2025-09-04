/**
 * Kubernetes Service - Clean @kubernetes/client-node integration
 * Provides Kubernetes operations with proper type safety and error handling
 */

import * as k8s from '@kubernetes/client-node';
import type { Logger } from 'pino';
import { KubernetesError } from '../../errors/index.js';
import { ErrorCode } from '../../contracts/types/errors.js';
import {
  KubernetesManifest,
  KubernetesDeploymentResult,
  K8sDeploymentOptions,
} from '../../contracts/types/index.js';

export interface KubernetesConfig {
  kubeconfig?: string;
  context?: string;
  namespace?: string;
}

// Alias for backward compatibility if needed
export type KubernetesServiceConfig = KubernetesConfig;

export interface KubernetesHealthStatus {
  available: boolean;
  version?: string;
  cluster?: {
    name?: string;
    server?: string;
    nodes?: number;
  };
}


export class KubernetesService {
  private kubeConfig: k8s.KubeConfig;
  private k8sApi: k8s.CoreV1Api;
  private appsApi: k8s.AppsV1Api;
  private logger: Logger;
  private defaultNamespace: string;

  constructor(config: KubernetesServiceConfig, logger: Logger) {
    this.logger = logger.child({ service: 'kubernetes' });
    this.defaultNamespace = config.namespace ?? 'default';

    // Initialize Kubernetes configuration
    this.kubeConfig = new k8s.KubeConfig();

    if (config.kubeconfig) {
      this.kubeConfig.loadFromString(config.kubeconfig);
    } else {
      this.kubeConfig.loadFromDefault();
    }

    if (config.context) {
      this.kubeConfig.setCurrentContext(config.context);
    }

    // Initialize API clients
    this.k8sApi = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.appsApi = this.kubeConfig.makeApiClient(k8s.AppsV1Api);
  }

  async initialize(): Promise<void> {
    try {
      // Test connection by getting server version
      const versionApi = this.kubeConfig.makeApiClient(k8s.VersionApi);
      await versionApi.getCode();
      this.logger.info('Kubernetes service initialized successfully');
    } catch (error) {
      throw new KubernetesError(
        'Failed to connect to Kubernetes cluster',
        ErrorCode.KubernetesError,
        'initialize',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async deploy(manifests: KubernetesManifest[], options: K8sDeploymentOptions): Promise<KubernetesDeploymentResult> {
    try {
      this.logger.debug({ manifests, options }, 'Starting Kubernetes deployment');

      const namespace = options.namespace ?? this.defaultNamespace;
      const deployedResources: Array<{ kind: string; name: string; namespace: string }> = [];
      const logs: string[] = [];

      // Ensure namespace exists
      await this.ensureNamespace(namespace);

      for (const manifest of manifests) {
        try {
          const resourceNamespace = manifest.metadata.namespace ?? namespace;

          switch (manifest.kind) {
            case 'Deployment':
              await this.deployDeployment(manifest, resourceNamespace);
              break;
            case 'Service':
              await this.deployService(manifest, resourceNamespace);
              break;
            case 'ConfigMap':
              await this.deployConfigMap(manifest, resourceNamespace);
              break;
            case 'Secret':
              await this.deploySecret(manifest, resourceNamespace);
              break;
            default:
              this.logger.warn(`Unsupported resource kind: ${manifest.kind}`);
              logs.push(`Warning: Skipped unsupported resource kind: ${manifest.kind}`);
              continue;
          }

          deployedResources.push({
            kind: manifest.kind,
            name: manifest.metadata.name,
            namespace: resourceNamespace,
          });

          logs.push(`Deployed ${manifest.kind}/${manifest.metadata.name} in namespace ${resourceNamespace}`);
        } catch (error) {
          const errorMsg = `Failed to deploy ${manifest.kind}/${manifest.metadata.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          logs.push(`ERROR: ${errorMsg}`);

          // For now, continue processing other manifests even on error
          // TODO: Add continueOnError option to K8sDeploymentOptions if needed
        }
      }

      return {
        success: true,
        resources: deployedResources.map(resource => ({
          kind: resource.kind,
          name: resource.name,
          namespace: resource.namespace,
          status: 'created' as const,
          message: `Successfully deployed ${resource.kind}/${resource.name}`,
        })),
        deployed: deployedResources.map(r => `${r.kind}/${r.name}`),
        failed: [],
      };
    } catch (error) {
      throw new KubernetesError(
        `Kubernetes deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.K8S_DEPLOY_FAILED,
        'deploy',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private async ensureNamespace(namespace: string): Promise<void> {
    try {
      await this.k8sApi.readNamespace({ name: namespace });
    } catch (error) {
      // Namespace doesn't exist, create it
      const namespaceManifest: k8s.V1Namespace = {
        metadata: {
          name: namespace,
        },
      };

      await this.k8sApi.createNamespace({ body: namespaceManifest });
      this.logger.info({ namespace }, 'Created namespace');
    }
  }

  private async deployDeployment(manifest: KubernetesManifest, namespace: string): Promise<void> {
    const deployment = manifest as k8s.V1Deployment;
    if (deployment.metadata) {
      deployment.metadata.namespace = namespace;
    }

    const name = deployment.metadata?.name;
    if (!name) {
      throw new Error('Deployment manifest must have a name');
    }

    try {
      await this.appsApi.readNamespacedDeployment({ name, namespace });
      // Deployment exists, update it
      await this.appsApi.replaceNamespacedDeployment({ name, namespace, body: deployment });
    } catch {
      // Deployment doesn't exist, create it
      await this.appsApi.createNamespacedDeployment({ namespace, body: deployment });
    }
  }

  private async deployService(manifest: KubernetesManifest, namespace: string): Promise<void> {
    const service = manifest as k8s.V1Service;
    if (service.metadata) {
      service.metadata.namespace = namespace;
    }

    const name = service.metadata?.name;
    if (!name) {
      throw new Error('Service manifest must have a name');
    }

    try {
      await this.k8sApi.readNamespacedService({ name, namespace });
      // Service exists, update it
      await this.k8sApi.replaceNamespacedService({ name, namespace, body: service });
    } catch {
      // Service doesn't exist, create it
      await this.k8sApi.createNamespacedService({ namespace, body: service });
    }
  }

  private async deployConfigMap(manifest: KubernetesManifest, namespace: string): Promise<void> {
    const configMap = manifest as k8s.V1ConfigMap;
    if (configMap.metadata) {
      configMap.metadata.namespace = namespace;
    }

    const name = configMap.metadata?.name;
    if (!name) {
      throw new Error('ConfigMap manifest must have a name');
    }

    try {
      await this.k8sApi.readNamespacedConfigMap({ name, namespace });
      // ConfigMap exists, update it
      await this.k8sApi.replaceNamespacedConfigMap({ name, namespace, body: configMap });
    } catch {
      // ConfigMap doesn't exist, create it
      await this.k8sApi.createNamespacedConfigMap({ namespace, body: configMap });
    }
  }

  private async deploySecret(manifest: KubernetesManifest, namespace: string): Promise<void> {
    const secret = manifest as k8s.V1Secret;
    if (secret.metadata) {
      secret.metadata.namespace = namespace;
    }

    const name = secret.metadata?.name;
    if (!name) {
      throw new Error('Secret manifest must have a name');
    }

    try {
      await this.k8sApi.readNamespacedSecret({ name, namespace });
      // Secret exists, update it
      await this.k8sApi.replaceNamespacedSecret({ name, namespace, body: secret });
    } catch {
      // Secret doesn't exist, create it
      await this.k8sApi.createNamespacedSecret({ namespace, body: secret });
    }
  }

  async getServiceEndpoints(serviceName: string, namespace?: string): Promise<Array<{ host: string; port: number }>> {
    try {
      const ns = namespace ?? this.defaultNamespace;
      const service = await this.k8sApi.readNamespacedService({ name: serviceName, namespace: ns });
      const endpoints: Array<{ host: string; port: number }> = [];

      if (service.spec?.type === 'LoadBalancer') {
        const ingress = service.status?.loadBalancer?.ingress;
        if (ingress && ingress.length > 0) {
          const lbIngress = ingress[0];
          const host = lbIngress?.ip ?? lbIngress?.hostname ?? 'localhost';

          if (service.spec.ports && service.spec.ports.length > 0) {
            for (const port of service.spec.ports) {
              if (port.port) {
                endpoints.push({ host, port: port.port });
              }
            }
          }
        }
      } else if (service.spec?.type === 'NodePort') {
        const nodes = await this.k8sApi.listNode();
        if (nodes.items.length > 0 && service.spec.ports) {
          const nodeIp = nodes.items[0]?.status?.addresses?.find((addr: { type: string; address: string }) => addr.type === 'InternalIP')?.address ?? 'localhost';

          for (const port of service.spec.ports) {
            if (port.nodePort) {
              endpoints.push({ host: nodeIp, port: port.nodePort });
            }
          }
        }
      }

      return endpoints;
    } catch (error) {
      throw new KubernetesError(
        `Failed to get service endpoints: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.KubernetesError,
        'getServiceEndpoints',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async listPods(namespace?: string, labelSelector?: string): Promise<k8s.V1Pod[]> {
    try {
      const ns = namespace ?? this.defaultNamespace;
      const listOptions: { namespace: string; labelSelector?: string } = { namespace: ns };
      if (labelSelector) {
        listOptions.labelSelector = labelSelector;
      }
      const response = await this.k8sApi.listNamespacedPod(listOptions);
      return response.items;
    } catch (error) {
      throw new KubernetesError(
        `Failed to list pods: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.KubernetesError,
        'listPods',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async deleteDeployment(name: string, namespace?: string): Promise<void> {
    try {
      const ns = namespace ?? this.defaultNamespace;
      await this.appsApi.deleteNamespacedDeployment({ name, namespace: ns });
      this.logger.info({ name, namespace: ns }, 'Deployment deleted');
    } catch (error) {
      // Handle 404 errors gracefully (already deleted)
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
        this.logger.info({ name, namespace }, 'Deployment not found, already deleted');
        return;
      }

      throw new KubernetesError(
        `Failed to delete deployment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.K8S_DELETE_FAILED,
        'deleteDeployment',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async deleteService(name: string, namespace?: string): Promise<void> {
    try {
      const ns = namespace ?? this.defaultNamespace;
      await this.k8sApi.deleteNamespacedService({ name, namespace: ns });
      this.logger.info({ name, namespace: ns }, 'Service deleted');
    } catch (error) {
      // Handle 404 errors gracefully (already deleted)
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
        this.logger.info({ name, namespace }, 'Service not found, already deleted');
        return;
      }

      throw new KubernetesError(
        `Failed to delete service: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.K8S_DELETE_FAILED,
        'deleteService',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async deleteConfigMap(name: string, namespace?: string): Promise<void> {
    try {
      const ns = namespace ?? this.defaultNamespace;
      await this.k8sApi.deleteNamespacedConfigMap({ name, namespace: ns });
      this.logger.info({ name, namespace: ns }, 'ConfigMap deleted');
    } catch (error) {
      // Handle 404 errors gracefully (already deleted)
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
        this.logger.info({ name, namespace }, 'ConfigMap not found, already deleted');
        return;
      }

      throw new KubernetesError(
        `Failed to delete ConfigMap: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.K8S_DELETE_FAILED,
        'deleteConfigMap',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async deleteSecret(name: string, namespace?: string): Promise<void> {
    try {
      const ns = namespace ?? this.defaultNamespace;
      await this.k8sApi.deleteNamespacedSecret({ name, namespace: ns });
      this.logger.info({ name, namespace: ns }, 'Secret deleted');
    } catch (error) {
      // Handle 404 errors gracefully (already deleted)
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
        this.logger.info({ name, namespace }, 'Secret not found, already deleted');
        return;
      }

      throw new KubernetesError(
        `Failed to delete secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.K8S_DELETE_FAILED,
        'deleteSecret',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async getNamespaces(): Promise<string[]> {
    try {
      const response = await this.k8sApi.listNamespace();
      return response.items
        .map((ns) => ns.metadata?.name)
        .filter((name): name is string => name !== undefined);
    } catch (error) {
      throw new KubernetesError(
        `Failed to list namespaces: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.KubernetesError,
        'getNamespaces',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async createNamespace(name: string): Promise<void> {
    try {
      const namespace: k8s.V1Namespace = {
        metadata: { name },
      };

      await this.k8sApi.createNamespace({ body: namespace });
      this.logger.info({ name }, 'Namespace created');
    } catch (error) {
      // Handle 409 errors gracefully (already exists)
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 409) {
        this.logger.info({ name }, 'Namespace already exists');
        return;
      }

      throw new KubernetesError(
        `Failed to create namespace: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.KubernetesError,
        'createNamespace',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async getDeploymentStatus(name: string, namespace?: string): Promise<{
    name: string;
    namespace: string;
    replicas: { desired: number; ready: number; available: number };
    status: 'running' | 'pending' | 'failed' | 'unknown';
  }> {
    try {
      const ns = namespace ?? this.defaultNamespace;
      const deployment = await this.appsApi.readNamespacedDeployment({ name, namespace: ns });

      const replicas = {
        desired: deployment.spec?.replicas ?? 0,
        ready: deployment.status?.readyReplicas ?? 0,
        available: deployment.status?.availableReplicas ?? 0,
      };

      let status: 'running' | 'pending' | 'failed' | 'unknown' = 'unknown';
      if (replicas.ready === replicas.desired && replicas.desired > 0) {
        status = 'running';
      } else if (replicas.ready < replicas.desired) {
        status = 'pending';
      } else if (deployment.status?.conditions?.some(c => c.type === 'Progressing' && c.status === 'False')) {
        status = 'failed';
      }

      return {
        name,
        namespace: ns,
        replicas,
        status,
      };
    } catch (error) {
      throw new KubernetesError(
        `Failed to get deployment status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.KubernetesError,
        'getDeploymentStatus',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async checkClusterAccess(): Promise<boolean> {
    try {
      const versionApi = this.kubeConfig.makeApiClient(k8s.VersionApi);
      await versionApi.getCode();
      return true;
    } catch (error) {
      this.logger.error({ error }, 'Kubernetes cluster access check failed');
      return false;
    }
  }

  async health(): Promise<KubernetesHealthStatus> {
    try {
      const versionApi = this.kubeConfig.makeApiClient(k8s.VersionApi);
      const version = await versionApi.getCode();
      const nodes = await this.k8sApi.listNode();

      const currentContext = this.kubeConfig.getCurrentContext();
      const cluster = this.kubeConfig.getCurrentCluster();

      const clusterInfo: { name?: string; server?: string; nodes?: number } = {
        name: currentContext,
      };

      if (cluster?.server) {
        clusterInfo.server = cluster.server;
      }

      clusterInfo.nodes = nodes.items.length;

      return {
        available: true,
        version: version.gitVersion,
        cluster: clusterInfo,
      };
    } catch (error) {
      this.logger.error({ error }, 'Kubernetes health check failed');
      return {
        available: false,
      };
    }
  }

  close(): void {
    this.logger.info('Kubernetes service closed');
  }
}

/**
 * Create a Kubernetes service instance
 */
export async function createKubernetesService(
  config: KubernetesServiceConfig,
  logger: Logger,
): Promise<KubernetesService> {
  const service = new KubernetesService(config, logger);
  await service.initialize();
  return service;
}
