/**
 * Deploy Application Tool - Unit Tests
 */

import { jest } from '@jest/globals';

// Set up mocks before any imports for ESM compatibility
jest.unstable_mockModule('../helper', () => ({
  loadManifests: jest.fn(),
  orderManifests: jest.fn(),
  deployToCluster: jest.fn(),
  rollbackDeployment: jest.fn(),
  waitForDeployment: jest.fn(),
  getTargetPath: jest.fn(),
  validatePath: jest.fn(),
  waitForAllDeployments: jest.fn(),
  getEndpoints: jest.fn(),
}));

jest.unstable_mockModule('node:fs/promises', () => ({
  readdir: jest.fn(),
  readFile: jest.fn(),
  access: jest.fn(),
}));

// Import modules AFTER setting up mocks
const deployApplicationHandler = (await import('../index')).default;
const fs = await import('node:fs/promises');
const mockHelper = await import('../helper');

// Import types and utilities
import type { DeployInput, DeployOutput } from '../deploy-application';
import type { ToolContext } from '../../tool-types';
import { ErrorCode, DomainError } from '../../../../domain/types/errors';
import { createMockToolContext, createMockLogger } from '../../__tests__/shared/test-utils';
import { createMockSession } from '../../../../../test/utils/mock-factories';
import { createMockKubernetesService } from '../../__tests__/shared/kubernetes-mocks';
import type { KubernetesManifest } from '../../../../domain/types/index';

// Import proper types for helper functions
import type {
  loadManifests,
  orderManifests,
  deployToCluster,
  rollbackDeployment,
  waitForDeployment,
  getTargetPath,
  validatePath,
  waitForAllDeployments,
  getEndpoints,
} from '../helper';
import type { SessionService, ProgressEmitter } from '../../../services/interfaces';

const _mockFs = fs as jest.Mocked<typeof fs>;

// Create properly typed mock functions for helper
type MockHelper = {
  loadManifests: jest.MockedFunction<typeof loadManifests>;
  orderManifests: jest.MockedFunction<typeof orderManifests>;
  deployToCluster: jest.MockedFunction<typeof deployToCluster>;
  rollbackDeployment: jest.MockedFunction<typeof rollbackDeployment>;
  waitForDeployment: jest.MockedFunction<typeof waitForDeployment>;
  getTargetPath: jest.MockedFunction<typeof getTargetPath>;
  validatePath: jest.MockedFunction<typeof validatePath>;
  waitForAllDeployments: jest.MockedFunction<typeof waitForAllDeployments>;
  getEndpoints: jest.MockedFunction<typeof getEndpoints>;
};

const typedMockHelper = mockHelper as MockHelper;

