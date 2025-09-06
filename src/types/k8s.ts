/**
 * Unified Kubernetes types for container orchestration operations
 * Consolidates Kubernetes-related types from multiple locations into a single source
 * Provides comprehensive interfaces for Kubernetes operations
 */

/**
 * Base Kubernetes resource structure
 */
export interface KubernetesResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
}

/**
 * Kubernetes manifest is an alias for resource
 */
export type KubernetesManifest = KubernetesResource;

/**
 * Collection of Kubernetes manifests
 */
export interface KubernetesManifestCollection {
  resources: KubernetesManifest[];
  namespace?: string;
  labels?: Record<string, string>;
}

/**
 * Kubernetes deployment result
 */
export interface KubernetesDeploymentResult {
  success: boolean;
  resources: Array<{
    kind: string;
    name: string;
    namespace: string;
    status: 'created' | 'updated' | 'failed';
    message?: string;
  }>;
  deployed: Array<string>;
  failed: Array<{
    resource: string;
    error: string;
  }>;
  endpoints?: Array<{
    name?: string;
    service?: string;
    url?: string;
    type: 'service' | 'ingress' | 'route' | 'ClusterIP' | 'NodePort' | 'LoadBalancer';
    port?: number;
  }>;
}

/**
 * Kubernetes cluster information
 */
export interface KubernetesCluster {
  name: string;
  context: string;
  server: string;
  namespace?: string;
  accessible: boolean;
  version?: string;
}

/**
 * Kubernetes pod information
 */
export interface KubernetesPod {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
  age: string;
  labels?: Record<string, string>;
}

/**
 * Kubernetes service information
 */
export interface KubernetesService {
  name: string;
  namespace: string;
  type: string;
  clusterIP: string;
  externalIP?: string;
  ports: Array<{
    name?: string;
    port: number;
    targetPort: number;
    protocol: string;
  }>;
}

/**
 * Kubernetes deployment options
 */
export interface K8sDeploymentOptions {
  namespace?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  replicas?: number;
  strategy?: 'RollingUpdate' | 'Recreate';
  timeout?: number;
}

/**
 * Kubernetes namespace information
 */
export interface KubernetesNamespace {
  name: string;
  status: 'Active' | 'Terminating';
  created: string;
  labels?: Record<string, string>;
}

/**
 * Kubernetes deployment information
 */
export interface KubernetesDeployment {
  name: string;
  namespace: string;
  replicas: {
    desired: number;
    current: number;
    ready: number;
    available: number;
  };
  image: string;
  status: 'Progressing' | 'Available' | 'ReplicaFailure';
  conditions?: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
  created: string;
  labels?: Record<string, string>;
}

/**
 * Kubernetes ingress information
 */
export interface KubernetesIngress {
  name: string;
  namespace: string;
  hosts: string[];
  endpoints: Array<{
    host: string;
    path: string;
    service: string;
    port: number;
  }>;
  tls?: boolean;
  className?: string;
}

/**
 * Kubernetes secret information
 */
export interface KubernetesSecret {
  name: string;
  namespace: string;
  type: string;
  dataKeys: string[];
  created: string;
  labels?: Record<string, string>;
}

/**
 * Kubernetes configmap information
 */
export interface KubernetesConfigMap {
  name: string;
  namespace: string;
  dataKeys: string[];
  created: string;
  labels?: Record<string, string>;
}

/**
 * Kubernetes manifest generation options
 */
export interface ManifestGenerationOptions {
  appName: string;
  image: string;
  namespace?: string;
  replicas?: number;
  ports?: number[];
  resources?: {
    requests?: {
      cpu?: string;
      memory?: string;
    };
    limits?: {
      cpu?: string;
      memory?: string;
    };
  };
  env?: Record<string, string>;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  serviceType?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  ingress?: {
    enabled: boolean;
    host?: string;
    path?: string;
    tls?: boolean;
  };
}

/**
 * Kubernetes health check result
 */
export interface K8sHealthCheck {
  name: string;
  endpoint: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  response_time_ms: number;
  message?: string;
}

/**
 * Kubernetes client interface for lib layer
 */
export interface KubernetesClient {
  // Cluster operations
  getCurrentContext(): Promise<string>;
  setContext(context: string): Promise<void>;
  getClusterInfo(): Promise<KubernetesCluster>;

  // Namespace operations
  listNamespaces(): Promise<KubernetesNamespace[]>;
  createNamespace(name: string, labels?: Record<string, string>): Promise<void>;
  deleteNamespace(name: string): Promise<void>;

  // Resource operations
  apply(
    manifests: KubernetesManifest[],
    options?: K8sDeploymentOptions,
  ): Promise<KubernetesDeploymentResult>;
  delete(manifests: KubernetesManifest[], options?: { namespace?: string }): Promise<void>;

  // Pod operations
  listPods(namespace?: string, labelSelector?: string): Promise<KubernetesPod[]>;
  getPodLogs(
    name: string,
    namespace: string,
    options?: { tail?: number; follow?: boolean },
  ): Promise<string>;

  // Service operations
  listServices(namespace?: string): Promise<KubernetesService[]>;
  getService(name: string, namespace: string): Promise<KubernetesService | null>;

  // Deployment operations
  listDeployments(namespace?: string): Promise<KubernetesDeployment[]>;
  getDeployment(name: string, namespace: string): Promise<KubernetesDeployment | null>;
  scaleDeployment(name: string, namespace: string, replicas: number): Promise<void>;

  // Secret operations
  createSecret(
    name: string,
    namespace: string,
    data: Record<string, string>,
    type?: string,
  ): Promise<void>;
  listSecrets(namespace?: string): Promise<KubernetesSecret[]>;

  // ConfigMap operations
  createConfigMap(name: string, namespace: string, data: Record<string, string>): Promise<void>;
  listConfigMaps(namespace?: string): Promise<KubernetesConfigMap[]>;

  // Manifest generation
  generateManifests(options: ManifestGenerationOptions): Promise<KubernetesManifest[]>;

  // Health checks
  performHealthChecks(namespace: string, labelSelector?: string): Promise<K8sHealthCheck[]>;

  // Utility operations
  ping(): Promise<boolean>;
  version(): Promise<{ clientVersion: string; serverVersion: string }>;
}
