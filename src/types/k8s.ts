// Kubernetes types - simplified for core functionality

interface KubernetesResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
  };
}

interface DeploymentSpec {
  replicas?: number;
  selector: {
    matchLabels: Record<string, string>;
  };
  template: {
    metadata: {
      labels: Record<string, string>;
    };
    spec: {
      containers: Array<{
        name: string;
        image: string;
        ports?: Array<{ containerPort: number }>;
        env?: Array<{ name: string; value: string }>;
      }>;
    };
  };
}

interface ServiceSpec {
  selector: Record<string, string>;
  ports: Array<{
    port: number;
    targetPort: number;
    protocol?: string;
  }>;
  type?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
}