describe('deploy-application tool', () => {
  let mockContext: ToolContext;
  let mockLogger: ReturnType<typeof createMockLogger>;

  const sampleManifests: KubernetesManifest[] = [
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'test-app', namespace: 'default' },
      spec: {
        replicas: 3,
        selector: { matchLabels: { app: 'test-app' } },
        template: {
          metadata: { labels: { app: 'test-app' } },
          spec: { containers: [{ name: 'app', image: 'test:latest' }] },
        },
      },
    },
    {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 'test-app-service', namespace: 'default' },
      spec: {
        selector: { app: 'test-app' },
        ports: [{ port: 80, targetPort: 8080 }],
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = createMockLogger();
    mockContext = createMockToolContext({
      logger: mockLogger,
      kubernetesService: createMockKubernetesService(),
    });

    // Mock helper functions
    typedMockHelper.loadManifests.mockResolvedValue(sampleManifests);
    typedMockHelper.orderManifests.mockImplementation((manifests) => manifests);
    typedMockHelper.deployToCluster.mockResolvedValue({
      success: true,
      resources: [
        { kind: 'Deployment', name: 'test-app', namespace: 'default', status: 'created' },
        { kind: 'Service', name: 'test-app-service', namespace: 'default', status: 'created' },
      ],
      deployed: ['Deployment/test-app', 'Service/test-app-service'],
      failed: [],
      endpoints: [
        {
          service: 'test-app-service',
          type: 'ClusterIP',
          port: 80,
          url: 'http://test-app-service',
        },
      ],
    });
  });

  describe('basic deployment operations', () => {
    it('should deploy application successfully', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: {
            output_path: './k8s/test-session',
          },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: DeployInput = {
        sessionId: 'test-session',
      };

      const result = await deployApplicationHandler.handler(input, mockContext);

      expect(result).toEqual({
        success: true,
        sessionId: 'test-session',
        namespace: 'default',
        deploymentName: 'test-app',
        serviceName: 'test-app-service',
        endpoint: 'http://test-app-service',
        ready: true,
        replicas: 1,
      });

      expect(typedMockHelper.loadManifests).toHaveBeenCalledWith('./k8s/test-session');
      expect(typedMockHelper.orderManifests).toHaveBeenCalledWith(sampleManifests);
      expect(typedMockHelper.deployToCluster).toHaveBeenCalledWith(
        sampleManifests,
        input,
        mockContext,
      );
    });

    it('should deploy to custom namespace', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/custom-namespace' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: DeployInput = {
        sessionId: 'custom-namespace-session',
        namespace: 'production',
      };

      const result = await deployApplicationHandler.handler(input, mockContext);

      expect(result.namespace).toBe('production');
      expect(typedMockHelper.deployToCluster).toHaveBeenCalledWith(
        sampleManifests,
        expect.objectContaining({ namespace: 'production' }),
        mockContext,
      );
    });

    it('should handle wait and timeout parameters', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/wait-test' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: DeployInput = {
        sessionId: 'wait-test-session',
        wait: true,
        timeout: '600',
      };

      await deployApplicationHandler.handler(input, mockContext);

      expect(typedMockHelper.deployToCluster).toHaveBeenCalledWith(
        sampleManifests,
        expect.objectContaining({
          wait: true,
          timeout: '600',
        }),
        mockContext,
      );
    });

    it('should handle dry run deployment', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/dry-run' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: DeployInput = {
        sessionId: 'dry-run-session',
        dryRun: true,
      };

      const result = await deployApplicationHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(typedMockHelper.deployToCluster).toHaveBeenCalledWith(
        sampleManifests,
        expect.objectContaining({ dryRun: true }),
        mockContext,
      );
    });
  });

  describe('session management', () => {
    it('should fail when sessionId is empty', async () => {
      const input: DeployInput = {
        sessionId: '',
      };

      await expect(deployApplicationHandler.handler(input, mockContext)).rejects.toThrow(
        DomainError,
      );
      await expect(deployApplicationHandler.handler(input, mockContext)).rejects.toThrow(
        'sessionId is required',
      );
    });

    it('should fail when sessionId is missing', async () => {
      const input = {} as DeployInput;

      await expect(deployApplicationHandler.handler(input, mockContext)).rejects.toThrow(
        'sessionId is required',
      );
    });

    it('should fail when session service is not available', async () => {
      mockContext.sessionService = undefined;

      const input: DeployInput = {
        sessionId: 'test-session',
      };

      await expect(deployApplicationHandler.handler(input, mockContext)).rejects.toThrow(
        'Session service not available',
      );
    });

    it('should fail when session is not found', async () => {
      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(null);

      const input: DeployInput = {
        sessionId: 'nonexistent-session',
      };

      await expect(deployApplicationHandler.handler(input, mockContext)).rejects.toThrow(
        'Session not found',
      );
    });

    it('should fail when no K8s manifests found in session', async () => {
      const session = createMockSession({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: DeployInput = {
        sessionId: 'no-manifests-session',
      };

      await expect(deployApplicationHandler.handler(input, mockContext)).rejects.toThrow(
        'No K8s manifests found in session',
      );
    });

    it('should update session with deployment results', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/update-test' },
        },
      });

      const updateAtomicMock = jest.fn<SessionService['updateAtomic']>();
      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      (mockContext.sessionService as jest.Mocked<SessionService>).updateAtomic = updateAtomicMock;

      const input: DeployInput = {
        sessionId: 'update-test-session',
        namespace: 'staging',
      };

      await deployApplicationHandler.handler(input, mockContext);

      expect(updateAtomicMock).toHaveBeenCalledWith('update-test-session', expect.any(Function));

      // Verify the updater function works correctly
      const updaterFunction = updateAtomicMock.mock.calls[0]?.[1];
      if (updaterFunction) {
        const updatedSession = updaterFunction(session);

        expect(updatedSession.workflow_state.deployment_result).toMatchObject({
          namespace: 'staging',
          deploymentName: 'test-app',
          serviceName: 'test-app-service',
          endpoint: 'http://test-app-service',
          ready: true,
          replicas: 1,
        });
      }
    });
  });

  describe('manifest handling', () => {
    it('should fail when no valid manifests found', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/empty-manifests' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.loadManifests.mockResolvedValue([]);

      const input: DeployInput = {
        sessionId: 'empty-manifests-session',
      };

      await expect(deployApplicationHandler.handler(input, mockContext)).rejects.toThrow(
        'No valid manifests found',
      );
    });

    it('should handle manifests with different resource types', async () => {
      const complexManifests: KubernetesManifest[] = [
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: 'app-config' },
          data: { 'config.yaml': 'app: config' },
        },
        {
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: { name: 'app-secrets' },
          data: { password: 'c2VjcmV0' },
        },
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'complex-app' },
          spec: { replicas: 2 },
        },
        {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: 'complex-service' },
          spec: { type: 'LoadBalancer' },
        },
        {
          apiVersion: 'networking.k8s.io/v1',
          kind: 'Ingress',
          metadata: { name: 'app-ingress' },
          spec: { rules: [] },
        },
      ];

      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/complex-app' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.loadManifests.mockResolvedValue(complexManifests);

      const input: DeployInput = {
        sessionId: 'complex-app-session',
      };

      const result = await deployApplicationHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.deploymentName).toBe('complex-app');
      expect(result.serviceName).toBe('complex-service');
    });

    it('should handle manifests with only services', async () => {
      const serviceOnlyManifests = [
        {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: 'service-only' },
          spec: { type: 'ClusterIP' },
        },
      ];

      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/service-only' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.loadManifests.mockResolvedValue(serviceOnlyManifests);

      const input: DeployInput = {
        sessionId: 'service-only-session',
      };

      const result = await deployApplicationHandler.handler(input, mockContext);

      expect(result.deploymentName).toBe('app'); // Default fallback
      expect(result.serviceName).toBe('service-only');
    });

    it('should handle manifests with only deployments', async () => {
      const deploymentOnlyManifests = [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'deployment-only' },
          spec: { replicas: 1 },
        },
      ];

      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/deployment-only' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.loadManifests.mockResolvedValue(deploymentOnlyManifests);

      const input: DeployInput = {
        sessionId: 'deployment-only-session',
      };

      const result = await deployApplicationHandler.handler(input, mockContext);

      expect(result.deploymentName).toBe('deployment-only');
      expect(result.serviceName).toBe('deployment-only'); // Uses deployment name as fallback
    });
  });

  describe('progress tracking', () => {
    it('should emit progress events when progress emitter is available', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/progress-test' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: DeployInput = {
        sessionId: 'progress-test-session',
      };

      await deployApplicationHandler.handler(input, mockContext);

      const mockProgressEmitter = mockContext.progressEmitter as jest.Mocked<ProgressEmitter>;
      expect((mockProgressEmitter as any).emit).toHaveBeenCalledWith({
        sessionId: 'progress-test-session',
        step: 'deploy_application',
        status: 'in_progress',
        message: 'Deploying application to cluster',
        progress: 0.5,
      });

      expect((mockProgressEmitter as any).emit).toHaveBeenCalledWith({
        sessionId: 'progress-test-session',
        step: 'deploy_application',
        status: 'completed',
        message: 'Successfully deployed test-app',
        progress: 1.0,
      });
    });

    it('should emit failure progress when deployment fails', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/failure-test' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.deployToCluster.mockRejectedValue(new Error('Cluster connection failed'));

      const input: DeployInput = {
        sessionId: 'failure-test-session',
      };

      await expect(deployApplicationHandler.handler(input, mockContext)).rejects.toThrow();

      const mockProgressEmitter = mockContext.progressEmitter as jest.Mocked<ProgressEmitter>;
      expect((mockProgressEmitter as any).emit).toHaveBeenCalledWith({
        sessionId: 'failure-test-session',
        step: 'deploy_application',
        status: 'failed',
        message: 'Deployment failed',
      });
    });

    it('should handle missing progress emitter gracefully', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/no-progress-test' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      mockContext.progressEmitter = undefined;

      const input: DeployInput = {
        sessionId: 'no-progress-test-session',
      };

      const result = await deployApplicationHandler.handler(input, mockContext);
      expect(result.success).toBe(true);
    });
  });

  describe('deployment result handling', () => {
    it('should handle deployment result with endpoints', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/endpoints-test' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.deployToCluster.mockResolvedValue({
        success: true,
        resources: [
          { kind: 'Deployment', name: 'test-app', namespace: 'default', status: 'created' },
          { kind: 'Service', name: 'test-service', namespace: 'default', status: 'created' },
        ],
        deployed: ['Deployment/test-app', 'Service/test-service'],
        failed: [],
        endpoints: [
          {
            service: 'test-service',
            type: 'LoadBalancer',
            port: 80,
            url: 'http://external-lb.example.com',
          },
        ],
      });

      const input: DeployInput = {
        sessionId: 'endpoints-test-session',
      };

      const result = await deployApplicationHandler.handler(input, mockContext);

      expect(result.endpoint).toBe('http://external-lb.example.com');
    });

    it('should handle deployment result without endpoints', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/no-endpoints-test' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.deployToCluster.mockResolvedValue({
        success: true,
        resources: [
          { kind: 'Deployment', name: 'test-app', namespace: 'default', status: 'created' },
        ],
        deployed: ['Deployment/test-app'],
        failed: [],
        endpoints: [],
      });

      const input: DeployInput = {
        sessionId: 'no-endpoints-test-session',
      };

      const result = await deployApplicationHandler.handler(input, mockContext);

      expect(result.endpoint).toBeUndefined();
    });

    it('should fail when deployToCluster returns null', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/null-result-test' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.deployToCluster.mockResolvedValue(null);

      const input: DeployInput = {
        sessionId: 'null-result-test-session',
      };

      await expect(deployApplicationHandler.handler(input, mockContext)).rejects.toThrow(
        'Deployment failed',
      );
    });
  });

  describe('error handling', () => {
    it('should handle manifest loading errors', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/invalid-path' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.loadManifests.mockRejectedValue(
        new Error('Failed to load manifests: directory not found'),
      );

      const input: DeployInput = {
        sessionId: 'manifest-error-session',
      };

      await expect(deployApplicationHandler.handler(input, mockContext)).rejects.toThrow(
        'Failed to load manifests',
      );
    });

    it('should handle deployment cluster errors', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/cluster-error-test' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.deployToCluster.mockRejectedValue(
        new Error('Kubernetes API server unavailable'),
      );

      const input: DeployInput = {
        sessionId: 'cluster-error-session',
      };

      await expect(deployApplicationHandler.handler(input, mockContext)).rejects.toThrow(
        'Kubernetes API server unavailable',
      );
    });

    it('should handle domain errors', async () => {
      const domainError = new DomainError(ErrorCode.OPERATION_FAILED, 'Custom deployment error');

      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/domain-error-test' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.deployToCluster.mockRejectedValue(domainError);

      const input: DeployInput = {
        sessionId: 'domain-error-session',
      };

      await expect(deployApplicationHandler.handler(input, mockContext)).rejects.toThrow(
        'Custom deployment error',
      );
    });

    it('should handle non-Error objects', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/string-error-test' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.deployToCluster.mockRejectedValue('String error message');

      const input: DeployInput = {
        sessionId: 'string-error-session',
      };

      await expect(deployApplicationHandler.handler(input, mockContext)).rejects.toThrow(
        'String error message',
      );
    });
  });

  describe('logging behavior', () => {
    it('should log deployment start and completion', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/logging-test' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: DeployInput = {
        sessionId: 'logging-test-session',
      };

      await deployApplicationHandler.handler(input, mockContext);

      const { info } = mockLogger;
      expect(info).toHaveBeenCalledWith(
        { sessionId: 'logging-test-session' },
        'Starting application deployment',
      );

      expect(info).toHaveBeenCalledWith(
        {
          deploymentName: 'test-app',
          serviceName: 'test-app-service',
          namespace: 'default',
        },
        'Deployment completed',
      );
    });

    it('should log errors with context', async () => {
      const error = new Error('Deployment operation failed');
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/error-logging-test' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      (mockHelper.deployToCluster as jest.Mock).mockRejectedValue(error);

      const input: DeployInput = {
        sessionId: 'error-logging-session',
      };

      await expect(deployApplicationHandler.handler(input, mockContext)).rejects.toThrow();

      const { error: logError } = mockLogger;
      expect(logError).toHaveBeenCalledWith({ error }, 'Deployment failed');
    });
  });

  describe('tool descriptor properties', () => {
    it('should have correct tool metadata', () => {
      expect(deployApplicationHandler.name).toBe('deploy_application');
      expect(deployApplicationHandler.description).toBe('Deploy application to Kubernetes cluster');
      expect(deployApplicationHandler.category).toBe('workflow');
      expect(deployApplicationHandler.inputSchema).toBeDefined();
      expect(deployApplicationHandler.outputSchema).toBeDefined();
    });

    it('should have correct chain hint for next tool', () => {
      expect(deployApplicationHandler.chainHint).toMatchObject({
        nextTool: 'verify_deployment',
        reason: 'Verify deployment health and get endpoints',
        paramMapper: expect.any(Function),
      });
    });

    it('should provide correct parameter mapping for chaining', () => {
      const output: DeployOutput = {
        success: true,
        sessionId: 'chain-test',
        namespace: 'staging',
        deploymentName: 'test-app',
        serviceName: 'test-service',
        ready: true,
        replicas: 3,
      };

      const paramMapper = deployApplicationHandler.chainHint?.paramMapper;
      if (paramMapper) {
        const mappedParams = paramMapper(output);
        expect(mappedParams).toEqual({
          sessionId: 'chain-test',
        });
      }
    });
  });

  describe('input validation', () => {
    it('should validate required sessionId', () => {
      const input = {} as DeployInput; // Missing sessionId

      // Input validation should be handled by the schema
      expect(() => deployApplicationHandler.inputSchema.parse(input)).toThrow();
    });

    it('should accept optional parameters', () => {
      const input: DeployInput = {
        sessionId: 'test-session',
        namespace: 'custom-namespace',
        wait: true,
        timeout: '300',
        dryRun: false,
      };

      const parsed = deployApplicationHandler.inputSchema.parse(input);
      expect(parsed).toEqual(input);
    });
  });

  describe('output validation', () => {
    it('should produce schema-compliant output', async () => {
      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/validation-test' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: DeployInput = {
        sessionId: 'validation-test-session',
      };

      const result = await deployApplicationHandler.handler(input, mockContext);

      // Validate output against schema
      expect(() => deployApplicationHandler.outputSchema.parse(result)).not.toThrow();
      expect(result).toMatchObject({
        success: true,
        sessionId: 'validation-test-session',
        namespace: expect.any(String) as string,
        deploymentName: expect.any(String) as string,
        serviceName: expect.any(String) as string,
        ready: expect.any(Boolean) as boolean,
        replicas: expect.any(Number) as number,
      });
    });
  });

  describe('edge cases', () => {
    it('should handle deployment with special characters in names', async () => {
      const specialManifests = [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'my-app-with-dashes_and_underscores.123' },
          spec: { replicas: 1 },
        },
      ];

      const session = createMockSession({
        workflow_state: {
          k8s_result: { output_path: './k8s/special-chars' },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.loadManifests.mockResolvedValue(specialManifests);

      const input: DeployInput = {
        sessionId: 'special-chars-session',
      };

      const result = await deployApplicationHandler.handler(input, mockContext);

      expect(result.deploymentName).toBe('my-app-with-dashes_and_underscores.123');
    });

    it('should handle session with complex workflow state', async () => {
      const session = createMockSession({
        workflow_state: {
          analysis_result: { language: 'javascript', framework: 'express' },
          build_result: { imageId: 'app:v1.0.0', tags: ['app:v1.0.0', 'app:latest'] },
          k8s_result: {
            output_path: './k8s/complex-session',
            manifests: ['deployment.yaml', 'service.yaml'],
          },
          push_result: { registry: 'gcr.io/project', pushed: ['app:v1.0.0'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      (mockContext.sessionService as jest.Mocked<SessionService>).updateAtomic = jest
        .fn<SessionService['updateAtomic']>()
        .mockImplementation((id, updateFn) => {
          return Promise.resolve(updateFn(session));
        });

      const input: DeployInput = {
        sessionId: 'complex-session',
      };

      const result = await deployApplicationHandler.handler(input, mockContext);

      expect(result.success).toBe(true);

      // Verify complex workflow state is preserved
      expect(mockContext.sessionService.updateAtomic).toHaveBeenCalledWith(
        'complex-session',
        expect.any(Function),
      );
    });
  });
});
