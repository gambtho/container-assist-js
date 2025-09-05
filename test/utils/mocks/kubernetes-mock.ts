/**
 * ESM-compatible mock for @kubernetes/client-node
 */

import { jest } from '@jest/globals';

export const mockKubeConfig = {
  loadFromDefault: jest.fn(),
  loadFromFile: jest.fn(),
  loadFromString: jest.fn(),
  makeApiClient: jest.fn(),
  getContextObject: jest.fn(),
  setCurrentContext: jest.fn(),
  getUser: jest.fn(),
  getClusters: jest.fn(),
  getContexts: jest.fn(),
  getCurrentContext: jest.fn(() => 'default'),
  getCurrentCluster: jest.fn(() => ({
    name: 'mock-cluster',
    server: 'https://mock.k8s.local',
    skipTLSVerify: false
  }))
};

export const mockCoreV1Api = {
  // Namespace operations
  listNamespace: jest.fn(),
  createNamespace: jest.fn(),
  deleteNamespace: jest.fn(),
  readNamespace: jest.fn(),
  
  // Pod operations
  listNamespacedPod: jest.fn(),
  createNamespacedPod: jest.fn(),
  deleteNamespacedPod: jest.fn(),
  readNamespacedPod: jest.fn(),
  patchNamespacedPod: jest.fn(),
  listPodForAllNamespaces: jest.fn(),
  
  // Service operations
  listNamespacedService: jest.fn(),
  createNamespacedService: jest.fn(),
  deleteNamespacedService: jest.fn(),
  readNamespacedService: jest.fn(),
  patchNamespacedService: jest.fn(),
  
  // ConfigMap operations
  listNamespacedConfigMap: jest.fn(),
  createNamespacedConfigMap: jest.fn(),
  deleteNamespacedConfigMap: jest.fn(),
  readNamespacedConfigMap: jest.fn(),
  
  // Secret operations
  listNamespacedSecret: jest.fn(),
  createNamespacedSecret: jest.fn(),
  deleteNamespacedSecret: jest.fn(),
  readNamespacedSecret: jest.fn(),
  
  // Node operations
  listNode: jest.fn(),
  readNode: jest.fn(),
  
  // Other operations
  getAPIResources: jest.fn(),
};

export const mockAppsV1Api = {
  // Deployment operations
  createNamespacedDeployment: jest.fn(),
  deleteNamespacedDeployment: jest.fn(),
  readNamespacedDeployment: jest.fn(),
  patchNamespacedDeployment: jest.fn(),
  listNamespacedDeployment: jest.fn(),
  replaceNamespacedDeployment: jest.fn(),
  readNamespacedDeploymentStatus: jest.fn(),
  replaceNamespacedDeploymentScale: jest.fn(),
  
  // StatefulSet operations
  createNamespacedStatefulSet: jest.fn(),
  deleteNamespacedStatefulSet: jest.fn(),
  readNamespacedStatefulSet: jest.fn(),
  patchNamespacedStatefulSet: jest.fn(),
  listNamespacedStatefulSet: jest.fn(),
  
  // DaemonSet operations
  createNamespacedDaemonSet: jest.fn(),
  deleteNamespacedDaemonSet: jest.fn(),
  readNamespacedDaemonSet: jest.fn(),
  
  // ReplicaSet operations
  listNamespacedReplicaSet: jest.fn(),
  readNamespacedReplicaSet: jest.fn(),
};

export const mockCustomObjectsApi = {
  createNamespacedCustomObject: jest.fn(),
  getNamespacedCustomObject: jest.fn(),
  patchNamespacedCustomObject: jest.fn(),
  deleteNamespacedCustomObject: jest.fn(),
  listNamespacedCustomObject: jest.fn(),
};

// Mock response factory functions
export function createMockPodList(pods: any[] = []) {
  return {
    body: {
      items: pods,
      metadata: {
        resourceVersion: '1000',
        continue: undefined
      }
    },
    response: {
      statusCode: 200,
      headers: {}
    }
  };
}

