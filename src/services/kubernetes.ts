/**
 * Kubernetes Service - Simplified with direct client usage
 */

import type { Logger } from 'pino';
import { KubernetesClient, K8sHealthStatus } from '../infrastructure/kubernetes-client';
import type {
  K8sDeploymentOptions,
  K8sDeploymentResult,
  K8sManifest,
  K8sServiceStatus,
} from '../domain/types/index';

export interface KubernetesConfig {
  kubeconfig?: string;
  context?: string;
  namespace?: string;
}

/**
 * Create a Kubernetes service instance
 */
export async function createKubernetesService(
  config: KubernetesConfig,
  logger: Logger,
): Promise<KubernetesService> {
  const service = new KubernetesService(config, logger);
  await service.initialize();
  return service;
}

export class KubernetesService {
  private client: KubernetesClient;
  private logger: Logger;

  constructor(config: KubernetesConfig, logger: Logger) {
    this.logger = logger.child({ service: 'kubernetes' });
    this.client = new KubernetesClient(config, this.logger);
  }

  async initialize(): Promise<void> {
    return this.client.initialize();
  }

  async deployManifests(
    manifests: K8sManifest[],
    options?: K8sDeploymentOptions,
  ): Promise<K8sDeploymentResult> {
    return this.client.deployManifests(manifests, options);
  }

  async getServiceStatus(name: string, namespace?: string): Promise<K8sServiceStatus> {
    return this.client.getServiceStatus(name, namespace);
  }

  async deleteDeployment(name: string, namespace?: string): Promise<void> {
    return this.client.deleteDeployment(name, namespace);
  }

  async applyManifest(manifest: K8sManifest): Promise<void> {
    return this.client.applyManifest(manifest);
  }

  async getNamespaces(): Promise<string[]> {
    return this.client.getNamespaces();
  }

  async checkClusterAccess(): Promise<boolean> {
    return this.client.checkClusterAccess();
  }

  async close(): Promise<void> {
    // Client doesn't need explicit closing for k8s'
    await Promise.resolve(); // Satisfy async requirement
    this.logger.info('Kubernetes service closed');
  }

  async health(): Promise<K8sHealthStatus & { status: string }> {
    const healthStatus = await this.client.health();

    return {
      ...healthStatus,
      status: healthStatus.available ? 'healthy' : 'unavailable',
    };
  }

  async createNamespace(name: string): Promise<void> {
    return this.client.createNamespace(name);
  }

  /**
   * Deploy application to cluster (matches interface requirement)
   */
  async deploy(manifests: unknown[]): Promise<{ success: boolean; resources: unknown[] }> {
    const k8sManifests = manifests as K8sManifest[];
    const result = await this.deployManifests(k8sManifests);
    return {
      success: result.success,
      resources: result.resources,
    };
  }

  /**
   * Generate Kubernetes manifests from application spec
   */
  generateManifests(spec: unknown): Promise<unknown[]> {
    // Basic implementation - just return empty array
    // Full implementation would require manifest generation logic
    this.logger.debug({ spec }, 'Generating manifests (stub)');
    return Promise.resolve([]);
  }

  /**
   * Verify deployment status
   */
  async verifyDeployment(options: { namespace: string; name: string }): Promise<unknown> {
    const status = await this.getServiceStatus(options.name, options.namespace);
    return status;
  }

  /**
   * Prepare cluster (create namespaces, etc.)
   */
  async prepareCluster(options: { namespace?: string }): Promise<void> {
    if (options.namespace) {
      await this.createNamespace(options.namespace);
    }
  }
}

// Re-export types for convenience
export type { K8sManifest, K8sDeploymentResult, K8sServiceStatus } from '../domain/types/index';
