/**
 * Kubernetes Client - Direct k8s API client without abstractions
 */

import * as k8s from '@kubernetes/client-node';
import type { Logger } from 'pino';
import { KubernetesError } from '../errors/index';
import type {
  K8sManifest,
  K8sDeploymentOptions,
  K8sDeploymentResult,
  K8sServiceStatus
} from '../contracts/types/index';

export interface KubernetesClientConfig {
  kubeconfig?: string;
  context?: string;
  namespace?: string;
}

export interface K8sHealthStatus {
  available: boolean;
  version?: string;
  nodeCount?: number;
  namespaces?: string[];
}

export class KubernetesClient {
  private kc: k8s.KubeConfig;
  private k8sApi!: k8s.CoreV1Api;
  private appsApi!: k8s.AppsV1Api;
  private logger: Logger;
  private available = false;

  constructor(config: KubernetesClientConfig = {}, logger: Logger) {
    this.logger = logger.child({ component: 'KubernetesClient' });
    this.kc = new k8s.KubeConfig();

    try {
      if (config.kubeconfig != null) {
        this.kc.loadFromFile(config.kubeconfig);
      } else {
        this.kc.loadFromDefault();
      }

      if (config.context != null) {
        this.kc.setCurrentContext(config.context);
      }

      this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
      this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
    } catch (error: unknown) {
      this.logger.warn({ error: error.message }, 'Failed to initialize Kubernetes config');
    }
  }

  async initialize(): Promise<void> {
    try {
      // Test cluster connectivity
      await this.k8sApi.listNamespacedPod({
        namespace: 'kube-system',
        limit: 1
      });
      this.available = true;
      this.logger.info('Kubernetes client initialized');
    } catch (error: unknown) {
      this.available = false;
      this.logger.warn({ error: error.message }, 'Kubernetes cluster not accessible');
      // Don't throw - allow graceful degradation'
    }
  }

  async deployManifests(
    manifests: K8sManifest[],
    options?: K8sDeploymentOptions
  ): Promise<K8sDeploymentResult> {
    if (!this.available) {
      throw new KubernetesError(
        'Kubernetes cluster not available',
        'K8S_NOT_AVAILABLE',
        undefined,
        options?.namespace
      );
    }

    const namespace = options?.namespace ?? 'default';
    const deployed: any[] = [];
    const failed: any[] = [];

    this.logger.info(
      {
        manifestCount: manifests.length,
        namespace
      },
      'Deploying Kubernetes manifests'
    );

    for (const manifest of manifests) {
      try {
        await this.applyManifest(manifest, namespace);
        deployed.push({
          name: manifest.metadata?.name ?? 'unknown',
          kind: manifest.kind,
          namespace: manifest.metadata?.namespace ?? namespace,
          status: 'deployed'
        });
      } catch (error: unknown) {
        failed.push({
          name: manifest.metadata?.name ?? 'unknown',
          kind: manifest.kind,
          error: error.message
        });
      }
    }

    if (failed.length > 0 && deployed.length === 0) {
      throw new KubernetesError(
        'All deployments failed',
        'K8S_DEPLOY_FAILED',
        undefined,
        namespace,
        undefined,
        { failed }
      );
    }

    return {
      success: deployed.length > 0,
      resources: [],
      deployed,
      failed
    };
  }

  async applyManifest(manifest: K8sManifest, namespace?: string): Promise<void> {
    if (!this.available) {
      throw new KubernetesError('Kubernetes cluster not available', 'K8S_NOT_AVAILABLE');
    }

    const targetNamespace = namespace ?? manifest.metadata?.namespace || 'default';

    try {
      switch (manifest.kind?.toLowerCase()) {
        case 'deployment':
          await this.appsApi.createNamespacedDeployment({
            namespace: targetNamespace,
            body: manifest as unknown
          });
          break;
        case 'service':
          await this.k8sApi.createNamespacedService({
            namespace: targetNamespace,
            body: manifest as unknown
          });
          break;
        case 'configmap':
          await this.k8sApi.createNamespacedConfigMap({
            namespace: targetNamespace,
            body: manifest as unknown
          });
          break;
        case 'secret':
          await this.k8sApi.createNamespacedSecret({
            namespace: targetNamespace,
            body: manifest as unknown
          });
          break;
        case 'namespace':
          await this.k8sApi.createNamespace({ body: manifest as unknown });
          break;
        default:
          this.logger.warn({ kind: manifest.kind }, 'Unsupported manifest kind');
        // Could use dynamic client for unsupported kinds
      }

      this.logger.debug(
        {
          name: manifest.metadata?.name,
          kind: manifest.kind,
          namespace: targetNamespace
        },
        'Applied manifest'
      );
    } catch (error: unknown) {
      // Handle already exists errors gracefully
      if (error.statusCode === 409) {
        this.logger.info(
          {
            name: manifest.metadata?.name,
            kind: manifest.kind
          },
          'Resource already exists, skipping'
        );
        return;
      }

      throw new KubernetesError(
        `Failed to apply ${manifest.kind}: ${error.message}`,
        'K8S_APPLY_FAILED',
        manifest.metadata?.name,
        targetNamespace,
        error
      );
    }
  }

