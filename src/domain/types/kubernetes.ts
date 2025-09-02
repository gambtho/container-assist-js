export interface KubernetesResource {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    namespace?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
  }
  spec?: Record<string, any>
  status?: Record<string, any>
}

// KubernetesManifest is an alias for KubernetesResource for consistency
export type KubernetesManifest = KubernetesResource

export interface KubernetesManifestCollection {
  resources: KubernetesManifest[]
  namespace?: string
  labels?: Record<string, string>
}

export interface KubernetesDeploymentResult {
  success: boolean
  resources: Array<{
    kind: string
    name: string
    namespace: string
    status: 'created' | 'updated' | 'failed'
    message?: string
  }>
  deployed: Array<string>
  failed: Array<{
    resource: string
    error: string
  }>
  endpoints?: Array<{
    name?: string
    service?: string
    url?: string
    type: 'service' | 'ingress' | 'route' | 'ClusterIP' | 'NodePort' | 'LoadBalancer'
    port?: number
  }>
}

export interface KubernetesCluster {
  name: string
  context: string
  server: string
  namespace?: string
  accessible: boolean
  version?: string
}

export interface KubernetesPod {
  name: string
  namespace: string
  status: string
  ready: string
  restarts: number
  age: string
  labels?: Record<string, string>
}

export interface KubernetesService {
  name: string
  namespace: string
  type: string
  clusterIP: string
  externalIP?: string
  ports: Array<{
    name?: string
    port: number
    targetPort: number
    protocol: string
  }>
}


