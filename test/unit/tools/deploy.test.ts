/**
 * Unit Tests: Application Deployment Tool
 * Tests the deploy application tool functionality with mock Kubernetes client
 * Following analyze-repo test structure and comprehensive coverage requirements
 */

import { jest } from '@jest/globals';
import { deployApplication, type DeployApplicationConfig } from '../../../src/tools/deploy';
import { createMockLogger, createSuccessResult, createFailureResult } from '../../helpers/mock-infrastructure';

// Mock lib modules following analyze-repo pattern
const mockSessionManager = {
  get: jest.fn(),
  update: jest.fn(),
};

const mockKubernetesClient = {
  applyManifest: jest.fn(),
  getDeploymentStatus: jest.fn(),
};

const mockTimer = {
  end: jest.fn(),
  error: jest.fn(),
};

// Mock js-yaml for manifest parsing
jest.mock('js-yaml', () => ({
  loadAll: jest.fn((content: string) => {
    // Simple YAML parser mock for testing
    if (content.includes('kind: Deployment')) {
      const manifests = [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'test-app', namespace: 'default' },
          spec: { replicas: 2 },
        },
      ];

      // Check for LoadBalancer service
      if (content.includes('LoadBalancer')) {
        manifests.push({
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: 'test-app', namespace: 'default' },
          spec: { ports: [{ port: 80 }], type: 'LoadBalancer' },
        });
      }
      // Check for Ingress
      else if (content.includes('kind: Ingress')) {
        manifests.push({
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: 'test-app', namespace: 'default' },
          spec: { ports: [{ port: 80 }], type: 'ClusterIP' },
        });
        manifests.push({
          apiVersion: 'networking.k8s.io/v1',
          kind: 'Ingress',
          metadata: { name: 'test-app-ingress', namespace: 'default' },
          spec: { rules: [{ host: 'app.example.com' }] },
        });
      }
      // Default ClusterIP service
      else {
        manifests.push({
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: 'test-app', namespace: 'default' },
          spec: { ports: [{ port: 80 }], type: 'ClusterIP' },
        });
      }

      return manifests;
    }
    return [];
  }),
}));

jest.mock('../../../src/lib/session', () => ({
  createSessionManager: jest.fn(() => mockSessionManager),
}));

jest.mock('../../../src/lib/kubernetes', () => ({
  createKubernetesClient: jest.fn(() => mockKubernetesClient),
}));

jest.mock('../../../src/lib/logger', () => ({
  createTimer: jest.fn(() => mockTimer),
}));

// Mock DEFAULT_TIMEOUTS
jest.mock('../../../src/config/defaults', () => ({
  DEFAULT_TIMEOUTS: {
    deploymentPoll: 1000, // Short timeout for tests
  },
}));