  async getServiceStatus(name: string, namespace?: string): Promise<K8sServiceStatus> {
    if (!this.available) {
      throw new KubernetesError('Kubernetes cluster not available', 'K8S_NOT_AVAILABLE');
    }

    const targetNamespace = namespace ?? 'default';

    try {
      const deployment = await this.appsApi.readNamespacedDeployment({
        name,
        namespace: targetNamespace
      });
      const status = deployment.status;

      return {
        name,
        namespace: targetNamespace,
        type: 'Deployment',
        clusterIP: '',
        ports: [],
        replicas: {
          desired: status?.replicas ?? 0,
          ready: status?.readyReplicas ?? 0,
          available: status?.availableReplicas ?? 0
        }
      };
    } catch (error) {
      throw new KubernetesError(
        `Failed to get service status: ${error.message}`,
        'K8S_SERVICE_STATUS_FAILED',
        name,
        targetNamespace,
        error
      );
    }
  }

  async deleteDeployment(name: string, namespace?: string): Promise<void> {
    if (!this.available) {
      throw new KubernetesError('Kubernetes cluster not available', 'K8S_NOT_AVAILABLE');
    }

    const targetNamespace = namespace ?? 'default';

    try {
      await this.appsApi.deleteNamespacedDeployment({ name, namespace: targetNamespace });
      this.logger.info({ name, namespace: targetNamespace }, 'Deployment deleted');
    } catch (error: unknown) {
      if (error.statusCode === 404) {
        this.logger.info(
          { name, namespace: targetNamespace },
          'Deployment not found, already deleted'
        );
        return;
      }

      throw new KubernetesError(
        `Failed to delete deployment: ${error.message}`,
        'K8S_DELETE_FAILED',
        name,
        targetNamespace,
        error
      );
    }
  }

  async getNamespaces(): Promise<string[]> {
    if (!this.available) {
      throw new KubernetesError('Kubernetes cluster not available', 'K8S_NOT_AVAILABLE');
    }

    try {
      const namespaces = await this.k8sApi.listNamespace();
      return namespaces.items.map((ns: unknown) => ns.metadata?.name ?? '').filter(Boolean);
    } catch (error: unknown) {
      throw new KubernetesError(
        `Failed to list namespaces: ${error.message}`,
        'K8S_LIST_NAMESPACES_FAILED',
        undefined,
        undefined,
        error
      );
    }
  }

  async createNamespace(name: string): Promise<void> {
    if (!this.available) {
      throw new KubernetesError('Kubernetes cluster not available', 'K8S_NOT_AVAILABLE');
    }

    try {
      const namespace = {
        metadata: {
          name
        }
      };

      await this.k8sApi.createNamespace({ body: namespace as unknown });
      this.logger.info({ name }, 'Namespace created');
    } catch (error: unknown) {
      if (error.statusCode === 409) {
        this.logger.info({ name }, 'Namespace already exists');
        return;
      }

      throw new KubernetesError(
        `Failed to create namespace: ${error.message}`,
        'K8S_CREATE_NAMESPACE_FAILED',
        undefined,
        name,
        error
      );
    }
  }

  async checkClusterAccess(): Promise<boolean> {
    try {
      await this.k8sApi.listNamespace({ limit: 1 });
      return true;
    } catch (error: unknown) {
      this.logger.debug({ error: error.message }, 'Cluster access check failed');
      return false;
    }
  }

  async health(): Promise<K8sHealthStatus> {
    const status: K8sHealthStatus = {
      available: this.available
    };

    if (this.available) {
      try {
        // Get cluster version
        const version = await this.k8sApi.getAPIResources();
        status.version = version.groupVersion ?? 'unknown';

        // Get node count
        const nodes = await this.k8sApi.listNode();
        status.nodeCount = nodes.items.length;

        // Get namespaces
        status.namespaces = await this.getNamespaces();
      } catch (error: unknown) {
        this.logger.warn({ error: error.message }, 'Failed to get cluster health details');
      }
    }

    return status;
  }
}
