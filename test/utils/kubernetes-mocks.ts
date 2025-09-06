/**
 * Kubernetes Testing Mock Utilities
 * Comprehensive mocks for Kubernetes client testing
 */

import { jest } from '@jest/globals';
import * as k8s from '@kubernetes/client-node';
import type {
  KubernetesManifest as K8sManifest,
  K8sDeploymentOptions,
  KubernetesDeploymentResult as K8sDeploymentResult,
  KubernetesService as K8sServiceStatus,
} from '../../src/types/k8s';

export interface MockKubeConfig {
  loadFromFile: ReturnType<typeof jest.fn>;
  loadFromDefault: ReturnType<typeof jest.fn>;
  setCurrentContext: ReturnType<typeof jest.fn>;
  makeApiClient: ReturnType<typeof jest.fn>;
}

export interface MockCoreV1Api {
  listNamespacedPod: ReturnType<typeof jest.fn>;
  listNamespace: ReturnType<typeof jest.fn>;
  createNamespace: ReturnType<typeof jest.fn>;
  createNamespacedService: ReturnType<typeof jest.fn>;
  createNamespacedConfigMap: ReturnType<typeof jest.fn>;
  createNamespacedSecret: ReturnType<typeof jest.fn>;
  getAPIResources: ReturnType<typeof jest.fn>;
  listNode: ReturnType<typeof jest.fn>;
}

export interface MockAppsV1Api {
  createNamespacedDeployment: ReturnType<typeof jest.fn>;
  readNamespacedDeployment: ReturnType<typeof jest.fn>;
  deleteNamespacedDeployment: ReturnType<typeof jest.fn>;
  listNamespacedDeployment: ReturnType<typeof jest.fn>;
  patchNamespacedDeployment: ReturnType<typeof jest.fn>;
}

export interface MockNetworkingV1Api {
  createNamespacedIngress: ReturnType<typeof jest.fn>;
  readNamespacedIngress: ReturnType<typeof jest.fn>;
  deleteNamespacedIngress: ReturnType<typeof jest.fn>;
}

export interface K8sApiMocks {
  kubeConfig: MockKubeConfig;
  coreApi: MockCoreV1Api;
  appsApi: MockAppsV1Api;
  networkingApi: MockNetworkingV1Api;
}

/**
 * Creates comprehensive mocks for all Kubernetes APIs
 */
export function createK8sApiMocks(): K8sApiMocks {
  const kubeConfig: MockKubeConfig = {
    loadFromFile: jest.fn(),
    loadFromDefault: jest.fn(),
    setCurrentContext: jest.fn(),
    makeApiClient: jest.fn(),
  };

  const coreApi: MockCoreV1Api = {
    listNamespacedPod: jest.fn(),
    listNamespace: jest.fn(),
    createNamespace: jest.fn(),
    createNamespacedService: jest.fn(),
    createNamespacedConfigMap: jest.fn(),
    createNamespacedSecret: jest.fn(),
    getAPIResources: jest.fn(),
    listNode: jest.fn(),
  };

  const appsApi: MockAppsV1Api = {
    createNamespacedDeployment: jest.fn(),
    readNamespacedDeployment: jest.fn(),
    deleteNamespacedDeployment: jest.fn(),
    listNamespacedDeployment: jest.fn(),
    patchNamespacedDeployment: jest.fn(),
  };

  const networkingApi: MockNetworkingV1Api = {
    createNamespacedIngress: jest.fn(),
    readNamespacedIngress: jest.fn(),
    deleteNamespacedIngress: jest.fn(),
  };

  return {
    kubeConfig,
    coreApi,
    appsApi,
    networkingApi,
  };
}

/**
 * Sets up the Kubernetes client-node module mocks
 */
export function setupK8sClientMocks(mocks: K8sApiMocks): void {
  // Mock class constructors
  (k8s.KubeConfig as any).mockImplementation(() => mocks.kubeConfig as any);
  (k8s.CoreV1Api as any).mockImplementation(() => mocks.coreApi as any);
  (k8s.AppsV1Api as any).mockImplementation(() => mocks.appsApi as any);

  // Setup makeApiClient to return appropriate mocks
  mocks.kubeConfig.makeApiClient.mockImplementation((apiClass: any) => {
    if (apiClass === k8s.CoreV1Api) return mocks.coreApi;
    if (apiClass === k8s.AppsV1Api) return mocks.appsApi;
    return null;
  });
}

/**
 * Creates mock Kubernetes manifests for testing
 */
