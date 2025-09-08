/**
 * Unit Tests: Verify Deployment Tool
 * Tests deployment verification functionality with mock Kubernetes client
 */

import { jest } from '@jest/globals';
import { verifyDeploymentTool, type VerifyDeploymentConfig } from '@tools/verify-deployment/tool';
import { createMockLogger } from '../../../utils/mock-factories';

// Mock fetch for endpoint health checks
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Mock lib modules
const mockSessionManager = {
  get: jest.fn(),
  update: jest.fn(),
};

const mockKubernetesClient = {
  getDeploymentStatus: jest.fn(),
};

const mockTimer = {
  end: jest.fn(),
  error: jest.fn(),
};

jest.mock('@lib/session', () => ({
  createSessionManager: jest.fn(() => mockSessionManager),
}));

jest.mock('@lib/kubernetes', () => ({
  createKubernetesClient: jest.fn(() => mockKubernetesClient),
}));

jest.mock('@lib/logger', () => ({
  createTimer: jest.fn(() => mockTimer),
}));

jest.mock('@config/defaults', () => ({
  DEFAULT_TIMEOUTS: {
    healthCheck: 5000,
  },
}));

describe('verifyDeploymentTool', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let config: VerifyDeploymentConfig;
  const mockSession = {
    id: 'test-session',
    workflow_state: {
      deployment_result: {
        namespace: 'test-namespace',
        deploymentName: 'test-app',
        serviceName: 'test-app-service',
        endpoints: [
          {
            type: 'external',
            url: 'http://test-app.example.com',
            port: 80,
          },
        ],
      },
      completed_steps: ['deploy'],
      errors: {},
      metadata: {},
    },
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    config = {
      sessionId: 'test-session-123',
      namespace: 'test-namespace',
      deploymentName: 'test-app',
      timeout: 30,
      healthcheckUrl: 'http://test-app.example.com/health',
    };

    // Reset all mocks
    jest.clearAllMocks();
    
    // Default successful mock responses
    mockSessionManager.get.mockResolvedValue(mockSession);
    mockSessionManager.update.mockResolvedValue(undefined);
    mockKubernetesClient.getDeploymentStatus.mockResolvedValue({
      ok: true,
      value: {
        ready: true,
        readyReplicas: 2,
        totalReplicas: 2,
      },
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  describe('successful deployment verification', () => {
    it('should verify deployment with healthy status', async () => {
      const result = await verifyDeploymentTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({
          success: true,
          sessionId: 'test-session-123',
          namespace: 'test-namespace',
          deploymentName: 'test-app',
          serviceName: 'test-app-service',
          ready: true,
          replicas: 2,
          status: {
            readyReplicas: 2,
            totalReplicas: 2,
            conditions: [
              {
                type: 'Available',
                status: 'True',
                message: 'Deployment is healthy and ready',
              },
            ],
          },
          healthCheck: {
            status: 'healthy',
            message: 'Deployment is healthy and ready',
            checks: [
              {
                name: 'endpoint',
                status: 'pass',
                message: 'Endpoint is reachable',
              },
              {
                name: 'external-endpoint',
                status: 'pass',
                message: 'http://test-app.example.com:80',
              },
            ],
          },
        });
      }
    });

    it('should use session deployment info when config values not provided', async () => {
      const minimalConfig = {
        sessionId: 'test-session-123',
      };

      const result = await verifyDeploymentTool.execute(minimalConfig, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.namespace).toBe('test-namespace');
        expect(result.value.deploymentName).toBe('test-app');
        expect(result.value.serviceName).toBe('test-app-service');
      }
    });

    it('should use default values when no deployment result in session', async () => {
      const sessionWithoutDeployment = {
        ...mockSession,
        workflow_state: {
          completed_steps: [],
          errors: {},
          metadata: {},
        },
      };
      mockSessionManager.get.mockResolvedValue(sessionWithoutDeployment);

      const result = await verifyDeploymentTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.namespace).toBe('test-namespace');
        expect(result.value.deploymentName).toBe('test-app');
      }
    });
  });

  describe('deployment health checking', () => {
    it('should handle deployment that becomes ready after polling', async () => {
      // First call returns not ready, second call returns ready
      mockKubernetesClient.getDeploymentStatus
        .mockResolvedValueOnce({
          ok: true,
          value: {
            ready: false,
            readyReplicas: 0,
            totalReplicas: 2,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          value: {
            ready: true,
            readyReplicas: 2,
            totalReplicas: 2,
          },
        });

      const result = await verifyDeploymentTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ready).toBe(true);
      }
    });

    it('should handle deployment timeout', async () => {
      mockKubernetesClient.getDeploymentStatus.mockResolvedValue({
        ok: true,
        value: {
          ready: false,
          readyReplicas: 0,
          totalReplicas: 2,
        },
      });

      const shortTimeoutConfig = {
        ...config,
        timeout: 0.1, // Very short timeout for test
      };

      const result = await verifyDeploymentTool.execute(shortTimeoutConfig, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ready).toBe(false);
        expect(result.value.healthCheck?.status).toBe('unknown');
        expect(result.value.healthCheck?.message).toBe('Deployment health check timed out');
      }
    });
  });

  describe('endpoint health checking', () => {
    it('should mark endpoints as unhealthy when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await verifyDeploymentTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.healthCheck?.status).toBe('unhealthy');
        expect(result.value.healthCheck?.checks).toContainEqual({
          name: 'endpoint',
          status: 'fail',
          message: 'Endpoint is not reachable',
        });
      }
    });

    it('should handle 3xx redirect responses as healthy', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 302,
      });

      const result = await verifyDeploymentTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.healthCheck?.status).toBe('healthy');
      }
    });

    it('should handle fetch timeout with AbortController', async () => {
      mockFetch.mockRejectedValue(new DOMException('Request timed out', 'AbortError'));

      const result = await verifyDeploymentTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.healthCheck?.checks).toContainEqual({
          name: 'endpoint',
          status: 'fail',
          message: 'Endpoint is not reachable',
        });
      }
    });

    it('should not check internal endpoints', async () => {
      const sessionWithInternalEndpoint = {
        ...mockSession,
        workflow_state: {
          ...mockSession.workflow_state,
          deployment_result: {
            ...mockSession.workflow_state.deployment_result,
            endpoints: [
              {
                type: 'internal',
                url: 'http://test-app-service.test-namespace.svc.cluster.local',
                port: 80,
              },
            ],
          },
        },
      };
      mockSessionManager.get.mockResolvedValue(sessionWithInternalEndpoint);

      const configWithoutHealthcheck = {
        ...config,
        healthcheckUrl: undefined,
      };

      const result = await verifyDeploymentTool.execute(configWithoutHealthcheck, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.healthCheck?.checks).toBeUndefined();
      }
    });
  });

  describe('failure scenarios', () => {
    it('should fail when session not found', async () => {
      mockSessionManager.get.mockResolvedValue(null);

      const result = await verifyDeploymentTool.execute(config, mockLogger);

      expect(!result.ok).toBe(true);
      if (!result.ok) {
        expect(result.error).toBe('Session not found');
      }
    });

    it('should fail when no deployment found and no config provided', async () => {
      const sessionWithoutDeployment = {
        ...mockSession,
        workflow_state: {
          completed_steps: [],
          errors: {},
          metadata: {},
        },
      };
      mockSessionManager.get.mockResolvedValue(sessionWithoutDeployment);

      const minimalConfig = {
        sessionId: 'test-session-123',
      };

      const result = await verifyDeploymentTool.execute(minimalConfig, mockLogger);

      expect(!result.ok).toBe(true);
      if (!result.ok) {
        expect(result.error).toBe('No deployment found - run deploy_application first');
      }
    });

    it('should handle Kubernetes client errors', async () => {
      mockKubernetesClient.getDeploymentStatus.mockRejectedValue(new Error('K8s error'));

      const result = await verifyDeploymentTool.execute(config, mockLogger);

      expect(!result.ok).toBe(true);
      expect(mockTimer.error).toHaveBeenCalled();
    });
  });

  describe('session management', () => {
    it('should update session with verification results', async () => {
      const result = await verifyDeploymentTool.execute(config, mockLogger);

      expect(mockSessionManager.update).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          completed_steps: expect.arrayContaining(['deploy', 'verify-deployment']),
          metadata: expect.objectContaining({
            verification_result: expect.objectContaining({
              namespace: 'test-namespace',
              deploymentName: 'test-app',
              ready: true,
            }),
          }),
        })
      );

      expect(result.ok).toBe(true);
    });
  });

  describe('logging and timing', () => {
    it('should log verification start and completion', async () => {
      await verifyDeploymentTool.execute(config, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { sessionId: 'test-session-123' },
        'Starting deployment verification'
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentName: 'test-app',
          ready: true,
          healthStatus: 'healthy',
        }),
        'Deployment verification completed'
      );
    });

    it('should end timer on success', async () => {
      await verifyDeploymentTool.execute(config, mockLogger);

      expect(mockTimer.end).toHaveBeenCalledWith({
        deploymentName: 'test-app',
        ready: true,
      });
    });

    it('should handle errors with timer', async () => {
      mockSessionManager.get.mockRejectedValue(new Error('Session error'));

      const result = await verifyDeploymentTool.execute(config, mockLogger);

      expect(mockTimer.error).toHaveBeenCalled();
      expect(!result.ok).toBe(true);
    });
  });

  describe('health status determination', () => {
    it('should be healthy when deployment ready and all endpoints healthy', async () => {
      const result = await verifyDeploymentTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.healthCheck?.status).toBe('healthy');
      }
    });

    it('should be unhealthy when deployment ready but endpoints failing', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const result = await verifyDeploymentTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ready).toBe(true);
        expect(result.value.healthCheck?.status).toBe('unhealthy');
      }
    });

    it('should be unknown when deployment not ready', async () => {
      mockKubernetesClient.getDeploymentStatus.mockResolvedValue({
        ok: true,
        value: {
          ready: false,
          readyReplicas: 0,
          totalReplicas: 2,
        },
      });

      const shortTimeoutConfig = { ...config, timeout: 0.1 };
      const result = await verifyDeploymentTool.execute(shortTimeoutConfig, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.healthCheck?.status).toBe('unknown');
      }
    });
  });

  describe('tool structure', () => {
    it('should have correct tool name', () => {
      expect(verifyDeploymentTool.name).toBe('verify-deployment');
    });

    it('should have execute function', () => {
      expect(typeof verifyDeploymentTool.execute).toBe('function');
    });
  });
});