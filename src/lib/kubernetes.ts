/**
 * Kubernetes Client - Direct k8s API Access
 *
 * Simplified Kubernetes operations using direct @kubernetes/client-node integration
 * Removes unnecessary wrapper complexity while maintaining core functionality
 */

import * as k8s from '@kubernetes/client-node';
import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../types/core/index.js';

interface KubernetesClient {
  applyManifest: (manifest: any, namespace?: string) => Promise<Result<void>>;
  getDeploymentStatus: (namespace: string, name: string) => Promise<Result<{
    ready: boolean;
    readyReplicas: number;
    totalReplicas: number;
  }>>;
  deleteResource: (kind: string, name: string, namespace?: string) => Promise<Result<void>>;
}

/**
 * Create a Kubernetes client with core operations
 */
export const createKubernetesClient = (logger: Logger, kubeconfig?: string): KubernetesClient => {
  const kc = new k8s.KubeConfig();

  // Load kubeconfig from default locations or provided config
  if (kubeconfig) {
    kc.loadFromString(kubeconfig);
  } else {
    kc.loadFromDefault();
  }

  const k8sApi = kc.makeApiClient(k8s.AppsV1Api);
  const coreApi = kc.makeApiClient(k8s.CoreV1Api);

  return {
    /**
     * Apply Kubernetes manifest
     */
    async applyManifest(manifest: any, namespace = 'default'): Promise<Result<void>> {
      try {
        logger.debug({ manifest: manifest.kind, namespace }, 'Applying Kubernetes manifest');

        // Simple apply logic - in production this would handle different resource types
        if (manifest.kind === 'Deployment') {
          await k8sApi.createNamespacedDeployment({ namespace, body: manifest });
        } else if (manifest.kind === 'Service') {
          await coreApi.createNamespacedService({ namespace, body: manifest });
        }

        logger.info({ kind: manifest.kind, name: manifest.metadata?.name }, 'Manifest applied successfully');
        return Success(undefined);
      } catch (error) {
        const errorMessage = `Failed to apply manifest: ${error instanceof Error ? error.message : 'Unknown error'}`;
        return Failure(errorMessage);
      }
    },

    /**
     * Get deployment status
     */
    async getDeploymentStatus(namespace: string, name: string): Promise<Result<{
      ready: boolean;
      readyReplicas: number;
      totalReplicas: number;
    }>> {
      try {
        const response = await k8sApi.readNamespacedDeployment({ name, namespace });
        const deployment = response;

        const status = {
          ready: (deployment.status?.readyReplicas || 0) === (deployment.spec?.replicas || 0),
          readyReplicas: deployment.status?.readyReplicas || 0,
          totalReplicas: deployment.spec?.replicas || 0,
        };

        return Success(status);
      } catch (error) {
        const errorMessage = `Failed to get deployment status: ${error instanceof Error ? error.message : 'Unknown error'}`;
        return Failure(errorMessage);
      }
    },

    /**
     * Delete resource
     */
    async deleteResource(kind: string, name: string, namespace = 'default'): Promise<Result<void>> {
      try {
        if (kind === 'Deployment') {
          await k8sApi.deleteNamespacedDeployment({ name, namespace });
        } else if (kind === 'Service') {
          await coreApi.deleteNamespacedService({ name, namespace });
        }

        logger.info({ kind, name, namespace }, 'Resource deleted successfully');
        return Success(undefined);
      } catch (error) {
        const errorMessage = `Failed to delete resource: ${error instanceof Error ? error.message : 'Unknown error'}`;
        return Failure(errorMessage);
      }
    },
  };
};
