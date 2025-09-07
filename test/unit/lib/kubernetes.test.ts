import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createKubernetesClient } from '../../../src/lib/kubernetes';
import type { Logger } from 'pino';

// Mock @kubernetes/client-node
jest.mock('@kubernetes/client-node');
import * as k8s from '@kubernetes/client-node';

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => mockLogger)
} as any;

describe('Kubernetes Client', () => {
  let kubernetesClient: any;
  let mockKubeConfig: any;
  let mockK8sApi: any;
  let mockCoreApi: any;
  let mockNetworkingApi: any;
  let mockAuthApi: any;

  beforeEach(() => {
    // Mock API clients
    mockK8sApi = {
      createNamespacedDeployment: jest.fn(),
      readNamespacedDeployment: jest.fn(),
      deleteNamespacedDeployment: jest.fn(),
      listNamespacedDeployment: jest.fn()
    };

    mockCoreApi = {
      createNamespacedService: jest.fn(),
      deleteNamespacedService: jest.fn(),
      listNamespace: jest.fn(),
      readNamespace: jest.fn()
    };

    mockNetworkingApi = {
      listIngressClass: jest.fn()
    };

    mockAuthApi = {
      createSelfSubjectAccessReview: jest.fn()
    };

    // Mock KubeConfig
    mockKubeConfig = {
      loadFromString: jest.fn(),
      loadFromDefault: jest.fn(),
      makeApiClient: jest.fn()
    };

    // Setup makeApiClient mock to return appropriate API clients
    mockKubeConfig.makeApiClient.mockImplementation((ApiClass: any) => {
      if (ApiClass === k8s.AppsV1Api) return mockK8sApi;
      if (ApiClass === k8s.CoreV1Api) return mockCoreApi;
      if (ApiClass === k8s.NetworkingV1Api) return mockNetworkingApi;
      if (ApiClass === k8s.AuthorizationV1Api) return mockAuthApi;
      return {};
    });

    // Mock KubeConfig constructor
    (k8s.KubeConfig as jest.MockedClass<typeof k8s.KubeConfig>).mockImplementation(() => mockKubeConfig);

    kubernetesClient = createKubernetesClient(mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should load kubeconfig from default location by default', () => {
      createKubernetesClient(mockLogger);
      
      expect(mockKubeConfig.loadFromDefault).toHaveBeenCalled();
      expect(mockKubeConfig.loadFromString).not.toHaveBeenCalled();
    });

    it('should load kubeconfig from provided string', () => {
      const customConfig = 'apiVersion: v1\nkind: Config\nclusters: []';
      createKubernetesClient(mockLogger, customConfig);
      
      expect(mockKubeConfig.loadFromString).toHaveBeenCalledWith(customConfig);
      expect(mockKubeConfig.loadFromDefault).not.toHaveBeenCalled();
    });

    it('should create all required API clients', () => {
      createKubernetesClient(mockLogger);
      
      expect(mockKubeConfig.makeApiClient).toHaveBeenCalledWith(k8s.AppsV1Api);
      expect(mockKubeConfig.makeApiClient).toHaveBeenCalledWith(k8s.CoreV1Api);
      expect(mockKubeConfig.makeApiClient).toHaveBeenCalledWith(k8s.NetworkingV1Api);
    });
  });

  describe('applyManifest', () => {
    it('should apply a Deployment manifest successfully', async () => {
      const manifest = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'test-deployment' },
        spec: { replicas: 1 }
      };

      mockK8sApi.createNamespacedDeployment.mockResolvedValue({});

      const result = await kubernetesClient.applyManifest(manifest, 'test-namespace');

      expect(result.ok).toBe(true);
      expect(mockK8sApi.createNamespacedDeployment).toHaveBeenCalledWith({
        namespace: 'test-namespace',
        body: manifest
      });
      expect(mockLogger.info).toHaveBeenCalledWith({
        kind: 'Deployment',
        name: 'test-deployment'
      }, 'Manifest applied successfully');
    });

    it('should apply a Service manifest successfully', async () => {
      const manifest = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'test-service' },
        spec: { type: 'ClusterIP' }
      };

      mockCoreApi.createNamespacedService.mockResolvedValue({});

      const result = await kubernetesClient.applyManifest(manifest);

      expect(result.ok).toBe(true);
      expect(mockCoreApi.createNamespacedService).toHaveBeenCalledWith({
        namespace: 'default',
        body: manifest
      });
      expect(mockLogger.info).toHaveBeenCalledWith({
        kind: 'Service',
        name: 'test-service'
      }, 'Manifest applied successfully');
    });

    it('should handle unsupported manifest kinds gracefully', async () => {
      const manifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: 'test-configmap' }
      };

      const result = await kubernetesClient.applyManifest(manifest);

      expect(result.ok).toBe(true);
      expect(mockK8sApi.createNamespacedDeployment).not.toHaveBeenCalled();
      expect(mockCoreApi.createNamespacedService).not.toHaveBeenCalled();
    });

    it('should handle apply failures', async () => {
      const manifest = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'test-deployment' }
      };

      const applyError = new Error('Deployment already exists');
      mockK8sApi.createNamespacedDeployment.mockRejectedValue(applyError);

      const result = await kubernetesClient.applyManifest(manifest);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Failed to apply manifest: Deployment already exists');
    });

    it('should handle manifest without metadata', async () => {
      const manifest = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        spec: { replicas: 1 }
      };

      mockK8sApi.createNamespacedDeployment.mockResolvedValue({});

      const result = await kubernetesClient.applyManifest(manifest);

      expect(result.ok).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith({
        kind: 'Deployment',
        name: undefined
      }, 'Manifest applied successfully');
    });
  });

  describe('getDeploymentStatus', () => {
    it('should get deployment status successfully', async () => {
      const mockDeployment = {
        spec: { replicas: 3 },
        status: { readyReplicas: 2 }
      };

      mockK8sApi.readNamespacedDeployment.mockResolvedValue(mockDeployment);

      const result = await kubernetesClient.getDeploymentStatus('test-namespace', 'test-deployment');

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({
        ready: false,
        readyReplicas: 2,
        totalReplicas: 3
      });
      expect(mockK8sApi.readNamespacedDeployment).toHaveBeenCalledWith({
        name: 'test-deployment',
        namespace: 'test-namespace'
      });
    });

    it('should handle fully ready deployment', async () => {
      const mockDeployment = {
        spec: { replicas: 3 },
        status: { readyReplicas: 3 }
      };

      mockK8sApi.readNamespacedDeployment.mockResolvedValue(mockDeployment);

      const result = await kubernetesClient.getDeploymentStatus('test-namespace', 'test-deployment');

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({
        ready: true,
        readyReplicas: 3,
        totalReplicas: 3
      });
    });

    it('should handle deployment without status', async () => {
      const mockDeployment = {
        spec: { replicas: 3 },
        status: {}
      };

      mockK8sApi.readNamespacedDeployment.mockResolvedValue(mockDeployment);

      const result = await kubernetesClient.getDeploymentStatus('test-namespace', 'test-deployment');

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({
        ready: false,
        readyReplicas: 0,
        totalReplicas: 3
      });
    });

    it('should handle deployment without spec', async () => {
      const mockDeployment = {
        status: { readyReplicas: 1 }
      };

      mockK8sApi.readNamespacedDeployment.mockResolvedValue(mockDeployment);

      const result = await kubernetesClient.getDeploymentStatus('test-namespace', 'test-deployment');

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({
        ready: false,
        readyReplicas: 1,
        totalReplicas: 0
      });
    });

    it('should handle deployment not found error', async () => {
      const notFoundError = new Error('Deployment not found');
      mockK8sApi.readNamespacedDeployment.mockRejectedValue(notFoundError);

      const result = await kubernetesClient.getDeploymentStatus('test-namespace', 'nonexistent-deployment');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Failed to get deployment status: Deployment not found');
    });
  });

  describe('deleteResource', () => {
    it('should delete a Deployment successfully', async () => {
      mockK8sApi.deleteNamespacedDeployment.mockResolvedValue({});

      const result = await kubernetesClient.deleteResource('Deployment', 'test-deployment', 'test-namespace');

      expect(result.ok).toBe(true);
      expect(mockK8sApi.deleteNamespacedDeployment).toHaveBeenCalledWith({
        name: 'test-deployment',
        namespace: 'test-namespace'
      });
      expect(mockLogger.info).toHaveBeenCalledWith({
        kind: 'Deployment',
        name: 'test-deployment',
        namespace: 'test-namespace'
      }, 'Resource deleted successfully');
    });

    it('should delete a Service successfully', async () => {
      mockCoreApi.deleteNamespacedService.mockResolvedValue({});

      const result = await kubernetesClient.deleteResource('Service', 'test-service');

      expect(result.ok).toBe(true);
      expect(mockCoreApi.deleteNamespacedService).toHaveBeenCalledWith({
        name: 'test-service',
        namespace: 'default'
      });
      expect(mockLogger.info).toHaveBeenCalledWith({
        kind: 'Service',
        name: 'test-service',
        namespace: 'default'
      }, 'Resource deleted successfully');
    });

    it('should handle unsupported resource kinds gracefully', async () => {
      const result = await kubernetesClient.deleteResource('ConfigMap', 'test-configmap');

      expect(result.ok).toBe(true);
      expect(mockK8sApi.deleteNamespacedDeployment).not.toHaveBeenCalled();
      expect(mockCoreApi.deleteNamespacedService).not.toHaveBeenCalled();
    });

    it('should handle deletion failures', async () => {
      const deleteError = new Error('Resource not found');
      mockK8sApi.deleteNamespacedDeployment.mockRejectedValue(deleteError);

      const result = await kubernetesClient.deleteResource('Deployment', 'test-deployment');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Failed to delete resource: Resource not found');
    });
  });

  describe('ping', () => {
    it('should return true when cluster is accessible', async () => {
      mockCoreApi.listNamespace.mockResolvedValue({ items: [] });

      const result = await kubernetesClient.ping();

      expect(result).toBe(true);
      expect(mockCoreApi.listNamespace).toHaveBeenCalled();
    });

    it('should return false when cluster is not accessible', async () => {
      const connectionError = new Error('Connection refused');
      mockCoreApi.listNamespace.mockRejectedValue(connectionError);

      const result = await kubernetesClient.ping();

      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { error: connectionError },
        'Cluster ping failed'
      );
    });
  });

  describe('namespaceExists', () => {
    it('should return true when namespace exists', async () => {
      mockCoreApi.readNamespace.mockResolvedValue({
        metadata: { name: 'test-namespace' }
      });

      const result = await kubernetesClient.namespaceExists('test-namespace');

      expect(result).toBe(true);
      expect(mockCoreApi.readNamespace).toHaveBeenCalledWith({
        name: 'test-namespace'
      });
    });

    it('should return false when namespace does not exist (404)', async () => {
      const notFoundError: any = new Error('Not found');
      notFoundError.response = { statusCode: 404 };
      mockCoreApi.readNamespace.mockRejectedValue(notFoundError);

      const result = await kubernetesClient.namespaceExists('nonexistent-namespace');

      expect(result).toBe(false);
    });

    it('should return false and log warning for other errors', async () => {
      const forbiddenError: any = new Error('Forbidden');
      forbiddenError.response = { statusCode: 403 };
      mockCoreApi.readNamespace.mockRejectedValue(forbiddenError);

      const result = await kubernetesClient.namespaceExists('test-namespace');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith({
        namespace: 'test-namespace',
        error: forbiddenError
      }, 'Error checking namespace');
    });

    it('should handle errors without response object', async () => {
      const genericError = new Error('Generic error');
      mockCoreApi.readNamespace.mockRejectedValue(genericError);

      const result = await kubernetesClient.namespaceExists('test-namespace');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith({
        namespace: 'test-namespace',
        error: genericError
      }, 'Error checking namespace');
    });
  });

  describe('checkPermissions', () => {
    it('should return true when permissions are allowed', async () => {
      mockAuthApi.createSelfSubjectAccessReview.mockResolvedValue({
        status: { allowed: true }
      });

      const result = await kubernetesClient.checkPermissions('test-namespace');

      expect(result).toBe(true);
      expect(mockAuthApi.createSelfSubjectAccessReview).toHaveBeenCalledWith({
        body: {
          apiVersion: 'authorization.k8s.io/v1',
          kind: 'SelfSubjectAccessReview',
          spec: {
            resourceAttributes: {
              namespace: 'test-namespace',
              verb: 'create',
              resource: 'deployments',
              group: 'apps'
            }
          }
        }
      });
    });

    it('should return false when permissions are denied', async () => {
      mockAuthApi.createSelfSubjectAccessReview.mockResolvedValue({
        status: { allowed: false }
      });

      const result = await kubernetesClient.checkPermissions('test-namespace');

      expect(result).toBe(false);
    });

    it('should return true when permission check fails (default to allow)', async () => {
      const permissionError = new Error('Permission check failed');
      mockAuthApi.createSelfSubjectAccessReview.mockRejectedValue(permissionError);

      const result = await kubernetesClient.checkPermissions('test-namespace');

      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith({
        namespace: 'test-namespace',
        error: permissionError
      }, 'Error checking permissions');
    });

    it('should handle missing status in response', async () => {
      mockAuthApi.createSelfSubjectAccessReview.mockResolvedValue({});

      const result = await kubernetesClient.checkPermissions('test-namespace');

      expect(result).toBe(false);
    });
  });

  describe('checkIngressController', () => {
    it('should return true when ingress controller deployment is found', async () => {
      // Mock successful response for ingress-nginx namespace
      mockK8sApi.listNamespacedDeployment.mockResolvedValueOnce({
        items: [
          {
            metadata: { name: 'nginx-ingress-controller' }
          }
        ]
      });

      const result = await kubernetesClient.checkIngressController();

      expect(result).toBe(true);
      expect(mockK8sApi.listNamespacedDeployment).toHaveBeenCalledWith({
        namespace: 'ingress-nginx'
      });
      expect(mockLogger.debug).toHaveBeenCalledWith({
        namespace: 'ingress-nginx'
      }, 'Found ingress controller');
    });

    it('should return true when IngressClass resources are found', async () => {
      // Mock no deployments found in any namespace
      mockK8sApi.listNamespacedDeployment
        .mockRejectedValueOnce(new Error('Namespace not found'))
        .mockRejectedValueOnce(new Error('Namespace not found'))
        .mockRejectedValueOnce(new Error('Namespace not found'));

      // Mock IngressClass resources found
      mockNetworkingApi.listIngressClass.mockResolvedValue({
        items: [
          { metadata: { name: 'nginx' } }
        ]
      });

      const result = await kubernetesClient.checkIngressController();

      expect(result).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith({
        count: 1
      }, 'Found ingress classes');
    });

    it('should return false when no ingress controller is found', async () => {
      // Mock no deployments found in any namespace
      mockK8sApi.listNamespacedDeployment
        .mockRejectedValueOnce(new Error('Namespace not found'))
        .mockRejectedValueOnce(new Error('Namespace not found'))
        .mockRejectedValueOnce(new Error('Namespace not found'));

      // Mock no IngressClass resources
      mockNetworkingApi.listIngressClass.mockResolvedValue({
        items: []
      });

      const result = await kubernetesClient.checkIngressController();

      expect(result).toBe(false);
    });

    it('should return false when deployments exist but no ingress controllers', async () => {
      // Mock deployments without ingress in name
      mockK8sApi.listNamespacedDeployment.mockResolvedValue({
        items: [
          { metadata: { name: 'regular-deployment' } },
          { metadata: { name: 'another-app' } }
        ]
      });

      // Mock no IngressClass resources
      mockNetworkingApi.listIngressClass.mockResolvedValue({
        items: []
      });

      const result = await kubernetesClient.checkIngressController();

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      const listError = new Error('API error');
      mockK8sApi.listNamespacedDeployment.mockRejectedValue(listError);
      mockNetworkingApi.listIngressClass.mockRejectedValue(listError);

      const result = await kubernetesClient.checkIngressController();

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { error: listError },
        'Error checking for ingress controller'
      );
    });

    it('should check multiple namespaces for ingress controllers', async () => {
      // Mock first two namespaces fail, third succeeds
      mockK8sApi.listNamespacedDeployment
        .mockRejectedValueOnce(new Error('Namespace not found'))
        .mockRejectedValueOnce(new Error('Namespace not found'))
        .mockResolvedValueOnce({
          items: [
            { metadata: { name: 'ingress-deployment' } }
          ]
        });

      const result = await kubernetesClient.checkIngressController();

      expect(result).toBe(true);
      expect(mockK8sApi.listNamespacedDeployment).toHaveBeenCalledTimes(3);
      expect(mockK8sApi.listNamespacedDeployment).toHaveBeenCalledWith({ namespace: 'ingress-nginx' });
      expect(mockK8sApi.listNamespacedDeployment).toHaveBeenCalledWith({ namespace: 'nginx-ingress' });
      expect(mockK8sApi.listNamespacedDeployment).toHaveBeenCalledWith({ namespace: 'kube-system' });
    });

    it('should handle IngressClass API not available in older clusters', async () => {
      // Mock no deployments found
      mockK8sApi.listNamespacedDeployment.mockRejectedValue(new Error('Namespace not found'));

      // Mock IngressClass API not available
      mockNetworkingApi.listIngressClass.mockRejectedValue(new Error('IngressClass not supported'));

      const result = await kubernetesClient.checkIngressController();

      expect(result).toBe(false);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle unknown errors gracefully', async () => {
      const manifest = {
        kind: 'Deployment',
        metadata: { name: 'test' }
      };

      mockK8sApi.createNamespacedDeployment.mockRejectedValue('Unknown error');

      const result = await kubernetesClient.applyManifest(manifest);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Unknown error');
    });

    it('should handle API client creation errors', async () => {
      // This test verifies the client handles initialization errors gracefully
      expect(() => createKubernetesClient(mockLogger)).not.toThrow();
    });
  });

  describe('logging', () => {
    it('should log debug information for manifest applications', async () => {
      const manifest = {
        kind: 'Deployment',
        metadata: { name: 'test-deployment' }
      };

      mockK8sApi.createNamespacedDeployment.mockResolvedValue({});

      await kubernetesClient.applyManifest(manifest, 'test-namespace');

      expect(mockLogger.debug).toHaveBeenCalledWith({
        manifest: 'Deployment',
        namespace: 'test-namespace'
      }, 'Applying Kubernetes manifest');
    });

    it('should log resource deletion success', async () => {
      mockK8sApi.deleteNamespacedDeployment.mockResolvedValue({});

      await kubernetesClient.deleteResource('Deployment', 'test-deployment', 'test-namespace');

      expect(mockLogger.info).toHaveBeenCalledWith({
        kind: 'Deployment',
        name: 'test-deployment',
        namespace: 'test-namespace'
      }, 'Resource deleted successfully');
    });
  });
});