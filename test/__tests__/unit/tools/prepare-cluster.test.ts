/**
 * Unit Tests: Prepare Cluster Tool
 * Tests cluster preparation functionality with mock Kubernetes client
 */

import { jest } from '@jest/globals';
import { prepareClusterTool, type PrepareClusterConfig } from '@tools/prepare-cluster/tool';
import { createMockLogger } from '../../../utils/mock-factories';

// Mock lib modules
const mockSessionManager = {
  get: jest.fn(),
  update: jest.fn(),
};

const mockKubernetesClient = {
  ping: jest.fn(),
  checkPermissions: jest.fn(),
  namespaceExists: jest.fn(),
  applyManifest: jest.fn(),
  checkIngressController: jest.fn(),
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

describe('prepareClusterTool', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let config: PrepareClusterConfig;
  const mockSession = {
    id: 'test-session',
    completed_steps: [],
    errors: {},
    metadata: {},
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    config = {
      sessionId: 'test-session-123',
      cluster: 'test-cluster',
      namespace: 'test-namespace',
      createNamespace: false,
      setupRbac: false,
      installIngress: false,
      checkRequirements: true,
    };

    // Reset all mocks
    jest.clearAllMocks();
    
    // Default successful mock responses
    mockSessionManager.get.mockResolvedValue(mockSession);
    mockSessionManager.update.mockResolvedValue(undefined);
    mockKubernetesClient.ping.mockResolvedValue(true);
    mockKubernetesClient.checkPermissions.mockResolvedValue(true);
    mockKubernetesClient.namespaceExists.mockResolvedValue(true);
    mockKubernetesClient.checkIngressController.mockResolvedValue(false);
  });

  describe('successful cluster preparation', () => {
    it('should prepare cluster with all checks passing', async () => {
      const result = await prepareClusterTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({
          success: true,
          sessionId: 'test-session-123',
          clusterReady: true,
          cluster: 'test-cluster',
          namespace: 'test-namespace',
          checks: {
            connectivity: true,
            permissions: true,
            namespaceExists: true,
            ingressController: false,
          },
          warnings: ['No ingress controller found - external access may not work'],
        });
      }
    });

    it('should use default values when not provided', async () => {
      const minimalConfig = {
        sessionId: 'test-session-123',
      };

      const result = await prepareClusterTool.execute(minimalConfig, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.cluster).toBe('default');
        expect(result.value.namespace).toBe('default');
      }
    });

    it('should create namespace when requested and it does not exist', async () => {
      mockKubernetesClient.namespaceExists.mockResolvedValue(false);
      mockKubernetesClient.applyManifest.mockResolvedValue({ success: true });

      const configWithCreate = {
        ...config,
        createNamespace: true,
      };

      const result = await prepareClusterTool.execute(configWithCreate, mockLogger);

      expect(mockKubernetesClient.applyManifest).toHaveBeenCalledWith({
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name: 'test-namespace',
        },
      });

      expect(result.ok).toBe(true);
    });

    it('should setup RBAC when requested', async () => {
      mockKubernetesClient.applyManifest.mockResolvedValue({ success: true });

      const configWithRbac = {
        ...config,
        setupRbac: true,
      };

      const result = await prepareClusterTool.execute(configWithRbac, mockLogger);

      expect(mockKubernetesClient.applyManifest).toHaveBeenCalledWith(
        {
          apiVersion: 'v1',
          kind: 'ServiceAccount',
          metadata: {
            name: 'app-service-account',
            namespace: 'test-namespace',
          },
        },
        'test-namespace'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.checks.rbacConfigured).toBe(true);
      }
    });
  });

  describe('failure scenarios', () => {
    it('should fail when session not found', async () => {
      mockSessionManager.get.mockResolvedValue(null);

      const result = await prepareClusterTool.execute(config, mockLogger);

      expect(!result.ok).toBe(true);
      if (!result.ok) {
        expect(result.error).toBe('Session not found');
      }
    });

    it('should fail when cluster connectivity fails', async () => {
      mockKubernetesClient.ping.mockResolvedValue(false);

      const result = await prepareClusterTool.execute(config, mockLogger);

      expect(!result.ok).toBe(true);
      if (!result.ok) {
        expect(result.error).toBe('Cannot connect to Kubernetes cluster');
      }
    });

    it('should handle namespace creation failure', async () => {
      mockKubernetesClient.namespaceExists.mockResolvedValue(false);
      mockKubernetesClient.applyManifest.mockResolvedValue({ success: false, error: 'Creation failed' });

      const configWithCreate = {
        ...config,
        createNamespace: true,
      };

      const result = await prepareClusterTool.execute(configWithCreate, mockLogger);

      expect(!result.ok).toBe(true);
      expect(mockTimer.error).toHaveBeenCalled();
    });
  });

  describe('warnings and checks', () => {
    it('should add warning when permissions are limited', async () => {
      mockKubernetesClient.checkPermissions.mockResolvedValue(false);

      const result = await prepareClusterTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.clusterReady).toBe(false); // Fails due to permissions
        expect(result.value.warnings).toContain('Limited permissions - some operations may fail');
      }
    });

    it('should add warning when namespace does not exist', async () => {
      mockKubernetesClient.namespaceExists.mockResolvedValue(false);

      const result = await prepareClusterTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.warnings).toContain('Namespace test-namespace does not exist - deployment may fail');
      }
    });

    it('should check ingress controller when installIngress is true', async () => {
      mockKubernetesClient.checkIngressController.mockResolvedValue(true);

      const configWithIngress = {
        ...config,
        installIngress: true,
        checkRequirements: false,
      };

      const result = await prepareClusterTool.execute(configWithIngress, mockLogger);

      expect(mockKubernetesClient.checkIngressController).toHaveBeenCalled();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.checks.ingressController).toBe(true);
      }
    });
  });

  describe('session management', () => {
    it('should update session with preparation results', async () => {
      const result = await prepareClusterTool.execute(config, mockLogger);

      expect(mockSessionManager.update).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          completed_steps: ['prepare-cluster'],
          metadata: expect.objectContaining({
            cluster_preparation: expect.any(Object),
            cluster_result: expect.any(Object),
          }),
        })
      );

      expect(result.ok).toBe(true);
    });
  });

  describe('logging and timing', () => {
    it('should log preparation start and completion', async () => {
      await prepareClusterTool.execute(config, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { sessionId: 'test-session-123', cluster: 'test-cluster', namespace: 'test-namespace' },
        'Starting cluster preparation'
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          clusterReady: expect.any(Boolean),
          checks: expect.any(Object),
        }),
        'Cluster preparation completed'
      );
    });

    it('should end timer on success', async () => {
      await prepareClusterTool.execute(config, mockLogger);

      expect(mockTimer.end).toHaveBeenCalledWith({ clusterReady: true });
    });

    it('should handle errors with timer', async () => {
      // Mock an error that will reach the main catch block (session manager error)
      mockSessionManager.update.mockRejectedValue(new Error('Session update failed'));

      const result = await prepareClusterTool.execute(config, mockLogger);

      expect(mockTimer.error).toHaveBeenCalled();
      expect(!result.ok).toBe(true);
    });
  });

  describe('tool structure', () => {
    it('should have correct tool name', () => {
      expect(prepareClusterTool.name).toBe('prepare-cluster');
    });

    it('should have execute function', () => {
      expect(typeof prepareClusterTool.execute).toBe('function');
    });
  });
});