export function createMockNamespaceList(namespaces: any[] = [
  { metadata: { name: 'default' } },
  { metadata: { name: 'kube-system' } }
]) {
  return {
    body: {
      items: namespaces,
      metadata: {
        resourceVersion: '1000'
      }
    },
    response: {
      statusCode: 200,
      headers: {}
    }
  };
}

// Also create direct response version for methods that expect unwrapped response
export function createMockNamespaceListDirect(namespaces: any[] = [
  { metadata: { name: 'default' } },
  { metadata: { name: 'kube-system' } }
]) {
  return {
    items: namespaces,
    metadata: {
      resourceVersion: '1000'
    }
  };
}

export function createMockDeployment(name = 'mock-deployment', namespace = 'default') {
  return {
    body: {
      metadata: {
        name,
        namespace,
        uid: 'mock-uid-' + name,
        resourceVersion: '1000',
        creationTimestamp: new Date().toISOString()
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
              name: 'container',
              image: 'nginx:latest'
            }]
          }
        }
      },
      status: {
        replicas: 1,
        readyReplicas: 1,
        availableReplicas: 1,
        conditions: []
      }
    },
    response: {
      statusCode: 200,
      headers: {}
    }
  };
}

export function createMockService(name = 'mock-service', namespace = 'default') {
  return {
    body: {
      metadata: {
        name,
        namespace,
        uid: 'mock-uid-' + name,
        resourceVersion: '1000'
      },
      spec: {
        selector: { app: name },
        ports: [{
          protocol: 'TCP',
          port: 80,
          targetPort: 8080
        }],
        type: 'ClusterIP'
      },
      status: {
        loadBalancer: {}
      }
    },
    response: {
      statusCode: 200,
      headers: {}
    }
  };
}

export function createMockError(message: string, code = 404) {
  const error = new Error(message) as any;
  error.response = {
    statusCode: code,
    body: {
      message,
      code,
      reason: 'NotFound'
    }
  };
  error.statusCode = code;
  error.body = error.response.body;
  return error;
}

// Error simulation functions
export function simulateKubeconfigLoadError() {
  const error = new Error('No kubeconfig found');
  mockKubeConfig.loadFromDefault.mockImplementation(() => {
    throw error;
  });
  mockKubeConfig.loadFromFile.mockImplementation(() => {
    throw error;
  });
}

// Setup function for tests
export function setupKubernetesMocks() {
  // Reset all mocks
  Object.values(mockKubeConfig).forEach(mock => {
    if (typeof mock === 'function' && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  });
  
  Object.values(mockCoreV1Api).forEach(mock => {
    if (typeof mock === 'function' && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  });
  
  Object.values(mockAppsV1Api).forEach(mock => {
    if (typeof mock === 'function' && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  });
  
  Object.values(mockCustomObjectsApi).forEach(mock => {
    if (typeof mock === 'function' && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  });
  
  // Set default behaviors
  mockKubeConfig.makeApiClient.mockImplementation((ApiType: any) => {
    if (ApiType.name === 'CoreV1Api') return mockCoreV1Api;
    if (ApiType.name === 'AppsV1Api') return mockAppsV1Api;
    if (ApiType.name === 'CustomObjectsApi') return mockCustomObjectsApi;
    return {};
  });
  
  mockKubeConfig.getCurrentContext.mockReturnValue('default');
  
  // Default successful responses
  mockCoreV1Api.listNamespace.mockResolvedValue(createMockNamespaceList());
  mockCoreV1Api.listNamespacedPod.mockImplementation((options?: any) => {
    return Promise.resolve(createMockPodList());
  });
  mockAppsV1Api.createNamespacedDeployment.mockResolvedValue(createMockDeployment());
  mockCoreV1Api.createNamespacedService.mockResolvedValue(createMockService());
  
  // API resources response
  mockCoreV1Api.getAPIResources.mockResolvedValue({
    groupVersion: 'v1',
    resources: []
  });
  
  // Node list for version detection
  mockCoreV1Api.listNode.mockResolvedValue({
    items: [{
      status: {
        nodeInfo: {
          kubeletVersion: 'v1.27.0',
          kubeProxyVersion: 'v1.27.0'
        }
      }
    }]
  });
}