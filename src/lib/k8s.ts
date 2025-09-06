/**
 * Kubernetes Client Wrapper
 *
 * Provides a simplified, clean interface for Kubernetes operations
 * Wraps the existing Kubernetes infrastructure with consistent error handling and logging
 */

import { createTimer, type Logger } from './logger';
import type {
  KubernetesManifest,
  KubernetesDeploymentResult,
  KubernetesCluster,
  KubernetesPod,
  KubernetesService,
  K8sDeploymentOptions,
  KubernetesNamespace,
  KubernetesDeployment,
  KubernetesSecret,
  KubernetesConfigMap,
  ManifestGenerationOptions,
  K8sHealthCheck,
  KubernetesClient as IKubernetesClient,
} from '../types/k8s';

/**
 * Kubernetes client wrapper implementation
 */
export class KubernetesClientWrapper implements IKubernetesClient {
  private logger: Logger;

  constructor(
    private k8sClient: any, // Will be the actual k8s client instance
    private manifestGenerator: any, // Will be the manifest generator
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'k8s-client' });
  }

  /**
   * Get current context
   */
  async getCurrentContext(): Promise<string> {
    try {
      const context = await this.k8sClient.getCurrentContext();
      this.logger.debug({ context }, 'Current context retrieved');
      return context;
    } catch (err) {
      this.logger.error({ error: err }, 'Failed to get current context');
      throw new Error('Failed to get current context');
    }
  }

  /**
   * Set current context
   */
  async setContext(context: string): Promise<void> {
    try {
      this.logger.info({ context }, 'Setting Kubernetes context');
      await this.k8sClient.setContext(context);
      this.logger.info({ context }, 'Context set successfully');
    } catch (err) {
      this.logger.error({ context, error: err }, 'Failed to set context');
      throw new Error(`Failed to set context: ${context}`);
    }
  }

  /**
   * Get cluster information
   */
  async getClusterInfo(): Promise<KubernetesCluster> {
    try {
      this.logger.debug('Getting cluster information');

      const info = await this.k8sClient.getClusterInfo();
      const version = await this.k8sClient.getVersion();

      return {
        name: info.name || 'unknown',
        context: await this.getCurrentContext(),
        server: info.server || 'unknown',
        accessible: true,
        version: version.gitVersion || 'unknown',
      };
    } catch (err) {
      this.logger.error({ error: err }, 'Failed to get cluster information');

      return {
        name: 'unknown',
        context: 'unknown',
        server: 'unknown',
        accessible: false,
      };
    }
  }

  /**
   * List namespaces
   */
  async listNamespaces(): Promise<KubernetesNamespace[]> {
    try {
      this.logger.debug('Listing namespaces');

      const namespaces = await this.k8sClient.listNamespaces();

      return namespaces.map(
        (ns: any): KubernetesNamespace => ({
          name: ns.metadata.name,
          status: ns.status?.phase || 'Active',
          created: ns.metadata.creationTimestamp || new Date().toISOString(),
          labels: ns.metadata.labels || {},
        }),
      );
    } catch (err) {
      this.logger.error({ error: err }, 'Failed to list namespaces');
      return [];
    }
  }

  /**
   * Create a namespace
   */
  async createNamespace(name: string, labels: Record<string, string> = {}): Promise<void> {
    const timer = createTimer(this.logger, 'k8s-create-namespace');

    try {
      this.logger.info({ name, labels }, 'Creating namespace');

      const manifest: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name,
          labels,
        },
      };

      await this.k8sClient.apply(manifest);

      timer.end();
      this.logger.info({ name }, 'Namespace created successfully');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);
      throw error;
    }
  }

  /**
   * Delete a namespace
   */
  async deleteNamespace(name: string): Promise<void> {
    const timer = createTimer(this.logger, 'k8s-delete-namespace');

    try {
      this.logger.info({ name }, 'Deleting namespace');

      await this.k8sClient.deleteNamespace(name);

      timer.end();
      this.logger.info({ name }, 'Namespace deleted successfully');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);
      throw error;
    }
  }

  /**
   * Apply Kubernetes manifests
   */
  async apply(
    manifests: KubernetesManifest[],
    options: K8sDeploymentOptions = {},
  ): Promise<KubernetesDeploymentResult> {
    const timer = createTimer(this.logger, 'k8s-apply');

    try {
      this.logger.info(
        {
          manifestCount: manifests.length,
          namespace: options.namespace,
        },
        'Applying Kubernetes manifests',
      );

      const results = await this.k8sClient.applyManifests(manifests, options);

      const deployed: string[] = [];
      const failed: Array<{ resource: string; error: string }> = [];
      const resources: Array<{
        kind: string;
        name: string;
        namespace: string;
        status: 'created' | 'updated' | 'failed';
        message?: string;
      }> = [];

      for (const result of results) {
        resources.push({
          kind: result.kind,
          name: result.name,
          namespace: result.namespace || options.namespace || 'default',
          status: result.success ? 'created' : 'failed',
          message: result.message,
        });

        if (result.success) {
          deployed.push(`${result.kind}/${result.name}`);
        } else {
          failed.push({
            resource: `${result.kind}/${result.name}`,
            error: result.error || 'Unknown error',
          });
        }
      }

      timer.end({
        deployedCount: deployed.length,
        failedCount: failed.length,
      });

      return {
        success: failed.length === 0,
        resources,
        deployed,
        failed,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);

      return {
        success: false,
        resources: [],
        deployed: [],
        failed: [{ resource: 'all', error: error.message }],
      };
    }
  }

  /**
   * Delete resources by manifests
   */
  async delete(
    manifests: KubernetesManifest[],
    options: { namespace?: string } = {},
  ): Promise<void> {
    const timer = createTimer(this.logger, 'k8s-delete');

    try {
      this.logger.info(
        {
          manifestCount: manifests.length,
          namespace: options.namespace,
        },
        'Deleting Kubernetes resources',
      );

      await this.k8sClient.deleteManifests(manifests, options);

      timer.end();
      this.logger.info('Resources deleted successfully');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);
      throw error;
    }
  }

  /**
   * List pods
   */
  async listPods(namespace?: string, labelSelector?: string): Promise<KubernetesPod[]> {
    try {
      this.logger.debug({ namespace, labelSelector }, 'Listing pods');

      const pods = await this.k8sClient.listPods(namespace, labelSelector);

      return pods.map(
        (pod: any): KubernetesPod => ({
          name: pod.metadata.name,
          namespace: pod.metadata.namespace,
          status: pod.status?.phase || 'Unknown',
          ready: `${pod.status?.containerStatuses?.filter((c: any) => c.ready).length || 0}/${pod.status?.containerStatuses?.length || 0}`,
          restarts:
            pod.status?.containerStatuses?.reduce(
              (sum: number, c: any) => sum + (c.restartCount || 0),
              0,
            ) || 0,
          age: this.calculateAge(pod.metadata.creationTimestamp),
          labels: pod.metadata.labels || {},
        }),
      );
    } catch (err) {
      this.logger.error({ namespace, error: err }, 'Failed to list pods');
      return [];
    }
  }

  /**
   * Get pod logs
   */
  async getPodLogs(
    name: string,
    namespace: string,
    options: { tail?: number; follow?: boolean } = {},
  ): Promise<string> {
    try {
      this.logger.debug({ name, namespace, options }, 'Getting pod logs');

      const logs = await this.k8sClient.getPodLogs(name, namespace, options);
      return logs;
    } catch (err) {
      this.logger.error({ name, namespace, error: err }, 'Failed to get pod logs');
      throw new Error(`Failed to get logs for pod ${name} in namespace ${namespace}`);
    }
  }

  /**
   * List services
   */
  async listServices(namespace?: string): Promise<KubernetesService[]> {
    try {
      this.logger.debug({ namespace }, 'Listing services');

      const services = await this.k8sClient.listServices(namespace);

      return services.map(
        (svc: any): KubernetesService => ({
          name: svc.metadata.name,
          namespace: svc.metadata.namespace,
          type: svc.spec?.type || 'ClusterIP',
          clusterIP: svc.spec?.clusterIP || '',
          externalIP: svc.status?.loadBalancer?.ingress?.[0]?.ip,
          ports:
            svc.spec?.ports?.map((port: any) => ({
              name: port.name,
              port: port.port,
              targetPort: port.targetPort,
              protocol: port.protocol || 'TCP',
            })) || [],
        }),
      );
    } catch (err) {
      this.logger.error({ namespace, error: err }, 'Failed to list services');
      return [];
    }
  }

  /**
   * Get a specific service
   */
  async getService(name: string, namespace: string): Promise<KubernetesService | null> {
    try {
      const services = await this.listServices(namespace);
      return services.find((svc) => svc.name === name) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * List deployments
   */
  async listDeployments(namespace?: string): Promise<KubernetesDeployment[]> {
    try {
      this.logger.debug({ namespace }, 'Listing deployments');

      const deployments = await this.k8sClient.listDeployments(namespace);

      return deployments.map(
        (deploy: any): KubernetesDeployment => ({
          name: deploy.metadata.name,
          namespace: deploy.metadata.namespace,
          replicas: {
            desired: deploy.spec?.replicas || 0,
            current: deploy.status?.replicas || 0,
            ready: deploy.status?.readyReplicas || 0,
            available: deploy.status?.availableReplicas || 0,
          },
          image: deploy.spec?.template?.spec?.containers?.[0]?.image || '',
          status: this.getDeploymentStatus(deploy.status),
          conditions:
            deploy.status?.conditions?.map((c: any) => ({
              type: c.type,
              status: c.status,
              reason: c.reason,
              message: c.message,
            })) || [],
          created: deploy.metadata.creationTimestamp || new Date().toISOString(),
          labels: deploy.metadata.labels || {},
        }),
      );
    } catch (err) {
      this.logger.error({ namespace, error: err }, 'Failed to list deployments');
      return [];
    }
  }

  /**
   * Get a specific deployment
   */
  async getDeployment(name: string, namespace: string): Promise<KubernetesDeployment | null> {
    try {
      const deployments = await this.listDeployments(namespace);
      return deployments.find((deploy) => deploy.name === name) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Scale a deployment
   */
  async scaleDeployment(name: string, namespace: string, replicas: number): Promise<void> {
    const timer = createTimer(this.logger, 'k8s-scale-deployment');

    try {
      this.logger.info({ name, namespace, replicas }, 'Scaling deployment');

      await this.k8sClient.scaleDeployment(name, namespace, replicas);

      timer.end({ replicas });
      this.logger.info({ name, namespace, replicas }, 'Deployment scaled successfully');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);
      throw error;
    }
  }

  /**
   * Create a secret
   */
  async createSecret(
    name: string,
    namespace: string,
    data: Record<string, string>,
    type = 'Opaque',
  ): Promise<void> {
    const timer = createTimer(this.logger, 'k8s-create-secret');

    try {
      this.logger.info({ name, namespace, type, keys: Object.keys(data) }, 'Creating secret');

      await this.k8sClient.createSecret(name, namespace, data, type);

      timer.end();
      this.logger.info({ name, namespace }, 'Secret created successfully');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);
      throw error;
    }
  }

  /**
   * List secrets
   */
  async listSecrets(namespace?: string): Promise<KubernetesSecret[]> {
    try {
      this.logger.debug({ namespace }, 'Listing secrets');

      const secrets = await this.k8sClient.listSecrets(namespace);

      return secrets.map(
        (secret: any): KubernetesSecret => ({
          name: secret.metadata.name,
          namespace: secret.metadata.namespace,
          type: secret.type || 'Opaque',
          dataKeys: Object.keys(secret.data || {}),
          created: secret.metadata.creationTimestamp || new Date().toISOString(),
          labels: secret.metadata.labels || {},
        }),
      );
    } catch (err) {
      this.logger.error({ namespace, error: err }, 'Failed to list secrets');
      return [];
    }
  }

  /**
   * Create a configmap
   */
  async createConfigMap(
    name: string,
    namespace: string,
    data: Record<string, string>,
  ): Promise<void> {
    const timer = createTimer(this.logger, 'k8s-create-configmap');

    try {
      this.logger.info({ name, namespace, keys: Object.keys(data) }, 'Creating configmap');

      await this.k8sClient.createConfigMap(name, namespace, data);

      timer.end();
      this.logger.info({ name, namespace }, 'ConfigMap created successfully');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);
      throw error;
    }
  }

  /**
   * List configmaps
   */
  async listConfigMaps(namespace?: string): Promise<KubernetesConfigMap[]> {
    try {
      this.logger.debug({ namespace }, 'Listing configmaps');

      const configMaps = await this.k8sClient.listConfigMaps(namespace);

      return configMaps.map(
        (cm: any): KubernetesConfigMap => ({
          name: cm.metadata.name,
          namespace: cm.metadata.namespace,
          dataKeys: Object.keys(cm.data || {}),
          created: cm.metadata.creationTimestamp || new Date().toISOString(),
          labels: cm.metadata.labels || {},
        }),
      );
    } catch (err) {
      this.logger.error({ namespace, error: err }, 'Failed to list configmaps');
      return [];
    }
  }

  /**
   * Generate Kubernetes manifests
   */
  async generateManifests(options: ManifestGenerationOptions): Promise<KubernetesManifest[]> {
    const timer = createTimer(this.logger, 'k8s-generate-manifests');

    try {
      this.logger.info(
        { appName: options.appName, image: options.image },
        'Generating Kubernetes manifests',
      );

      const manifests = await this.manifestGenerator.generate(options);

      timer.end({ manifestCount: manifests.length });

      return manifests;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);
      throw error;
    }
  }

  /**
   * Perform health checks
   */
  async performHealthChecks(namespace: string, labelSelector?: string): Promise<K8sHealthCheck[]> {
    const timer = createTimer(this.logger, 'k8s-health-checks');

    try {
      this.logger.info({ namespace, labelSelector }, 'Performing health checks');

      const checks = await this.k8sClient.performHealthChecks(namespace, labelSelector);

      timer.end({ checkCount: checks.length });

      return checks;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);
      return [];
    }
  }

  /**
   * Check Kubernetes connectivity
   */
  async ping(): Promise<boolean> {
    try {
      await this.k8sClient.getVersion();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get Kubernetes version information
   */
  async version(): Promise<{ clientVersion: string; serverVersion: string }> {
    try {
      const version = await this.k8sClient.getVersion();
      return {
        clientVersion: version.clientVersion?.gitVersion || 'unknown',
        serverVersion: version.serverVersion?.gitVersion || 'unknown',
      };
    } catch {
      return {
        clientVersion: 'unknown',
        serverVersion: 'unknown',
      };
    }
  }

  /**
   * Helper method to calculate age from timestamp
   */
  private calculateAge(timestamp: string): string {
    const now = new Date();
    const created = new Date(timestamp);
    const ageMs = now.getTime() - created.getTime();

    const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ageMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  }

  /**
   * Helper method to get deployment status
   */
  private getDeploymentStatus(status: any): 'Progressing' | 'Available' | 'ReplicaFailure' {
    if (!status?.conditions) return 'Progressing';

    const available = status.conditions.find(
      (c: any) => c.type === 'Available' && c.status === 'True',
    );
    if (available) return 'Available';

    const replicaFailure = status.conditions.find(
      (c: any) => c.type === 'ReplicaFailure' && c.status === 'True',
    );
    if (replicaFailure) return 'ReplicaFailure';

    return 'Progressing';
  }
}

/**
 * Create a Kubernetes client instance
 */
export function createKubernetesClient(
  k8sClient: any,
  manifestGenerator: any,
  logger: Logger,
): IKubernetesClient {
  return new KubernetesClientWrapper(k8sClient, manifestGenerator, logger);
}

/**
 * Mock Kubernetes client for testing
 */
export class MockKubernetesClient implements IKubernetesClient {
  async getCurrentContext(): Promise<string> {
    return 'mock-context';
  }

  async setContext(): Promise<void> {
    // Mock implementation
  }

  async getClusterInfo(): Promise<KubernetesCluster> {
    return {
      name: 'mock-cluster',
      context: 'mock-context',
      server: 'https://mock.k8s.example.com',
      accessible: true,
      version: 'v1.24.0',
    };
  }

  async listNamespaces(): Promise<KubernetesNamespace[]> {
    return [
      {
        name: 'default',
        status: 'Active',
        created: new Date().toISOString(),
        labels: {},
      },
    ];
  }

  async createNamespace(): Promise<void> {
    // Mock implementation
  }

  async deleteNamespace(): Promise<void> {
    // Mock implementation
  }

  async apply(): Promise<KubernetesDeploymentResult> {
    return {
      success: true,
      resources: [],
      deployed: [],
      failed: [],
    };
  }

  async delete(): Promise<void> {
    // Mock implementation
  }

  async listPods(): Promise<KubernetesPod[]> {
    return [];
  }

  async getPodLogs(): Promise<string> {
    return 'mock pod logs';
  }

  async listServices(): Promise<KubernetesService[]> {
    return [];
  }

  async getService(): Promise<KubernetesService | null> {
    return null;
  }

  async listDeployments(): Promise<KubernetesDeployment[]> {
    return [];
  }

  async getDeployment(): Promise<KubernetesDeployment | null> {
    return null;
  }

  async scaleDeployment(): Promise<void> {
    // Mock implementation
  }

  async createSecret(): Promise<void> {
    // Mock implementation
  }

  async listSecrets(): Promise<KubernetesSecret[]> {
    return [];
  }

  async createConfigMap(): Promise<void> {
    // Mock implementation
  }

  async listConfigMaps(): Promise<KubernetesConfigMap[]> {
    return [];
  }

  async generateManifests(): Promise<KubernetesManifest[]> {
    return [
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'mock-app',
        },
        spec: {},
      },
    ];
  }

  async performHealthChecks(): Promise<K8sHealthCheck[]> {
    return [];
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async version(): Promise<{ clientVersion: string; serverVersion: string }> {
    return {
      clientVersion: 'v1.24.0',
      serverVersion: 'v1.24.0',
    };
  }
}
