/**
 * Prepare Cluster Tool - Unit Tests
 */

import { jest } from '@jest/globals';
import prepareClusterHandler from '../index';
import type { PrepareClusterInputType, PrepareClusterOutput } from '../prepare-cluster';
import type { ToolContext } from '../../tool-types';
import type { SessionService } from '../../../../services/interfaces';
import type { Session } from '../../../../domain/types/session';
import { ErrorCode, InfrastructureError } from '../../../../domain/types/errors';
import {
  createMockToolContext,
  createMockSession,
  createMockLogger,
} from '../../__tests__/shared/test-utils';
import { createMockKubernetesService } from '../../__tests__/shared/kubernetes-mocks';

// Helper type for session updater function
type SessionUpdater = (session: Session) => Session;

describe('prepare-cluster tool', () => {
  let mockContext: ToolContext;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = createMockLogger();
    mockContext = createMockToolContext({
      logger: mockLogger,
      kubernetesService: createMockKubernetesService(),
    });
  });

  describe('basic cluster preparation', () => {
    it('should prepare cluster successfully', async () => {
      const session = createMockSession({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
          },
        },
      });

      const mockGet = mockContext.sessionService!.get;
      mockGet.mockResolvedValue(session);

      const input: PrepareClusterInputType = {
        sessionId: 'test-session',
      };

      const result = await prepareClusterHandler.handler(input, mockContext);

      expect(result).toEqual({
        success: true,
        sessionId: 'test-session',
      });

      const mockUpdateAtomic = mockContext.sessionService!.updateAtomic;
      expect(mockUpdateAtomic).toHaveBeenCalledWith(
        'test-session',
        expect.any(Function) as SessionUpdater,
      );
    });

    it('should update session with cluster readiness state', async () => {
      const session = createMockSession({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
      });

      const updateAtomicMock = jest.fn<SessionService['updateAtomic']>();
      const mockGet = mockContext.sessionService!.get;
      mockGet.mockResolvedValue(session);
      mockContext.sessionService!.updateAtomic = updateAtomicMock;

      const input: PrepareClusterInputType = {
        sessionId: 'test-session',
      };

      await prepareClusterHandler.handler(input, mockContext);

      expect(updateAtomicMock).toHaveBeenCalledWith(
        'test-session',
        expect.any(Function) as SessionUpdater,
      );

      // Verify the updater function works correctly
      const updaterFunction = updateAtomicMock.mock.calls[0][1] as SessionUpdater;
      const updatedSession = updaterFunction(session);

      expect(updatedSession.workflow_state.clusterReady).toBe(true);
    });

    it('should handle different session ID formats', async () => {
      const testCases = [
        'simple-session',
        'session-with-hyphens',
        'session_with_underscores',
        'SessionWithMixedCase',
        '12345-numeric-session',
        'very-long-session-id-with-many-characters-and-identifiers',
      ];

      for (const sessionId of testCases) {
        const session = createMockSession({
          workflow_state: { analysis_result: { language: 'javascript' } },
        });

        const mockGet = mockContext.sessionService!.get;
        mockGet.mockResolvedValue(session);

        const input: PrepareClusterInputType = { sessionId };
        const result = await prepareClusterHandler.handler(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.sessionId).toBe(sessionId);
      }
    });
  });

  describe('session management', () => {
    it('should fail when session service is not available', async () => {
      mockContext.sessionService = undefined;

      const input: PrepareClusterInputType = {
        sessionId: 'test-session',
      };

      await expect(prepareClusterHandler.handler(input, mockContext)).rejects.toThrow(
        InfrastructureError,
      );
      await expect(prepareClusterHandler.handler(input, mockContext)).rejects.toThrow(
        'Session service not available',
      );
    });

    it('should fail when session is not found', async () => {
      const mockGet = mockContext.sessionService!.get;
      mockGet.mockResolvedValue(null);

      const input: PrepareClusterInputType = {
        sessionId: 'nonexistent-session',
      };

      await expect(prepareClusterHandler.handler(input, mockContext)).rejects.toThrow(
        InfrastructureError,
      );
      await expect(prepareClusterHandler.handler(input, mockContext)).rejects.toThrow(
        'Session nonexistent-session not found',
      );
    });

    it('should handle session service get errors', async () => {
      const mockGet = mockContext.sessionService!.get;
      mockGet.mockRejectedValue(new Error('Database connection failed'));

      const input: PrepareClusterInputType = {
        sessionId: 'error-session',
      };

      await expect(prepareClusterHandler.handler(input, mockContext)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should handle session service updateAtomic errors', async () => {
      const session = createMockSession();
      const mockGet = mockContext.sessionService!.get;
      mockGet.mockResolvedValue(session);
      const mockUpdateAtomic = mockContext.sessionService!.updateAtomic;
      mockUpdateAtomic.mockRejectedValue(new Error('Session update failed'));

      const input: PrepareClusterInputType = {
        sessionId: 'update-error-session',
      };

      await expect(prepareClusterHandler.handler(input, mockContext)).rejects.toThrow(
        'Session update failed',
      );
    });
  });

  describe('progress tracking', () => {
    it('should emit progress events when progress emitter is available', async () => {
      const session = createMockSession();
      mockContext.sessionService!.get = jest.fn().mockResolvedValue(session);

      const input: PrepareClusterInputType = {
        sessionId: 'progress-test',
      };

      await prepareClusterHandler.handler(input, mockContext);

      const mockProgressEmitter = mockContext.progressEmitter;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockEmit = mockProgressEmitter?.emit as jest.Mock;
      expect(mockEmit).toHaveBeenCalledWith({
        sessionId: 'progress-test',
        step: 'prepare_cluster',
        status: 'in_progress',
        message: 'Preparing cluster for deployment',
        progress: 0.5,
      });

      expect(mockEmit).toHaveBeenCalledWith({
        sessionId: 'progress-test',
        step: 'prepare_cluster',
        status: 'completed',
        message: 'Cluster preparation complete',
        progress: 1.0,
      });
    });

    it('should emit failure progress when preparation fails', async () => {
      mockContext.sessionService!.get = jest
        .fn()
        .mockRejectedValue(new Error('Cluster connection timeout'));

      const input: PrepareClusterInputType = {
        sessionId: 'failure-test',
      };

      await expect(prepareClusterHandler.handler(input, mockContext)).rejects.toThrow();

      const mockProgressEmitter = mockContext.progressEmitter;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockEmit = mockProgressEmitter?.emit as jest.Mock;
      expect(mockEmit).toHaveBeenCalledWith({
        sessionId: 'failure-test',
        step: 'prepare_cluster',
        status: 'failed',
        message: 'Cluster preparation failed: Cluster connection timeout',
      });
    });

    it('should handle missing progress emitter gracefully', async () => {
      const session = createMockSession();
      mockContext.sessionService!.get = jest.fn().mockResolvedValue(session);
      mockContext.progressEmitter = undefined;

      const input: PrepareClusterInputType = {
        sessionId: 'no-progress-test',
      };

      const result = await prepareClusterHandler.handler(input, mockContext);
      expect(result.success).toBe(true);
    });

    it('should handle progress emitter errors', async () => {
      const session = createMockSession();
      mockContext.sessionService!.get = jest.fn().mockResolvedValue(session);
      mockContext.progressEmitter.emit = jest
        .fn()
        .mockRejectedValue(new Error('Progress emit failed'));

      const input: PrepareClusterInputType = {
        sessionId: 'progress-error-test',
      };

      // Should still complete despite progress emit errors
      const result = await prepareClusterHandler.handler(input, mockContext);
      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle generic errors gracefully', async () => {
      mockContext.sessionService!.get = jest.fn().mockRejectedValue(new Error('Unexpected error'));

      const input: PrepareClusterInputType = {
        sessionId: 'generic-error-test',
      };

      await expect(prepareClusterHandler.handler(input, mockContext)).rejects.toThrow(
        'Unexpected error',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: expect.any(Error), sessionId: 'generic-error-test' },
        'Cluster preparation failed',
      );
    });

    it('should handle infrastructure errors', async () => {
      const infraError = new InfrastructureError(
        ErrorCode.ServiceUnavailable,
        'Kubernetes API server unreachable',
      );
      mockContext.sessionService!.get = jest.fn().mockRejectedValue(infraError);

      const input: PrepareClusterInputType = {
        sessionId: 'infra-error-test',
      };

      await expect(prepareClusterHandler.handler(input, mockContext)).rejects.toThrow(
        'Kubernetes API server unreachable',
      );
    });

    it('should handle non-Error objects', async () => {
      mockContext.sessionService!.get = jest.fn().mockRejectedValue('String error message');

      const input: PrepareClusterInputType = {
        sessionId: 'string-error-test',
      };

      await expect(prepareClusterHandler.handler(input, mockContext)).rejects.toThrow(
        'String error message',
      );
    });

    it('should handle null/undefined errors', async () => {
      mockContext.sessionService!.get = jest.fn().mockRejectedValue(null);

      const input: PrepareClusterInputType = {
        sessionId: 'null-error-test',
      };

      await expect(prepareClusterHandler.handler(input, mockContext)).rejects.toThrow('null');
    });
  });

  describe('logging behavior', () => {
    it('should log preparation start and completion', async () => {
      const session = createMockSession();
      mockContext.sessionService!.get = jest.fn().mockResolvedValue(session);

      const input: PrepareClusterInputType = {
        sessionId: 'logging-test',
      };

      await prepareClusterHandler.handler(input, mockContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { sessionId: 'logging-test' },
        'Starting cluster preparation',
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        { sessionId: 'logging-test', clusterReady: true },
        'Cluster preparation completed',
      );
    });

    it('should log errors with context', async () => {
      const error = new Error('Preparation failed');
      mockContext.sessionService!.get = jest.fn().mockRejectedValue(error);

      const input: PrepareClusterInputType = {
        sessionId: 'error-logging-test',
      };

      await expect(prepareClusterHandler.handler(input, mockContext)).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error, sessionId: 'error-logging-test' },
        'Cluster preparation failed',
      );
    });

    it('should include relevant context in logs', async () => {
      const session = createMockSession({
        metadata: {
          projectName: 'test-project',
          environment: 'staging',
        },
      });

      mockContext.sessionService!.get = jest.fn().mockResolvedValue(session);

      const input: PrepareClusterInputType = {
        sessionId: 'context-logging-test',
      };

      await prepareClusterHandler.handler(input, mockContext);

      // Verify logging includes session context
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'context-logging-test' }),
        expect.any(String),
      );
    });
  });

  describe('cluster readiness simulation', () => {
    it('should always set cluster as ready in current implementation', async () => {
      const session = createMockSession();
      const updateAtomicMock = jest.fn();
      mockContext.sessionService!.get = jest.fn().mockResolvedValue(session);
      mockContext.sessionService!.updateAtomic = updateAtomicMock;

      const input: PrepareClusterInputType = {
        sessionId: 'readiness-test',
      };

      await prepareClusterHandler.handler(input, mockContext);

      const updaterFunction = updateAtomicMock.mock.calls[0][1];
      const updatedSession = updaterFunction(session);

      expect(updatedSession.workflow_state.clusterReady).toBe(true);
    });

    it('should preserve existing workflow state when updating', async () => {
      const session = createMockSession({
        workflow_state: {
          analysis_result: { language: 'python', framework: 'django' },
          build_result: { imageId: 'test:latest' },
          existingProperty: 'should-be-preserved',
        },
      });

      const updateAtomicMock = jest.fn();
      mockContext.sessionService!.get = jest.fn().mockResolvedValue(session);
      mockContext.sessionService!.updateAtomic = updateAtomicMock;

      const input: PrepareClusterInputType = {
        sessionId: 'preserve-state-test',
      };

      await prepareClusterHandler.handler(input, mockContext);

      const updaterFunction = updateAtomicMock.mock.calls[0][1];
      const updatedSession = updaterFunction(session);

      expect(updatedSession.workflow_state).toMatchObject({
        analysis_result: { language: 'python', framework: 'django' },
        build_result: { imageId: 'test:latest' },
        existingProperty: 'should-be-preserved',
        clusterReady: true,
      });
    });
  });

  describe('tool descriptor properties', () => {
    it('should have correct tool metadata', () => {
      expect(prepareClusterHandler.name).toBe('prepare_cluster');
      expect(prepareClusterHandler.description).toBe(
        'Prepare and validate Kubernetes cluster for application deployment',
      );
      expect(prepareClusterHandler.category).toBe('workflow');
      expect(prepareClusterHandler.inputSchema).toBeDefined();
      expect(prepareClusterHandler.outputSchema).toBeDefined();
    });

    it('should have appropriate timeout for cluster operations', () => {
      expect(prepareClusterHandler.timeout).toBe(60000); // 60 seconds
    });

    it('should have correct chain hint for next tool', () => {
      expect(prepareClusterHandler.chainHint).toMatchObject({
        nextTool: 'deploy_application',
        reason: 'Deploy application to prepared cluster',
        paramMapper: expect.any(Function) as jest.Mock,
      });
    });

    it('should provide correct parameter mapping for chaining', () => {
      const output: PrepareClusterOutput = {
        success: true,
        sessionId: 'chain-test',
      };

      const paramMapper = prepareClusterHandler.chainHint!.paramMapper as jest.Mock;
      const mappedParams = paramMapper(output);
      expect(mappedParams).toEqual({
        sessionId: 'chain-test',
      });
    });
  });

  describe('input validation', () => {
    it('should validate required sessionId', () => {
      const input = {} as PrepareClusterInputType; // Missing sessionId

      // Input validation should be handled by the schema
      expect(() => prepareClusterHandler.inputSchema.parse(input)).toThrow();
    });

    it('should accept valid sessionId', () => {
      const input: PrepareClusterInputType = {
        sessionId: 'valid-session',
      };

      const parsed = prepareClusterHandler.inputSchema.parse(input);
      expect(parsed.sessionId).toBe('valid-session');
    });
  });

  describe('output validation', () => {
    it('should produce schema-compliant output', async () => {
      const session = createMockSession();
      mockContext.sessionService!.get = jest.fn().mockResolvedValue(session);

      const input: PrepareClusterInputType = {
        sessionId: 'output-validation-test',
      };

      const result = await prepareClusterHandler.handler(input, mockContext);

      // Validate output against schema
      expect(() => prepareClusterHandler.outputSchema.parse(result)).not.toThrow();
      expect(result).toMatchObject({
        success: true,
        sessionId: 'output-validation-test',
      });
    });

    it('should handle all required output fields', async () => {
      const session = createMockSession();
      mockContext.sessionService!.get = jest.fn().mockResolvedValue(session);

      const input: PrepareClusterInputType = {
        sessionId: 'required-fields-test',
      };

      const result = await prepareClusterHandler.handler(input, mockContext);

      expect(result.success).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.sessionId).toBe('string');
    });
  });

  describe('integration scenarios', () => {
    it('should work with various session states', async () => {
      const sessionStates = [
        {
          workflow_state: { analysis_result: { language: 'javascript' } },
        },
        {
          workflow_state: {
            analysis_result: { language: 'python' },
            build_result: { imageId: 'app:latest' },
          },
        },
        {
          workflow_state: {
            analysis_result: { language: 'java' },
            build_result: { imageId: 'app:v1.0.0' },
            dockerfile_result: { path: './Dockerfile' },
          },
        },
        {
          workflow_state: {},
        },
      ];

      for (const [index, sessionState] of sessionStates.entries()) {
        const session = createMockSession(sessionState);
        mockContext.sessionService!.get = jest.fn().mockResolvedValue(session);

        const input: PrepareClusterInputType = {
          sessionId: `integration-test-${index}`,
        };

        const result = await prepareClusterHandler.handler(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.sessionId).toBe(`integration-test-${index}`);
      }
    });

    it('should handle workflow continuation after previous steps', async () => {
      // Simulate a session after dockerfile generation and image building
      const session = createMockSession({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
            dependencies: [{ name: 'express', type: 'runtime' }],
            ports: [3000],
          },
          dockerfile_result: {
            content: 'FROM node:16\nWORKDIR /app\nCOPY . .\nEXPOSE 3000\nCMD ["node", "server"]',
            path: './Dockerfile',
          },
          build_result: {
            imageId: 'sha256:abcdef123456',
            tags: ['myapp:latest', 'myapp:v1.0.0'],
          },
        },
      });

      mockContext.sessionService!.get = jest.fn().mockResolvedValue(session);

      const input: PrepareClusterInputType = {
        sessionId: 'workflow-continuation-test',
      };

      const result = await prepareClusterHandler.handler(input, mockContext);

      expect(result.success).toBe(true);

      // Verify that existing workflow state is preserved
      const mockFunction3 = expect.any(Function) as jest.Mock;
      expect(mockContext.sessionService!.updateAtomic).toHaveBeenCalledWith(
        'workflow-continuation-test',
        mockFunction3,
      );
    });
  });

  describe('timeout handling', () => {
    it('should have appropriate timeout configuration', () => {
      expect(prepareClusterHandler.timeout).toBe(60000);
      expect(prepareClusterHandler.timeout).toBeGreaterThan(30000); // At least 30 seconds
      expect(prepareClusterHandler.timeout).toBeLessThanOrEqual(120000); // At most 2 minutes
    });
  });

  describe('edge cases', () => {
    it('should handle session with minimal workflow state', async () => {
      const session = createMockSession({
        workflow_state: null,
      });

      const updateAtomicMock = jest.fn();
      mockContext.sessionService!.get = jest.fn().mockResolvedValue(session);
      mockContext.sessionService!.updateAtomic = updateAtomicMock;

      const input: PrepareClusterInputType = {
        sessionId: 'minimal-state-test',
      };

      await prepareClusterHandler.handler(input, mockContext);

      const updaterFunction = updateAtomicMock.mock.calls[0][1];
      const updatedSession = updaterFunction(session);

      expect(updatedSession.workflow_state.clusterReady).toBe(true);
    });

    it('should handle session with undefined workflow state', async () => {
      const session = createMockSession();
      delete (session as any).workflow_state;

      const updateAtomicMock = jest.fn();
      mockContext.sessionService!.get = jest.fn().mockResolvedValue(session);
      mockContext.sessionService!.updateAtomic = updateAtomicMock;

      const input: PrepareClusterInputType = {
        sessionId: 'undefined-state-test',
      };

      await prepareClusterHandler.handler(input, mockContext);

      const updaterFunction = updateAtomicMock.mock.calls[0][1];
      const updatedSession = updaterFunction(session);

      expect(updatedSession.workflow_state).toBeDefined();
      expect(updatedSession.workflow_state.clusterReady).toBe(true);
    });
  });
});
