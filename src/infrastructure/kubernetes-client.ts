/**
 * Kubernetes Client - Direct k8s API client without abstractions
 */

import * as k8s from '@kubernetes/client-node';
import type { Logger } from 'pino';
import { KubernetesError } from '../errors/index.js';
import type {
  K8sManifest,
  K8sDeploymentOptions,
  K8sDeploymentResult,
  K8sServiceStatus,
} from '../contracts/types/index.js';

// Type guard for Error objects
function isError(error: unknown): error is Error {
  return error instanceof Error;
}

// Type guard for HTTP errors with statusCode
interface HttpError extends Error {
  statusCode?: number;
}

function isHttpError(error: unknown): error is HttpError {
  return isError(error) && 'statusCode' in error;
}

// Type guard for Kubernetes API responses with metadata
interface K8sResourceWithMetadata {
  metadata?: {
    name?: string;
    namespace?: string;
  };
}

function hasMetadata(obj: unknown): obj is K8sResourceWithMetadata {
  return typeof obj === 'object' && obj !== null && 'metadata' in obj;
}

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
  private k8sApi?: k8s.CoreV1Api;
  private appsApi?: k8s.AppsV1Api;
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
      const message = isError(error) ? error.message : 'Unknown error';
      this.logger.warn({ error: message }, 'Failed to initialize Kubernetes config');
    }
  }

  async initialize(): Promise<void> {
    if (!this.k8sApi) {
      this.available = false;
      this.logger.warn('Kubernetes API client not initialized');
      return;
    }

    try {
      // Test cluster connectivity
      await this.k8sApi.listNamespacedPod({
        namespace: 'kube-system',
        limit: 1,
      });
      this.available = true;
      this.logger.info('Kubernetes client initialized');
    } catch (error: unknown) {
      this.available = false;
      const message = isError(error) ? error.message : 'Unknown error';
      this.logger.warn({ error: message }, 'Kubernetes cluster not accessible');
      // Don't throw - allow graceful degradation
    }
  }

  async deployManifests(
    manifests: K8sManifest[],
    options?: K8sDeploymentOptions,
  ): Promise<K8sDeploymentResult> {
    if (!this.available) {
      throw new KubernetesError(
        'Kubernetes cluster not available',
        'K8S_NOT_AVAILABLE',
        undefined,
        options?.namespace,
      );
    }

    const namespace = options?.namespace ?? 'default';
    const deployed: unknown[] = [];
    const failed: unknown[] = [];

    this.logger.info(
      {
        manifestCount: manifests.length,
        namespace,
      },
      'Deploying Kubernetes manifests',
    );

    for (const manifest of manifests) {
      try {
        await this.applyManifest(manifest, namespace);
        deployed.push({
          name: manifest.metadata?.name ?? 'unknown',
          kind: manifest.kind,
          namespace: manifest.metadata?.namespace ?? namespace,
          status: 'deployed',
        });
      } catch (error: unknown) {
        failed.push({
          name: manifest.metadata?.name ?? 'unknown',
          kind: manifest.kind,
          error: isError(error) ? error.message : 'Unknown error',
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
        { failed },
      );
    }

    return {
      success: deployed.length > 0,
      resources: [],
      deployed: deployed as string[],
      failed: failed as { resource: string; error: string }[],
    };
  }

  async applyManifest(manifest: K8sManifest, namespace?: string): Promise<void> {
    if (!this.available) {
      throw new KubernetesError('Kubernetes cluster not available', 'K8S_NOT_AVAILABLE');
    }

    const targetNamespace = namespace ?? (manifest.metadata?.namespace || 'default');

    try {
      switch (manifest.kind?.toLowerCase()) {
        case 'deployment':
          if (this.appsApi) {
            await this.appsApi.createNamespacedDeployment({
              namespace: targetNamespace,
              body: manifest as k8s.V1Deployment,
            });
          } else {
            throw new KubernetesError('Apps API not initialized', 'K8S_API_NOT_INITIALIZED');
          }
          break;
        case 'service':
          if (this.k8sApi) {
            await this.k8sApi.createNamespacedService({
              namespace: targetNamespace,
              body: manifest as k8s.V1Service,
            });
          } else {
            throw new KubernetesError('Core API not initialized', 'K8S_API_NOT_INITIALIZED');
          }
          break;
        case 'configmap':
          if (this.k8sApi) {
            await this.k8sApi.createNamespacedConfigMap({
              namespace: targetNamespace,
              body: manifest as k8s.V1ConfigMap,
            });
          } else {
            throw new KubernetesError('Core API not initialized', 'K8S_API_NOT_INITIALIZED');
          }
          break;
        case 'secret':
          if (this.k8sApi) {
            await this.k8sApi.createNamespacedSecret({
              namespace: targetNamespace,
              body: manifest as k8s.V1Secret,
            });
          } else {
            throw new KubernetesError('Core API not initialized', 'K8S_API_NOT_INITIALIZED');
          }
          break;
        case 'namespace':
          if (this.k8sApi) {
            await this.k8sApi.createNamespace({ body: manifest as k8s.V1Namespace });
          } else {
            throw new KubernetesError('Core API not initialized', 'K8S_API_NOT_INITIALIZED');
          }
          break;
        default:
          this.logger.warn({ kind: manifest.kind }, 'Unsupported manifest kind');
        // Could use dynamic client for unsupported kinds
      }

      this.logger.debug(
        {
          name: manifest.metadata?.name,
          kind: manifest.kind,
          namespace: targetNamespace,
        },
        'Applied manifest',
      );
    } catch (error: unknown) {
      // Handle already exists errors gracefully
      if (isHttpError(error) && error.statusCode === 409) {
        this.logger.info(
          {
            name: manifest.metadata?.name,
            kind: manifest.kind,
          },
          'Resource already exists, skipping',
        );
        return;
      }

      throw new KubernetesError(
        `Failed to apply ${manifest.kind}: ${isError(error) ? error.message : 'Unknown error'}`,
        'K8S_APPLY_FAILED',
        manifest.metadata?.name,
        targetNamespace,
        isError(error) ? error : new Error('Unknown error'),
      );
    }
  }

  async getServiceStatus(name: string, namespace?: string): Promise<K8sServiceStatus> {
    if (!this.available) {
      throw new KubernetesError('Kubernetes cluster not available', 'K8S_NOT_AVAILABLE');
    }

    const targetNamespace = namespace ?? 'default';

    try {
      if (!this.appsApi) {
        throw new KubernetesError('Apps API not initialized', 'K8S_API_NOT_INITIALIZED');
      }
      await this.appsApi.readNamespacedDeployment({
        name,
        namespace: targetNamespace,
      });
      return {
        name,
        namespace: targetNamespace,
        type: 'Deployment',
        clusterIP: '',
        ports: [],
      };
    } catch (error) {
      throw new KubernetesError(
        `Failed to get service status: ${isError(error) ? error.message : 'Unknown error'}`,
        'K8S_SERVICE_STATUS_FAILED',
        name,
        targetNamespace,
        isError(error) ? error : undefined,
      );
    }
  }

  async deleteDeployment(name: string, namespace?: string): Promise<void> {
    if (!this.available) {
      throw new KubernetesError('Kubernetes cluster not available', 'K8S_NOT_AVAILABLE');
    }

    const targetNamespace = namespace ?? 'default';

    try {
      if (!this.appsApi) {
        throw new KubernetesError('Apps API not initialized', 'K8S_API_NOT_INITIALIZED');
      }
      await this.appsApi.deleteNamespacedDeployment({ name, namespace: targetNamespace });
      this.logger.info({ name, namespace: targetNamespace }, 'Deployment deleted');
    } catch (error: unknown) {
      if (isHttpError(error) && error.statusCode === 404) {
        this.logger.info(
          { name, namespace: targetNamespace },
          'Deployment not found, already deleted',
        );
        return;
      }

      throw new KubernetesError(
        `Failed to delete deployment: ${isError(error) ? error.message : 'Unknown error'}`,
        'K8S_DELETE_FAILED',
        name,
        targetNamespace,
        isError(error) ? error : new Error('Unknown error'),
      );
    }
  }

  async getNamespaces(): Promise<string[]> {
    if (!this.available) {
      throw new KubernetesError('Kubernetes cluster not available', 'K8S_NOT_AVAILABLE');
    }

    try {
      if (!this.k8sApi) {
        throw new KubernetesError('Core API not initialized', 'K8S_API_NOT_INITIALIZED');
      }
      const namespaces = await this.k8sApi.listNamespace();
      return namespaces.items
        .map((ns: unknown) => {
          if (hasMetadata(ns)) {
            return ns.metadata?.name ?? '';
          }
          return '';
        })
        .filter(Boolean);
    } catch (error: unknown) {
      throw new KubernetesError(
        `Failed to list namespaces: ${isError(error) ? error.message : 'Unknown error'}`,
        'K8S_LIST_NAMESPACES_FAILED',
        undefined,
        undefined,
        isError(error) ? error : new Error('Unknown error'),
      );
    }
  }

  async createNamespace(name: string): Promise<void> {
    if (!this.available) {
      throw new KubernetesError('Kubernetes cluster not available', 'K8S_NOT_AVAILABLE');
    }

    try {
      const namespace: k8s.V1Namespace = {
        metadata: {
          name,
        },
      };

      if (!this.k8sApi) {
        throw new KubernetesError('Core API not initialized', 'K8S_API_NOT_INITIALIZED');
      }
      await this.k8sApi.createNamespace({ body: namespace });
      this.logger.info({ name }, 'Namespace created');
    } catch (error: unknown) {
      if (isHttpError(error) && error.statusCode === 409) {
        this.logger.info({ name }, 'Namespace already exists');
        return;
      }

      throw new KubernetesError(
        `Failed to create namespace: ${isError(error) ? error.message : 'Unknown error'}`,
        'K8S_CREATE_NAMESPACE_FAILED',
        undefined,
        name,
        isError(error) ? error : new Error('Unknown error'),
      );
    }
  }

  async checkClusterAccess(): Promise<boolean> {
    try {
      if (!this.k8sApi) {
        return false;
      }
      await this.k8sApi.listNamespace({ limit: 1 });
      return true;
    } catch (error: unknown) {
      const message = isError(error) ? error.message : 'Unknown error';
      this.logger.debug({ error: message }, 'Cluster access check failed');
      return false;
    }
  }

  async health(): Promise<K8sHealthStatus> {
    const status: K8sHealthStatus = {
      available: this.available,
    };

    if (this.available && this.k8sApi) {
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
        const message = isError(error) ? error.message : 'Unknown error';
        this.logger.warn({ error: message }, 'Failed to get cluster health details');
      }
    }

    return status;
  }
}