export const createMockK8sManifests = {
  deployment: (name = 'test-app', namespace = 'default'): K8sManifest => ({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name,
      namespace,
      labels: { app: name },
    },
    spec: {
      replicas: 2,
      selector: {
        matchLabels: { app: name },
      },
      template: {
        metadata: {
          labels: { app: name },
        },
        spec: {
          containers: [
            {
              name,
              image: `${name}:latest`,
              ports: [{ containerPort: 3000 }],
              env: [
                { name: 'NODE_ENV', value: 'production' },
                { name: 'PORT', value: '3000' },
              ],
            },
          ],
        },
      },
    },
  }),

  service: (name = 'test-app-service', namespace = 'default'): K8sManifest => ({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name,
      namespace,
      labels: { app: name.replace('-service', '') },
    },
    spec: {
      selector: { app: name.replace('-service', '') },
      ports: [
        {
          port: 80,
          targetPort: 3000,
          protocol: 'TCP',
        },
      ],
      type: 'ClusterIP',
    },
  }),

  configMap: (name = 'test-config', namespace = 'default'): K8sManifest => ({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name,
      namespace,
    },
    data: {
      'app.properties': 'key=value\nother_key=other_value',
      'config.json': '{"debug": true, "port": 3000}',
    },
  }),

  secret: (name = 'test-secret', namespace = 'default'): K8sManifest => ({
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name,
      namespace,
    },
    type: 'Opaque',
    data: {
      username: 'YWRtaW4=', // base64 encoded 'admin'
      password: 'MWYyZDFlMmU2N2Rm', // base64 encoded '1f2d1e2e67df'
    },
  }),

  namespace: (name = 'test-namespace'): K8sManifest => ({
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name,
      labels: { purpose: 'testing' },
    },
  }),

  ingress: (name = 'test-ingress', namespace = 'default'): K8sManifest => ({
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name,
      namespace,
      annotations: {
        'nginx.ingress.kubernetes.io/rewrite-target': '/',
      },
    },
    spec: {
      rules: [
        {
          host: 'test-app.local',
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'test-app-service',
                    port: { number: 80 },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  }),
};

/**
 * Mock responses for Kubernetes API calls
 */
export const mockK8sResponses = {
  pods: {
    items: [
      {
        metadata: { name: 'test-pod-1', namespace: 'default' },
        status: { phase: 'Running' },
      },
      {
        metadata: { name: 'test-pod-2', namespace: 'default' },
        status: { phase: 'Running' },
      },
    ],
  },

  namespaces: {
    items: [
      { metadata: { name: 'default' } },
      { metadata: { name: 'kube-system' } },
      { metadata: { name: 'kube-public' } },
    ],
  },

  nodes: {
    items: [
      {
        metadata: { name: 'node-1' },
        status: { conditions: [{ type: 'Ready', status: 'True' }] },
      },
      {
        metadata: { name: 'node-2' },
        status: { conditions: [{ type: 'Ready', status: 'True' }] },
      },
    ],
  },

  deployment: {
    metadata: {
      name: 'test-app',
      namespace: 'default',
      labels: { app: 'test-app' },
    },
    status: {
      replicas: 2,
      readyReplicas: 2,
      availableReplicas: 2,
      conditions: [
        {
          type: 'Available',
          status: 'True',
          reason: 'MinimumReplicasAvailable',
        },
      ],
    },
  },

  service: {
    metadata: {
      name: 'test-app-service',
      namespace: 'default',
    },
    spec: {
      clusterIP: '10.96.123.45',
      ports: [{ port: 80, targetPort: 3000 }],
      type: 'ClusterIP',
    },
  },

  apiResources: {
    groupVersion: 'v1',
    resources: [
      { name: 'pods', singularName: 'pod', namespaced: true, kind: 'Pod' },
      { name: 'services', singularName: 'service', namespaced: true, kind: 'Service' },
    ],
  },
};

/**
 * Error mocks for testing error scenarios
 */
export const mockK8sErrors = {
  notFound: (resource = 'resource'): Error => {
    const error = new Error(`${resource} not found`) as any;
    error.statusCode = 404;
    return error;
  },

  conflict: (resource = 'resource'): Error => {
    const error = new Error(`${resource} already exists`) as any;
    error.statusCode = 409;
    return error;
  },

  forbidden: (action = 'action'): Error => {
    const error = new Error(`forbidden: cannot ${action}`) as any;
    error.statusCode = 403;
    return error;
  },

  timeout: (): Error => {
    const error = new Error('request timeout') as any;
    error.statusCode = 408;
    return error;
  },

  serverError: (): Error => {
    const error = new Error('internal server error') as any;
    error.statusCode = 500;
    return error;
  },

  connectionRefused: (): Error => {
    const error = new Error('Connection refused') as any;
    error.code = 'ECONNREFUSED';
    return error;
  },

  invalidConfig: (): Error => {
    return new Error('Invalid kubeconfig file');
  },
};

/**
 * Utility functions for setting up common test scenarios
 */
export const setupK8sScenarios = {
  /**
   * Sets up mocks for successful cluster initialization
   */
  successfulClusterInit: (mocks: K8sApiMocks): void => {
    mocks.coreApi.listNamespacedPod.mockResolvedValue(mockK8sResponses.pods);
    mocks.coreApi.getAPIResources.mockResolvedValue(mockK8sResponses.apiResources);
    mocks.coreApi.listNode.mockResolvedValue(mockK8sResponses.nodes);
    mocks.coreApi.listNamespace.mockResolvedValue(mockK8sResponses.namespaces);
  },

  /**
   * Sets up mocks for cluster connection failure
   */
  clusterConnectionFailure: (mocks: K8sApiMocks): void => {
    mocks.coreApi.listNamespacedPod.mockRejectedValue(mockK8sErrors.connectionRefused());
    mocks.coreApi.listNamespace.mockRejectedValue(mockK8sErrors.connectionRefused());
  },

  /**
   * Sets up mocks for successful deployment operations
   */
  successfulDeployment: (mocks: K8sApiMocks): void => {
    mocks.appsApi.createNamespacedDeployment.mockResolvedValue(mockK8sResponses.deployment);
    mocks.coreApi.createNamespacedService.mockResolvedValue(mockK8sResponses.service);
    mocks.coreApi.createNamespace.mockResolvedValue({});
  },

  /**
   * Sets up mocks for deployment conflicts (resources already exist)
   */
  deploymentConflicts: (mocks: K8sApiMocks): void => {
    mocks.appsApi.createNamespacedDeployment.mockRejectedValue(mockK8sErrors.conflict('deployment'));
    mocks.coreApi.createNamespacedService.mockRejectedValue(mockK8sErrors.conflict('service'));
    mocks.coreApi.createNamespace.mockRejectedValue(mockK8sErrors.conflict('namespace'));
  },

  /**
   * Sets up mocks for deployment failures
   */
  deploymentFailure: (mocks: K8sApiMocks): void => {
    mocks.appsApi.createNamespacedDeployment.mockRejectedValue(mockK8sErrors.serverError());
    mocks.coreApi.createNamespacedService.mockRejectedValue(mockK8sErrors.serverError());
  },

  /**
   * Sets up mocks for successful cleanup operations
   */
  successfulCleanup: (mocks: K8sApiMocks): void => {
    mocks.appsApi.deleteNamespacedDeployment.mockResolvedValue({});
    mocks.appsApi.readNamespacedDeployment.mockResolvedValue(mockK8sResponses.deployment);
  },

  /**
   * Sets up mocks for resource not found during cleanup
   */
  cleanupResourceNotFound: (mocks: K8sApiMocks): void => {
    mocks.appsApi.deleteNamespacedDeployment.mockRejectedValue(mockK8sErrors.notFound('deployment'));
    mocks.appsApi.readNamespacedDeployment.mockRejectedValue(mockK8sErrors.notFound('deployment'));
  },
};

/**
 * Creates a mock deployment result for testing
 */
export function createMockDeploymentResult(overrides?: Partial<K8sDeploymentResult>): K8sDeploymentResult {
  return {
    success: true,
    resources: [
      {
        kind: 'Deployment',
        name: 'test-app',
        namespace: 'default',
        status: 'created',
      },
      {
        kind: 'Service',
        name: 'test-app-service',
        namespace: 'default',
        status: 'created',
      },
    ],
    deployed: ['test-app', 'test-app-service'],
    failed: [],
    endpoints: [
      {
        name: 'test-app-service',
        service: 'test-app-service',
        url: 'http://test-app-service.default.svc.cluster.local',
        type: 'service',
        port: 80,
      },
    ],
    ...overrides,
  };
}

/**
 * Creates a mock service status for testing
 */
export function createMockServiceStatus(overrides?: Partial<K8sServiceStatus>): K8sServiceStatus {
  return {
    name: 'test-app',
    namespace: 'default',
    type: 'Deployment',
    clusterIP: '10.96.123.45',
    ports: [
      {
        port: 80,
        targetPort: 3000,
        protocol: 'TCP',
      },
    ],
    ...overrides,
  };
}
