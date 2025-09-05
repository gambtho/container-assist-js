/**
 * Verify Deployment Tool - Unit Tests
 */

import { jest } from '@jest/globals';

// Set up mocks before any imports for ESM compatibility
jest.unstable_mockModule('../helper', () => ({
  checkDeploymentHealth: jest.fn(),
  getPodInfo: jest.fn(),
  getServiceEndpoints: jest.fn(),
  analyzeIssues: jest.fn(),
  getTargetResources: jest.fn(),
  checkAllDeployments: jest.fn(),
  checkAllPods: jest.fn(),
  getAllEndpoints: jest.fn(),
  determineOverallHealth: jest.fn(),
}));

// Import modules AFTER setting up mocks
const verifyDeploymentHandler = (await import('../index')).default;

// Import types and utilities
import type { VerifyInput } from '../verify-deployment';
import type { ToolContext } from '../../tool-types';
import { createMockSession, type Session } from '../../../../domain/types/session';
import { ErrorCode, DomainError } from '../../../../domain/types/errors';
import { createMockToolContext, createMockLogger } from '../../__tests__/shared/test-utils';
import { createMockKubernetesService } from '../../__tests__/shared/kubernetes-mocks';
import type { EventEmitter } from 'events';
import type { Logger } from 'pino';

const mockHelper = await import('../helper');

