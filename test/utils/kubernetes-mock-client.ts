/**
 * Mock Kubernetes Client for Integration Testing
 * Provides fallback when real K8s cluster is not available
 */

import type { Logger } from 'pino';
import { Result, Success, Failure } from '../../src/types/core.js';

export interface MockDeployment {
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
  };
  spec: {
    replicas: number;
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
          ports?: Array<{
            containerPort: number;
          }>;
        }>;
      };
    };
  };
  status?: {
    readyReplicas: number;
    availableReplicas: number;
  };
}

export interface MockService {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    selector: Record<string, string>;
    ports: Array<{
      port: number;
      targetPort: number;
      protocol?: string;
    }>;
    type?: string;
  };
}

export interface KubernetesTestContext {
  deployments: MockDeployment[];
  services: MockService[];
  namespace: string;
}

/**
 * Mock Kubernetes Client for testing when real cluster not available
 */
export class MockKubernetesClient {
  private deployments = new Map<string, MockDeployment>();
  private services = new Map<string, MockService>();
  private namespaces = new Set<string>(['default', 'kube-system']);
  
  constructor(private logger: Logger, private namespace = 'default') {}

  async createDeployment(deployment: MockDeployment): Promise<Result<MockDeployment>> {
    const key = `${deployment.metadata.namespace}/${deployment.metadata.name}`;
    
    // Simulate deployment creation delay
    await this.delay(100);
    
    // Add status to simulate successful deployment
    const deploymentWithStatus: MockDeployment = {
      ...deployment,
      status: {
        readyReplicas: deployment.spec.replicas,
        availableReplicas: deployment.spec.replicas
      }
    };
    
    this.deployments.set(key, deploymentWithStatus);
    this.logger.info({ deployment: deployment.metadata.name }, 'Mock deployment created');
    
    return Success(deploymentWithStatus);
  }

  async createService(service: MockService): Promise<Result<MockService>> {
    const key = `${service.metadata.namespace}/${service.metadata.name}`;
    
    // Simulate service creation delay
    await this.delay(50);
    
    this.services.set(key, service);
    this.logger.info({ service: service.metadata.name }, 'Mock service created');
    
    return Success(service);
  }

  async getDeployment(name: string, namespace = this.namespace): Promise<Result<MockDeployment>> {
    const key = `${namespace}/${name}`;
    const deployment = this.deployments.get(key);
    
    if (!deployment) {
      return Failure(`Deployment ${name} not found in namespace ${namespace}`);
    }
    
    return Success(deployment);
  }

  async getService(name: string, namespace = this.namespace): Promise<Result<MockService>> {
    const key = `${namespace}/${name}`;
    const service = this.services.get(key);
    
    if (!service) {
      return Failure(`Service ${name} not found in namespace ${namespace}`);
    }
    
    return Success(service);
  }

  async listDeployments(namespace = this.namespace): Promise<Result<MockDeployment[]>> {
    const deployments = Array.from(this.deployments.entries())
      .filter(([key]) => key.startsWith(`${namespace}/`))
      .map(([, deployment]) => deployment);
    
    return Success(deployments);
  }

  async listServices(namespace = this.namespace): Promise<Result<MockService[]>> {
    const services = Array.from(this.services.entries())
      .filter(([key]) => key.startsWith(`${namespace}/`))
      .map(([, service]) => service);
    
    return Success(services);
  }

  async deleteDeployment(name: string, namespace = this.namespace): Promise<Result<void>> {
    const key = `${namespace}/${name}`;
    
    if (!this.deployments.has(key)) {
      return Failure(`Deployment ${name} not found in namespace ${namespace}`);
    }
    
    this.deployments.delete(key);
    this.logger.info({ deployment: name }, 'Mock deployment deleted');
    
    return Success(undefined);
  }

  async deleteService(name: string, namespace = this.namespace): Promise<Result<void>> {
    const key = `${namespace}/${name}`;
    
    if (!this.services.has(key)) {
      return Failure(`Service ${name} not found in namespace ${namespace}`);
    }
    
    this.services.delete(key);
    this.logger.info({ service: name }, 'Mock service deleted');
    
    return Success(undefined);
  }