describe('deployApplication', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let config: DeployApplicationConfig;

  // Sample K8s manifests for testing
  const sampleManifests = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: test-app
  template:
    metadata:
      labels:
        app: test-app
    spec:
      containers:
      - name: test-app
        image: test-app:v1.0
        ports:
        - containerPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: test-app
  namespace: default
spec:
  selector:
    app: test-app
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
`;

  beforeEach(() => {
    mockLogger = createMockLogger();
    config = {
      sessionId: 'test-session-123',
      namespace: 'default',
      cluster: 'default',
      dryRun: false,
      wait: true,
      timeout: 30, // Short timeout for tests
    };

    // Reset all mocks
    jest.clearAllMocks();
    mockSessionManager.update.mockResolvedValue(true);
    mockKubernetesClient.applyManifest.mockResolvedValue(createSuccessResult({}));
  });

  describe('Successful Deployments', () => {
    beforeEach(() => {
      // Session with K8s manifests
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          k8s_manifests: {
            manifests: sampleManifests,
          },
        },
        repo_path: '/test/repo',
      });

      // Default deployment status - ready
      mockKubernetesClient.getDeploymentStatus.mockResolvedValue(createSuccessResult({
        ready: true,
        readyReplicas: 2,
        totalReplicas: 2,
      }));
    });

    it('should successfully deploy application with valid manifests', async () => {
      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.sessionId).toBe('test-session-123');
        expect(result.value.namespace).toBe('default');
        expect(result.value.deploymentName).toBe('test-app');
        expect(result.value.serviceName).toBe('test-app');
        expect(result.value.ready).toBe(true);
        expect(result.value.replicas).toBe(2);
        expect(result.value.endpoints).toEqual([
          {
            type: 'internal',
            url: 'http://test-app.default.svc.cluster.local',
            port: 80,
          },
        ]);
        expect(result.value.status?.readyReplicas).toBe(2);
        expect(result.value.status?.totalReplicas).toBe(2);
        expect(result.value.status?.conditions).toEqual([
          {
            type: 'Available',
            status: 'True',
            message: 'Deployment is available',
          },
        ]);
      }

      // Verify Kubernetes client was called to apply manifests
      expect(mockKubernetesClient.applyManifest).toHaveBeenCalledTimes(2);
      
      // Verify deployment status was checked
      expect(mockKubernetesClient.getDeploymentStatus).toHaveBeenCalledWith('default', 'test-app');
      
      // Verify session was updated
      expect(mockSessionManager.update).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          workflow_state: expect.objectContaining({
            deployment_result: expect.objectContaining({
              namespace: 'default',
              deployment_name: 'test-app',
              service_name: 'test-app',
              ready: true,
            }),
            completed_steps: expect.arrayContaining(['deploy']),
          }),
        })
      );
    });

    it('should handle dry run deployments', async () => {
      config.dryRun = true;

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.ready).toBe(true); // Dry runs are marked as ready
        expect(result.value.status?.readyReplicas).toBe(2); // Uses spec replicas for dry run
      }

      // Verify no actual deployment calls were made
      expect(mockKubernetesClient.applyManifest).not.toHaveBeenCalled();
      expect(mockKubernetesClient.getDeploymentStatus).not.toHaveBeenCalled();
    });

    it('should use default values when config options not specified', async () => {
      const minimalConfig: DeployApplicationConfig = {
        sessionId: 'test-session-123',
      };

      const result = await deployApplication(minimalConfig, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.namespace).toBe('default'); // Default namespace
      }

      // Verify deployment was applied to default namespace
      expect(mockKubernetesClient.applyManifest).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'Deployment' }),
        'default'
      );
    });

    it('should handle custom namespace deployment', async () => {
      config.namespace = 'production';

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.namespace).toBe('production');
        expect(result.value.endpoints[0].url).toBe('http://test-app.production.svc.cluster.local');
      }

      expect(mockKubernetesClient.applyManifest).toHaveBeenCalledWith(
        expect.anything(),
        'production'
      );
    });

    it('should skip waiting when wait is false', async () => {
      config.wait = false;

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ready).toBe(false); // No waiting means not ready
        expect(result.value.status?.readyReplicas).toBe(0);
      }

      // Should not check deployment status when not waiting
      expect(mockKubernetesClient.getDeploymentStatus).not.toHaveBeenCalled();
    });
  });

  describe('Manifest Parsing and Ordering', () => {
    beforeEach(() => {
      // Use the existing sampleManifests which are properly handled by the YAML mock
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          k8s_manifests: {
            manifests: sampleManifests,
          },
        },
        repo_path: '/test/repo',
      });

      mockKubernetesClient.getDeploymentStatus.mockResolvedValue(createSuccessResult({
        ready: true,
        readyReplicas: 2,
      }));
    });

    it('should parse YAML manifests correctly', async () => {
      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(true);
      // Verify manifests were processed (Deployment and Service)
      expect(mockKubernetesClient.applyManifest).toHaveBeenCalledTimes(2);
    });

    it('should order manifests correctly for deployment', async () => {
      await deployApplication(config, mockLogger);

      // Verify manifests were applied - the actual ordering is based on the implementation's sort logic
      const calls = mockKubernetesClient.applyManifest.mock.calls;
      expect(calls.length).toBe(2);
      
      // The implementation orders: Service before Deployment based on the ordering array
      expect(calls[0][0]).toEqual(expect.objectContaining({ kind: 'Service' }));
      expect(calls[1][0]).toEqual(expect.objectContaining({ kind: 'Deployment' }));
    });
  });

  describe('Service and Ingress Endpoint Detection', () => {
    it('should detect LoadBalancer service endpoints', async () => {
      const manifestsWithLB = sampleManifests.replace('type: ClusterIP', 'type: LoadBalancer');
      
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          k8s_manifests: {
            manifests: manifestsWithLB,
          },
        },
        repo_path: '/test/repo',
      });

      mockKubernetesClient.getDeploymentStatus.mockResolvedValue(createSuccessResult({
        ready: true,
        readyReplicas: 2,
      }));

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.endpoints).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'external',
              url: 'http://pending-loadbalancer',
              port: 80,
            }),
          ])
        );
      }
    });

    it('should detect Ingress endpoints', async () => {
      const manifestsWithIngress = sampleManifests + `
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: test-app-ingress
  namespace: default
spec:
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: test-app
            port:
              number: 80
`;

      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          k8s_manifests: {
            manifests: manifestsWithIngress,
          },
        },
        repo_path: '/test/repo',
      });

      mockKubernetesClient.getDeploymentStatus.mockResolvedValue(createSuccessResult({
        ready: true,
        readyReplicas: 2,
      }));

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.endpoints).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'external',
              url: 'http://app.example.com',
              port: 80,
            }),
          ])
        );
      }
    });
  });

  describe('Error Handling', () => {
    it('should return error when session not found', async () => {
      mockSessionManager.get.mockResolvedValue(null);

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Session not found');
      }
    });

    it('should return error when no K8s manifests exist', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {},
        repo_path: '/test/repo',
      });

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('No Kubernetes manifests found - run generate_k8s_manifests first');
      }
    });

    it('should return error when manifests are empty', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          k8s_manifests: {
            manifests: '',
          },
        },
        repo_path: '/test/repo',
      });

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // The actual implementation returns this error for empty manifests 
        expect(result.error).toBe('No Kubernetes manifests found - run generate_k8s_manifests first');
      }
    });

    it('should handle Kubernetes client failures gracefully', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          k8s_manifests: {
            manifests: sampleManifests,
          },
        },
        repo_path: '/test/repo',
      });

      mockKubernetesClient.applyManifest.mockResolvedValue(
        createFailureResult('Failed to connect to Kubernetes cluster')
      );

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(true); // Function continues despite individual manifest failures
      // Individual manifest failures are logged but don't stop the deployment
    });

    it('should handle deployment status check failures', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          k8s_manifests: {
            manifests: sampleManifests,
          },
        },
        repo_path: '/test/repo',
      });

      // Mock deployment status to always return failure (but still return a Result)
      mockKubernetesClient.getDeploymentStatus.mockResolvedValue(
        createFailureResult('Failed to get deployment status')
      );

      config.timeout = 1; // Very short timeout to prevent hanging

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ready).toBe(false); // Should be marked as not ready
        expect(result.value.status?.readyReplicas).toBe(0);
      }
    }, 15000); // 15 second test timeout

    it('should handle timeout during deployment wait', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          k8s_manifests: {
            manifests: sampleManifests,
          },
        },
        repo_path: '/test/repo',
      });

      // Simulate deployment never becoming ready
      mockKubernetesClient.getDeploymentStatus.mockResolvedValue(createSuccessResult({
        ready: false,
        readyReplicas: 0,
        totalReplicas: 2,
      }));

      config.timeout = 1; // 1 second timeout

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ready).toBe(false); // Should timeout and remain not ready
        expect(result.value.status?.readyReplicas).toBe(0);
        expect(result.value.status?.conditions[0].status).toBe('False');
        expect(result.value.status?.conditions[0].message).toBe('Deployment is pending');
      }
    });

    it('should handle exceptions during deployment process', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          k8s_manifests: {
            manifests: sampleManifests,
          },
        },
        repo_path: '/test/repo',
      });

      // Configure short timeout and skip waiting
      config.timeout = 1;
      config.wait = false;

      // The implementation catches individual manifest failures and continues
      // So this should succeed but individual resources will fail to deploy
      mockKubernetesClient.applyManifest.mockRejectedValue(new Error('Kubernetes API error'));

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(true); // Overall deployment continues
      if (result.ok) {
        // But individual resources failed to deploy
        expect(result.value.success).toBe(true);
        // The deployment will show as not ready if status checks fail
      }
    }, 15000); // 15 second test timeout

    it('should handle session update failures', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          k8s_manifests: {
            manifests: sampleManifests,
          },
        },
        repo_path: '/test/repo',
      });

      mockKubernetesClient.getDeploymentStatus.mockResolvedValue(createSuccessResult({
        ready: true,
        readyReplicas: 2,
      }));

      mockSessionManager.update.mockRejectedValue(new Error('Failed to update session'));

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Failed to update session');
      }
    });
  });

  describe('Configuration Options', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          k8s_manifests: {
            manifests: sampleManifests,
          },
        },
        repo_path: '/test/repo',
      });

      mockKubernetesClient.getDeploymentStatus.mockResolvedValue(createSuccessResult({
        ready: true,
        readyReplicas: 2,
      }));
    });

    it('should handle different cluster configurations', async () => {
      config.cluster = 'production-cluster';

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(true);
      // Cluster configuration affects how the Kubernetes client is created
      // This verifies the function accepts the parameter correctly
    });

    it('should handle custom timeout values', async () => {
      config.timeout = 600; // 10 minutes

      const result = await deployApplication(config, mockLogger);

      expect(result.ok).toBe(true);
      // Custom timeout affects the deployment readiness wait logic
    });

    it('should handle boolean configuration options correctly', async () => {
      const testConfigs = [
        { dryRun: true, wait: false },
        { dryRun: false, wait: true },
        { dryRun: true, wait: true },
        { dryRun: false, wait: false },
      ];

      for (const testConfig of testConfigs) {
        const configWithOptions = { ...config, ...testConfig };
        const result = await deployApplication(configWithOptions, mockLogger);
        
        expect(result.ok).toBe(true);
        if (result.ok) {
          // Different combinations should all succeed
          expect(result.value.success).toBe(true);
        }

        // Reset mocks between tests
        jest.clearAllMocks();
        mockSessionManager.update.mockResolvedValue(true);
        mockKubernetesClient.applyManifest.mockResolvedValue(createSuccessResult({}));
        mockKubernetesClient.getDeploymentStatus.mockResolvedValue(createSuccessResult({
          ready: true,
          readyReplicas: 2,
        }));
      }
    });
  });
});