describe('verify-deployment tool', () => {
  let mockContext: ToolContext;
  let mockLogger: Logger;
  let mockSessionService: jest.MockedFunction<(sessionId: string) => Promise<Session | null>>;

  // Helper to create properly typed session data
  const createTypedSession = (overrides: Parameters<typeof createMockSession>[0] = {}): Session => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return createMockSession(overrides) as Session;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = createMockLogger();
    mockSessionService = jest.fn();
    mockContext = createMockToolContext({
      logger: mockLogger,
      kubernetesService: createMockKubernetesService(),
    });

    // Type-safe service mocking
    if (mockContext.sessionService) {
      const sessionService = mockContext.sessionService as { get: typeof mockSessionService };
      sessionService.get = mockSessionService;
    }

    // Mock helper functions with default successful responses
    const mockCheckDeploymentHealth = mockHelper.checkDeploymentHealth as jest.MockedFunction<
      typeof mockHelper.checkDeploymentHealth
    >;
    mockCheckDeploymentHealth.mockResolvedValue({
      name: 'test-app',
      endpoint: 'http://test-app.default',
      status: 'healthy',
      response_time_ms: 45,
    });
  });

  describe('basic deployment verification', () => {
    it('should verify deployment successfully when healthy', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: 'test-app',
            serviceName: 'test-app-service',
            namespace: 'default',
            endpoint: 'http://test-app.default',
            ready: true,
            replicas: 3,
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const input: VerifyInput = {
        sessionId: 'test-session',
      };

      const result = await verifyDeploymentHandler.handler(input, mockContext);

      expect(result).toEqual({
        success: true,
        sessionId: 'test-session',
        namespace: 'default',
        deploymentName: 'test-app',
        serviceName: 'test-app-service',
        endpoint: 'http://test-app.default',
        ready: true,
        replicas: 1,
      });

      expect(mockHelper.checkDeploymentHealth).toHaveBeenCalledWith(
        'test-app',
        'default',
        mockContext,
      );
    });

    it('should verify deployment and report unhealthy status', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: 'unhealthy-app',
            serviceName: 'unhealthy-service',
            namespace: 'staging',
            endpoint: 'http://unhealthy-app.staging',
            ready: false,
            replicas: 2,
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const mockCheckDeploymentHealth = mockHelper.checkDeploymentHealth as jest.MockedFunction<
        typeof mockHelper.checkDeploymentHealth
      >;
      mockCheckDeploymentHealth.mockResolvedValue({
        name: 'unhealthy-app',
        endpoint: 'http://unhealthy-app.staging',
        status: 'unhealthy',
        response_time_ms: 5000,
      });

      const input: VerifyInput = {
        sessionId: 'unhealthy-session',
      };

      const result = await verifyDeploymentHandler.handler(input, mockContext);

      expect(result.ready).toBe(false);
      expect(result.deploymentName).toBe('unhealthy-app');
      expect(result.namespace).toBe('staging');
    });

    it('should handle degraded deployment status', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: 'degraded-app',
            serviceName: 'degraded-service',
            namespace: 'production',
            endpoint: 'http://degraded-app.production',
            ready: true,
            replicas: 5,
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const mockCheckDeploymentHealth = mockHelper.checkDeploymentHealth as jest.MockedFunction<
        typeof mockHelper.checkDeploymentHealth
      >;
      mockCheckDeploymentHealth.mockResolvedValue({
        name: 'degraded-app',
        endpoint: 'http://degraded-app.production',
        status: 'degraded',
        response_time_ms: 2000,
      });

      const input: VerifyInput = {
        sessionId: 'degraded-session',
      };

      const result = await verifyDeploymentHandler.handler(input, mockContext);

      expect(result.ready).toBe(false);
      expect(result.success).toBe(true);
    });
  });

  describe('session management', () => {
    it('should fail when session service is not available', async () => {
      const contextWithoutSessionService = {
        ...mockContext,
        sessionService: undefined,
      };

      const input: VerifyInput = {
        sessionId: 'test-session',
      };

      await expect(
        verifyDeploymentHandler.handler(input, contextWithoutSessionService),
      ).rejects.toThrow(DomainError);
      await expect(
        verifyDeploymentHandler.handler(input, contextWithoutSessionService),
      ).rejects.toThrow('Session service not available');
    });

    it('should fail when session is not found', async () => {
      mockSessionService.mockResolvedValue(null);

      const input: VerifyInput = {
        sessionId: 'nonexistent-session',
      };

      await expect(verifyDeploymentHandler.handler(input, mockContext)).rejects.toThrow(
        DomainError,
      );
      await expect(verifyDeploymentHandler.handler(input, mockContext)).rejects.toThrow(
        'Session not found',
      );
    });

    it('should fail when no deployment found in session', async () => {
      const session = createTypedSession({
        workflow_state: {
          analysis_result: { language: 'javascript' },
          build_result: { imageId: 'test:latest' },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const input: VerifyInput = {
        sessionId: 'no-deployment-session',
      };

      await expect(verifyDeploymentHandler.handler(input, mockContext)).rejects.toThrow(
        'No deployment found in session',
      );
    });

    it('should fail when deployment result lacks deployment name', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            serviceName: 'test-service',
            namespace: 'default',
            // Missing deploymentName
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const input: VerifyInput = {
        sessionId: 'incomplete-deployment-session',
      };

      await expect(verifyDeploymentHandler.handler(input, mockContext)).rejects.toThrow(
        'No deployment found in session',
      );
    });
  });

  describe('progress tracking', () => {
    it('should emit progress events when progress emitter is available', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: 'progress-app',
            serviceName: 'progress-service',
            namespace: 'default',
            endpoint: 'http://progress-app.default',
            ready: true,
            replicas: 2,
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const input: VerifyInput = {
        sessionId: 'progress-test-session',
      };

      const emitSpy = jest.fn();
      const mockProgressEmitter = mockContext.progressEmitter as EventEmitter & {
        emit: jest.MockedFunction<(args: unknown) => Promise<void>>;
      };
      if (mockProgressEmitter) {
        mockProgressEmitter.emit = emitSpy;
      }

      await verifyDeploymentHandler.handler(input, mockContext);
      expect(emitSpy).toHaveBeenCalledWith({
        sessionId: 'progress-test-session',
        step: 'verify_deployment',
        status: 'in_progress',
        message: 'Verifying deployment health',
        progress: 0.5,
      });

      expect(emitSpy).toHaveBeenCalledWith({
        sessionId: 'progress-test-session',
        step: 'verify_deployment',
        status: 'completed',
        message: 'Deployment verified successfully',
        progress: 1.0,
      });
    });

    it('should emit failure progress when deployment is unhealthy', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: 'failure-app',
            serviceName: 'failure-service',
            namespace: 'default',
            endpoint: 'http://failure-app.default',
            ready: false,
            replicas: 1,
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const mockCheckDeploymentHealth = mockHelper.checkDeploymentHealth as jest.MockedFunction<
        typeof mockHelper.checkDeploymentHealth
      >;
      mockCheckDeploymentHealth.mockResolvedValue({
        name: 'failure-app',
        endpoint: 'http://failure-app.default',
        status: 'unhealthy',
      });

      const input: VerifyInput = {
        sessionId: 'failure-test-session',
      };

      const emitSpyFailure = jest.fn();
      const mockProgressEmitter = mockContext.progressEmitter as EventEmitter & {
        emit: jest.MockedFunction<(args: unknown) => Promise<void>>;
      };
      if (mockProgressEmitter) {
        mockProgressEmitter.emit = emitSpyFailure;
      }

      const result = await verifyDeploymentHandler.handler(input, mockContext);

      expect(result.ready).toBe(false);
      expect(emitSpyFailure).toHaveBeenCalledWith({
        sessionId: 'failure-test-session',
        step: 'verify_deployment',
        status: 'failed',
        message: 'Deployment verification failed',
        progress: 1.0,
      });
    });

    it('should handle missing progress emitter gracefully', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: 'no-progress-app',
            serviceName: 'no-progress-service',
            namespace: 'default',
          },
        },
      });

      mockSessionService.mockResolvedValue(session);
      const contextWithoutProgress = {
        ...mockContext,
        progressEmitter: undefined,
      };

      const input: VerifyInput = {
        sessionId: 'no-progress-session',
      };

      const result = await verifyDeploymentHandler.handler(input, contextWithoutProgress);
      expect(result.success).toBe(true);
    });
  });

  describe('health check scenarios', () => {
    it('should handle health check with response time metrics', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: 'metrics-app',
            serviceName: 'metrics-service',
            namespace: 'default',
            endpoint: 'http://metrics-app.default',
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const mockCheckDeploymentHealth = mockHelper.checkDeploymentHealth as jest.MockedFunction<
        typeof mockHelper.checkDeploymentHealth
      >;
      mockCheckDeploymentHealth.mockResolvedValue({
        name: 'metrics-app',
        endpoint: 'http://metrics-app.default',
        status: 'healthy',
        response_time_ms: 125,
      });

      const input: VerifyInput = {
        sessionId: 'metrics-session',
      };

      const result = await verifyDeploymentHandler.handler(input, mockContext);

      expect(result.ready).toBe(true);
      expect(mockHelper.checkDeploymentHealth).toHaveBeenCalledWith(
        'metrics-app',
        'default',
        mockContext,
      );
    });

    it('should handle health check without response time', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: 'simple-app',
            serviceName: 'simple-service',
            namespace: 'test',
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const mockCheckDeploymentHealth = mockHelper.checkDeploymentHealth as jest.MockedFunction<
        typeof mockHelper.checkDeploymentHealth
      >;
      mockCheckDeploymentHealth.mockResolvedValue({
        name: 'simple-app',
        endpoint: 'http://simple-app.test',
        status: 'healthy',
      });

      const input: VerifyInput = {
        sessionId: 'simple-session',
      };

      const result = await verifyDeploymentHandler.handler(input, mockContext);

      expect(result.ready).toBe(true);
      expect(result.namespace).toBe('test');
    });

    it('should handle health check failures', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: 'error-app',
            serviceName: 'error-service',
            namespace: 'default',
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const mockCheckDeploymentHealth = mockHelper.checkDeploymentHealth as jest.MockedFunction<
        typeof mockHelper.checkDeploymentHealth
      >;
      mockCheckDeploymentHealth.mockRejectedValue(new Error('Health check timeout'));

      const input: VerifyInput = {
        sessionId: 'error-session',
      };

      await expect(verifyDeploymentHandler.handler(input, mockContext)).rejects.toThrow(
        'Health check timeout',
      );
    });
  });

  describe('different namespace scenarios', () => {
    it('should handle deployments in custom namespaces', async () => {
      const testNamespaces = ['production', 'staging', 'development', 'kube-system'];

      for (const namespace of testNamespaces) {
        const session = createTypedSession({
          workflow_state: {
            deployment_result: {
              deploymentName: `${namespace}-app`,
              serviceName: `${namespace}-service`,
              namespace,
              endpoint: `http://${namespace}-app.${namespace}`,
            },
          },
        });

        mockSessionService.mockResolvedValue(session);

        const mockCheckDeploymentHealth = mockHelper.checkDeploymentHealth as jest.MockedFunction<
          typeof mockHelper.checkDeploymentHealth
        >;
        mockCheckDeploymentHealth.mockResolvedValue({
          name: `${namespace}-app`,
          endpoint: `http://${namespace}-app.${namespace}`,
          status: 'healthy',
        });

        const input: VerifyInput = {
          sessionId: `${namespace}-session`,
        };

        const result = await verifyDeploymentHandler.handler(input, mockContext);

        expect(result.namespace).toBe(namespace);
        expect(result.deploymentName).toBe(`${namespace}-app`);
        expect(mockHelper.checkDeploymentHealth).toHaveBeenCalledWith(
          `${namespace}-app`,
          namespace,
          mockContext,
        );
      }
    });
  });

  describe('error handling', () => {
    it('should handle generic errors gracefully', async () => {
      mockSessionService.mockRejectedValue(new Error('Database connection failed'));

      const input: VerifyInput = {
        sessionId: 'error-session',
      };

      await expect(verifyDeploymentHandler.handler(input, mockContext)).rejects.toThrow(
        'Database connection failed',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: expect.any(Error) as Error },
        'Verification failed',
      );
    });

    it('should handle domain errors', async () => {
      const domainError = new DomainError(
        ErrorCode.OPERATION_FAILED,
        'Verification operation failed',
      );

      mockSessionService.mockRejectedValue(domainError);

      const input: VerifyInput = {
        sessionId: 'domain-error-session',
      };

      await expect(verifyDeploymentHandler.handler(input, mockContext)).rejects.toThrow(
        'Verification operation failed',
      );
    });

    it('should handle non-Error objects', async () => {
      mockSessionService.mockRejectedValue('String error message');

      const input: VerifyInput = {
        sessionId: 'string-error-session',
      };

      await expect(verifyDeploymentHandler.handler(input, mockContext)).rejects.toThrow(
        'String error message',
      );
    });

    it('should emit failure progress on errors', async () => {
      mockSessionService.mockRejectedValue(new Error('Session error'));

      const input: VerifyInput = {
        sessionId: 'progress-error-session',
      };

      await expect(verifyDeploymentHandler.handler(input, mockContext)).rejects.toThrow();

      const emitSpyError = jest.fn();
      const mockProgressEmitter = mockContext.progressEmitter as EventEmitter & {
        emit: jest.MockedFunction<(args: unknown) => Promise<void>>;
      };
      if (mockProgressEmitter) {
        mockProgressEmitter.emit = emitSpyError;
      }
      expect(emitSpyError).toHaveBeenCalledWith({
        sessionId: 'progress-error-session',
        step: 'verify_deployment',
        status: 'failed',
        message: 'Verification failed',
      });
    });
  });

  describe('logging behavior', () => {
    it('should log verification start and completion', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: 'logging-app',
            serviceName: 'logging-service',
            namespace: 'logs',
            endpoint: 'http://logging-app.logs',
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const input: VerifyInput = {
        sessionId: 'logging-session',
      };

      await verifyDeploymentHandler.handler(input, mockContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { sessionId: 'logging-session' },
        'Starting deployment verification',
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          deploymentName: 'logging-app',
          namespace: 'logs',
          ready: true,
        },
        'Deployment verification completed',
      );
    });

    it('should log errors with context', async () => {
      const error = new Error('Verification process failed');
      mockSessionService.mockRejectedValue(error);

      const input: VerifyInput = {
        sessionId: 'error-logging-session',
      };

      await expect(verifyDeploymentHandler.handler(input, mockContext)).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith({ error }, 'Verification failed');
    });
  });

  describe('tool descriptor properties', () => {
    it('should have correct tool metadata', () => {
      expect(verifyDeploymentHandler.name).toBe('verify_deployment');
      expect(verifyDeploymentHandler.description).toBe(
        'Verify Kubernetes deployment health and get endpoints',
      );
      expect(verifyDeploymentHandler.category).toBe('workflow');
      expect(verifyDeploymentHandler.inputSchema).toBeDefined();
      expect(verifyDeploymentHandler.outputSchema).toBeDefined();
    });

    it('should not have a chain hint (end of workflow)', () => {
      expect(verifyDeploymentHandler.chainHint).toBeUndefined();
    });
  });

  describe('input validation', () => {
    it('should validate required sessionId', () => {
      const input = {} as VerifyInput; // Missing sessionId

      // Input validation should be handled by the schema
      expect(() => verifyDeploymentHandler.inputSchema.parse(input)).toThrow();
    });

    it('should accept valid sessionId', () => {
      const input: VerifyInput = {
        sessionId: 'valid-session',
      };

      const parsed = verifyDeploymentHandler.inputSchema.parse(input);
      expect(parsed.sessionId).toBe('valid-session');
    });
  });

  describe('output validation', () => {
    it('should produce schema-compliant output', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: 'validation-app',
            serviceName: 'validation-service',
            namespace: 'validation',
            endpoint: 'http://validation-app.validation',
            ready: true,
            replicas: 2,
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const input: VerifyInput = {
        sessionId: 'validation-session',
      };

      const result = await verifyDeploymentHandler.handler(input, mockContext);

      // Validate output against schema
      expect(() => verifyDeploymentHandler.outputSchema.parse(result)).not.toThrow();
      expect(result).toMatchObject({
        success: true,
        sessionId: 'validation-session',
        namespace: expect.any(String) as string,
        deploymentName: expect.any(String) as string,
        serviceName: expect.any(String) as string,
        ready: expect.any(Boolean) as boolean,
        replicas: expect.any(Number) as number,
      });
    });

    it('should handle all required and optional output fields', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: 'complete-app',
            serviceName: 'complete-service',
            namespace: 'complete',
            endpoint: 'http://complete-app.complete',
            ready: true,
            replicas: 3,
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const input: VerifyInput = {
        sessionId: 'complete-session',
      };

      const result = await verifyDeploymentHandler.handler(input, mockContext);

      // Check required fields exist
      const resultTyped = result as {
        success: boolean;
        sessionId: string;
        namespace: string;
        deploymentName: string;
        serviceName: string;
        ready: boolean;
        replicas: number;
        endpoint?: string;
      };

      expect(resultTyped.success).toBeDefined();
      expect(resultTyped.sessionId).toBeDefined();
      expect(resultTyped.namespace).toBeDefined();
      expect(resultTyped.deploymentName).toBeDefined();
      expect(resultTyped.serviceName).toBeDefined();
      expect(resultTyped.ready).toBeDefined();
      expect(resultTyped.replicas).toBeDefined();

      // Check optional field
      expect(resultTyped.endpoint).toBeDefined();

      // Check types
      expect(typeof resultTyped.success).toBe('boolean');
      expect(typeof resultTyped.sessionId).toBe('string');
      expect(typeof resultTyped.namespace).toBe('string');
      expect(typeof resultTyped.deploymentName).toBe('string');
      expect(typeof resultTyped.serviceName).toBe('string');
      expect(typeof resultTyped.ready).toBe('boolean');
      expect(typeof resultTyped.replicas).toBe('number');
      expect(typeof resultTyped.endpoint).toBe('string');
    });
  });

  describe('integration scenarios', () => {
    it('should work with complex deployment scenarios', async () => {
      const session = createTypedSession({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
            dependencies: [{ name: 'express', type: 'runtime' }],
          },
          build_result: {
            imageId: 'sha256:complex123',
            tags: ['complex-app:v2.1.0', 'complex-app:latest'],
          },
          deployment_result: {
            deploymentName: 'complex-microservice',
            serviceName: 'complex-api',
            namespace: 'microservices',
            endpoint: 'https://api.complex-app.com',
            ready: true,
            replicas: 5,
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const mockCheckDeploymentHealth = mockHelper.checkDeploymentHealth as jest.MockedFunction<
        typeof mockHelper.checkDeploymentHealth
      >;
      mockCheckDeploymentHealth.mockResolvedValue({
        name: 'complex-microservice',
        endpoint: 'https://api.complex-app.com',
        status: 'healthy',
        response_time_ms: 89,
      });

      const input: VerifyInput = {
        sessionId: 'complex-integration-session',
      };

      const result = await verifyDeploymentHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.ready).toBe(true);
      expect(result.deploymentName).toBe('complex-microservice');
      expect(result.serviceName).toBe('complex-api');
      expect(result.namespace).toBe('microservices');
      expect(result.endpoint).toBe('https://api.complex-app.com');
    });

    it('should handle microservices architecture verification', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: 'user-service',
            serviceName: 'user-api',
            namespace: 'microservices',
            endpoint: 'http://user-service.microservices.cluster.local:8080',
            ready: true,
            replicas: 3,
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const mockCheckDeploymentHealth = mockHelper.checkDeploymentHealth as jest.MockedFunction<
        typeof mockHelper.checkDeploymentHealth
      >;
      mockCheckDeploymentHealth.mockResolvedValue({
        name: 'user-service',
        endpoint: 'http://user-service.microservices.cluster.local:8080',
        status: 'healthy',
        response_time_ms: 35,
      });

      const input: VerifyInput = {
        sessionId: 'microservices-session',
      };

      const result = await verifyDeploymentHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.ready).toBe(true);
      expect(result.endpoint).toContain('cluster.local');
    });
  });

  describe('edge cases', () => {
    it('should handle deployment with missing optional fields', async () => {
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: 'minimal-app',
            // Missing serviceName, endpoint
            namespace: 'minimal',
            ready: false,
            replicas: 1,
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const input: VerifyInput = {
        sessionId: 'minimal-session',
      };

      const result = await verifyDeploymentHandler.handler(input, mockContext);

      const resultTyped = result as {
        success: boolean;
        deploymentName: string;
        serviceName?: string;
        endpoint?: string;
      };
      expect(resultTyped.success).toBe(true);
      expect(resultTyped.deploymentName).toBe('minimal-app');
      expect(resultTyped.serviceName).toBeUndefined();
      expect(resultTyped.endpoint).toBeUndefined();
    });

    it('should handle very long deployment names', async () => {
      const longDeploymentName =
        'very-long-deployment-name-with-many-characters-and-identifiers-v123';
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: longDeploymentName,
            serviceName: 'long-service',
            namespace: 'default',
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const input: VerifyInput = {
        sessionId: 'long-name-session',
      };

      const result = await verifyDeploymentHandler.handler(input, mockContext);

      const resultTyped = result as { deploymentName: string };
      expect(resultTyped.deploymentName).toBe(longDeploymentName);
    });

    it('should handle special characters in deployment names', async () => {
      const specialDeploymentName = 'app-with-dashes_and_underscores.dots123';
      const session = createTypedSession({
        workflow_state: {
          deployment_result: {
            deploymentName: specialDeploymentName,
            serviceName: 'special-service',
            namespace: 'special-chars',
          },
        },
      });

      mockSessionService.mockResolvedValue(session);

      const input: VerifyInput = {
        sessionId: 'special-chars-session',
      };

      const result = await verifyDeploymentHandler.handler(input, mockContext);

      const resultTyped = result as { deploymentName: string };
      expect(resultTyped.deploymentName).toBe(specialDeploymentName);
    });
  });
});