  async createNamespace(name: string): Promise<Result<void>> {
    if (this.namespaces.has(name)) {
      return Failure(`Namespace ${name} already exists`);
    }
    
    this.namespaces.add(name);
    this.logger.info({ namespace: name }, 'Mock namespace created');
    
    return Success(undefined);
  }

  async deleteNamespace(name: string): Promise<Result<void>> {
    if (!this.namespaces.has(name)) {
      return Failure(`Namespace ${name} not found`);
    }
    
    // Delete all resources in namespace
    const deploymentsToDelete = Array.from(this.deployments.keys())
      .filter(key => key.startsWith(`${name}/`));
    const servicesToDelete = Array.from(this.services.keys())
      .filter(key => key.startsWith(`${name}/`));
    
    deploymentsToDelete.forEach(key => this.deployments.delete(key));
    servicesToDelete.forEach(key => this.services.delete(key));
    
    this.namespaces.delete(name);
    this.logger.info({ namespace: name }, 'Mock namespace deleted');
    
    return Success(undefined);
  }

  async getClusterInfo(): Promise<Result<{ version: string; nodes: number }>> {
    return Success({
      version: 'v1.28.0-mock',
      nodes: 3
    });
  }

  async healthCheck(): Promise<Result<{ healthy: boolean; components: string[] }>> {
    return Success({
      healthy: true,
      components: ['api-server', 'etcd', 'scheduler', 'controller-manager']
    });
  }

  // Utility methods
  clear(): void {
    this.deployments.clear();
    this.services.clear();
    this.namespaces.clear();
    this.namespaces.add('default');
    this.namespaces.add('kube-system');
  }

  getStats() {
    return {
      deployments: this.deployments.size,
      services: this.services.size,
      namespaces: this.namespaces.size
    };
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Kubernetes Test Utilities
 */
export class KubernetesTestUtils {
  static createTestDeployment(name: string, image: string, namespace = 'default'): MockDeployment {
    return {
      metadata: {
        name,
        namespace,
        labels: {
          app: name,
          'test-id': `integration-test-${Date.now()}`
        }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: { app: name }
        },
        template: {
          metadata: {
            labels: { app: name }
          },
          spec: {
            containers: [{
              name: name,
              image,
              ports: [{
                containerPort: 8080
              }]
            }]
          }
        }
      }
    };
  }

  static createTestService(name: string, targetPort: number, namespace = 'default'): MockService {
    return {
      metadata: {
        name,
        namespace
      },
      spec: {
        selector: { app: name },
        ports: [{
          port: 80,
          targetPort,
          protocol: 'TCP'
        }],
        type: 'ClusterIP'
      }
    };
  }

  static createTestManifests(appName: string, image: string, namespace = 'default') {
    const deployment = this.createTestDeployment(appName, image, namespace);
    const service = this.createTestService(appName, 8080, namespace);
    
    return { deployment, service };
  }

  static validateDeployment(deployment: MockDeployment): string[] {
    const errors: string[] = [];
    
    if (!deployment.metadata?.name) {
      errors.push('Deployment name is required');
    }
    
    if (!deployment.spec?.replicas || deployment.spec.replicas < 0) {
      errors.push('Deployment replicas must be a positive number');
    }
    
    if (!deployment.spec?.template?.spec?.containers?.length) {
      errors.push('Deployment must have at least one container');
    }
    
    deployment.spec?.template?.spec?.containers?.forEach((container, index) => {
      if (!container.name) {
        errors.push(`Container ${index} missing name`);
      }
      if (!container.image) {
        errors.push(`Container ${index} missing image`);
      }
    });
    
    return errors;
  }

  static validateService(service: MockService): string[] {
    const errors: string[] = [];
    
    if (!service.metadata?.name) {
      errors.push('Service name is required');
    }
    
    if (!service.spec?.ports?.length) {
      errors.push('Service must have at least one port');
    }
    
    service.spec?.ports?.forEach((port, index) => {
      if (!port.port || port.port < 1 || port.port > 65535) {
        errors.push(`Service port ${index} must be between 1 and 65535`);
      }
      if (!port.targetPort || port.targetPort < 1 || port.targetPort > 65535) {
        errors.push(`Service target port ${index} must be between 1 and 65535`);
      }
    });
    
    return errors;
  }
}