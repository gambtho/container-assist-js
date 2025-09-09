/**
 * Unit Tests: Prepare Cluster Tool
 * Tests the prepare cluster tool functionality with mock Kubernetes client
 */

import { jest } from '@jest/globals';
import { prepareCluster, type PrepareClusterConfig } from '../../../src/tools/prepare-cluster/tool';
import { createMockLogger, createSuccessResult, createFailureResult } from '../../__support__/utilities/mock-infrastructure';

// Mock lib modules
const mockSessionManager = {
  create: jest.fn().mockResolvedValue({
    sessionId: 'test-session-123',
    workflow_state: {},
    metadata: {},
    completed_steps: [],
    errors: {},
    current_step: null,
    createdAt: '2025-09-08T11:12:40.362Z',
    updatedAt: '2025-09-08T11:12:40.362Z'
  }),
  get: jest.fn(),
  update: jest.fn(),
};

const mockK8sClient = {
  ping: jest.fn(),
  namespaceExists: jest.fn(),
  applyManifest: jest.fn(),
  checkIngressController: jest.fn(),
  checkPermissions: jest.fn(),
};

const mockTimer = {
  end: jest.fn(),
  error: jest.fn(),
};

jest.mock('@lib/session', () => ({
  createSessionManager: jest.fn(() => mockSessionManager),
}));

jest.mock('@lib/kubernetes', () => ({
  createKubernetesClient: jest.fn(() => mockK8sClient),
}));

// Mock MCP helper modules
jest.mock('@mcp/tools/session-helpers', () => ({
  resolveSession: jest.fn().mockResolvedValue({
    ok: true,
    value: {
      id: 'test-session-123',
      state: {
        sessionId: 'test-session-123',
        workflow_state: {},
        metadata: {},
      },
    },
  }),
  updateSessionData: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('@mcp/tools/tool-wrapper', () => ({
  wrapTool: jest.fn((name: string, fn: any) => ({ execute: fn })),
}));

jest.mock('@lib/logger', () => ({
  createTimer: jest.fn(() => mockTimer),
}));

describe('prepareCluster', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let config: PrepareClusterConfig;

  beforeEach(() => {
    mockLogger = createMockLogger();
    config = {
      sessionId: 'test-session-123',
      namespace: 'test-namespace',
      cluster: 'test-cluster',
      createNamespace: true,
    };

    // Reset all mocks
    jest.clearAllMocks();
    mockSessionManager.update.mockResolvedValue(true);
  });

  describe('Successful cluster preparation', () => {
    beforeEach(() => {
      // Mock successful connectivity
      mockK8sClient.ping.mockResolvedValue(true);
      mockK8sClient.namespaceExists.mockResolvedValue(false);
      mockK8sClient.applyManifest.mockResolvedValue(createSuccessResult({}));
      mockK8sClient.checkPermissions.mockResolvedValue(true);
      mockK8sClient.checkIngressController.mockResolvedValue(true);
      
      // Mock session
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        workflow_state: {},
        metadata: {},
      });
    });

    it('should successfully prepare cluster with new namespace', async () => {
      const result = await prepareCluster(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.clusterReady).toBe(true);
        expect(result.value.namespace).toBe('test-namespace');
        expect(result.value.checks.connectivity).toBe(true);
        expect(result.value.checks.namespaceExists).toBe(true);
        expect(result.value.checks.permissions).toBe(true);
      }
    });

    it('should handle existing namespace', async () => {
      mockK8sClient.namespaceExists.mockResolvedValue(true);
      
      const result = await prepareCluster(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.checks.namespaceExists).toBe(true);
      }
      // Should not attempt to create namespace
      expect(mockK8sClient.applyManifest).not.toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'Namespace' }),
        undefined
      );
    });

    it('should update session with cluster info', async () => {
      await prepareCluster(config, mockLogger);

      expect(mockSessionManager.update).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          completed_steps: expect.arrayContaining(['prepare-cluster']),
          metadata: expect.objectContaining({
            cluster_preparation: expect.objectContaining({
              cluster: 'test-cluster',
              namespace: 'test-namespace',
              clusterReady: true,
            }),
          }),
        })
      );
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        workflow_state: {},
        metadata: {},
      });
    });

    it('should return error when cluster is not reachable', async () => {
      mockK8sClient.ping.mockResolvedValue(false);

      const result = await prepareCluster(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Cannot connect to Kubernetes cluster');
      }
    });

    it('should return error when namespace creation fails', async () => {
      mockK8sClient.ping.mockResolvedValue(true);
      mockK8sClient.namespaceExists.mockResolvedValue(false);
      mockK8sClient.applyManifest.mockResolvedValue(createFailureResult('Failed to create namespace'));
      
      const result = await prepareCluster(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Failed to create namespace');
      }
    });

    it('should handle Kubernetes client errors', async () => {
      mockK8sClient.ping.mockRejectedValue(new Error('Connection timeout'));

      const result = await prepareCluster(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Cannot connect to Kubernetes cluster');
      }
    });
  });

  describe('Optional features', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        workflow_state: {},
        metadata: {},
      });
      mockK8sClient.ping.mockResolvedValue(true);
      mockK8sClient.namespaceExists.mockResolvedValue(true);
      mockK8sClient.checkPermissions.mockResolvedValue(true);
    });

    it('should setup RBAC when requested', async () => {
      mockK8sClient.applyManifest.mockResolvedValue(createSuccessResult({}));
      
      config.setupRbac = true;
      const result = await prepareCluster(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.checks.rbacConfigured).toBe(true);
      }
    });

    it('should check ingress controller when requested', async () => {
      mockK8sClient.checkIngressController.mockResolvedValue(true);
      
      config.installIngress = true;
      const result = await prepareCluster(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.checks.ingressController).toBe(true);
      }
    });
  });

  describe('Session management', () => {
    it('should create new session if not exists', async () => {
      mockSessionManager.get.mockResolvedValue(null);
      mockK8sClient.ping.mockResolvedValue(true);
      mockK8sClient.namespaceExists.mockResolvedValue(true);
      mockK8sClient.checkPermissions.mockResolvedValue(true);

      await prepareCluster(config, mockLogger);

      expect(mockSessionManager.create).toHaveBeenCalledWith('test-session-123');
    });
  });
});