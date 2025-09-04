/**
 * Push Image Tool - Unit Tests
 */

import { jest } from '@jest/globals';

// Set up mocks before any imports for ESM compatibility
jest.unstable_mockModule('../helper', () => ({
  authenticateRegistry: jest.fn(),
  pushImage: jest.fn(),
  pushWithRetry: jest.fn(),
  getImagesToPush: jest.fn(),
  pushImagesParallel: jest.fn(),
  pushImagesSequential: jest.fn(),
  calculatePushTotals: jest.fn(),
}));

// Import modules AFTER setting up mocks
const pushImageHandler = (await import('../index')).default;
const mockHelper = await import('../helper');

// Import types and utilities
import type { PushInput, PushOutput } from '../push-image';
import type { ToolContext } from '../../tool-types';
import { DomainError } from '../../../../domain/types/errors';
import {
  createMockToolContext,
  createMockSession,
  createMockLogger,
} from '../../__tests__/shared/test-utils';
import { createMockDockerService } from '../../__tests__/shared/docker-mocks';

// Import proper types for helper functions
import type {
  authenticateRegistry,
  pushImage,
  pushWithRetry,
  getImagesToPush,
  pushImagesParallel,
  pushImagesSequential,
  calculatePushTotals,
} from '../helper';
import type { SessionService, ProgressEmitter } from '../../../services/interfaces';

// Create properly typed mock functions for helper
type MockHelper = {
  authenticateRegistry: jest.MockedFunction<typeof authenticateRegistry>;
  pushImage: jest.MockedFunction<typeof pushImage>;
  pushWithRetry: jest.MockedFunction<typeof pushWithRetry>;
  getImagesToPush: jest.MockedFunction<typeof getImagesToPush>;
  pushImagesParallel: jest.MockedFunction<typeof pushImagesParallel>;
  pushImagesSequential: jest.MockedFunction<typeof pushImagesSequential>;
  calculatePushTotals: jest.MockedFunction<typeof calculatePushTotals>;
};

const typedMockHelper = mockHelper as MockHelper;

describe('push-image tool', () => {
  let mockContext: ToolContext;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = createMockLogger();
    mockContext = createMockToolContext({
      logger: mockLogger,
      dockerService: createMockDockerService(),
    });

    // Reset helper mocks
    typedMockHelper.authenticateRegistry.mockReturnValue(true);
    typedMockHelper.pushImage.mockResolvedValue({
      digest: 'sha256:abcdef123456',
      size: 100 * 1024 * 1024,
      pushTime: 2000,
    });
  });

  describe('basic push operations', () => {
    it('should push image successfully with session-based tags', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: {
            imageId: 'myapp:latest',
            tags: ['myapp:latest', 'myapp:1.0.0'],
          },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: PushInput = {
        sessionId: 'test-session',
      };

      const result = await pushImageHandler.handler(input, mockContext);

      expect(result).toEqual({
        success: true,
        sessionId: 'test-session',
        registry: 'docker.io',
      });

      expect(mockHelper.authenticateRegistry).toHaveBeenCalledWith('docker.io', {}, mockContext);
      expect(mockHelper.pushImage).toHaveBeenCalledWith(
        'myapp:latest',
        'docker.io',
        {},
        mockContext,
      );
    });

    it('should push to custom registry when specified', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: {
            tags: ['myapp:v1.0.0'],
          },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: PushInput = {
        sessionId: 'test-session',
        registry: 'gcr.io/my-project',
      };

      const result = await pushImageHandler.handler(input, mockContext);

      expect(result.registry).toBe('gcr.io/my-project');
      expect(typedMockHelper.authenticateRegistry).toHaveBeenCalledWith(
        'gcr.io/my-project',
        {},
        mockContext,
      );
      expect(typedMockHelper.pushImage).toHaveBeenCalledWith(
        'myapp:v1.0.0',
        'gcr.io/my-project',
        {},
        mockContext,
      );
    });

    it('should handle multiple registries (AWS ECR, Azure ACR, GCR)', async () => {
      const testCases = [
        'amazonaws.com/my-repo',
        'azurecr.io/my-repo',
        'gcr.io/my-project/my-repo',
        'eu.gcr.io/my-project/my-repo',
      ];

      for (const registry of testCases) {
        const session = createMockSession({
          workflow_state: {
            build_result: { tags: ['app:latest'] },
          },
        });

        (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
          .fn<SessionService['get']>()
          .mockResolvedValue(session);

        const input: PushInput = {
          sessionId: 'test-session',
          registry,
        };

        const result = await pushImageHandler.handler(input, mockContext);
        expect(result.registry).toBe(registry);
      }
    });
  });

  describe('authentication scenarios', () => {
    it('should handle authentication success', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['secure-app:latest'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.authenticateRegistry.mockReturnValue(true);

      const input: PushInput = {
        sessionId: 'test-session',
        registry: 'private-registry.com',
      };

      const result = await pushImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(typedMockHelper.authenticateRegistry).toHaveBeenCalledWith(
        'private-registry.com',
        {},
        mockContext,
      );
    });

    it('should handle authentication failure', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['secure-app:latest'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.authenticateRegistry.mockReturnValue(false);

      const input: PushInput = {
        sessionId: 'test-session',
        registry: 'private-registry.com',
      };

      await expect(pushImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Failed to authenticate with registry',
      );
    });

    it('should handle credentials from environment variables', async () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        DOCKER_USERNAME: 'test-user',
        DOCKER_PASSWORD: 'test-password',
      };

      try {
        const session = createMockSession({
          workflow_state: {
            build_result: { tags: ['private-app:latest'] },
          },
        });

        (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
          .fn<SessionService['get']>()
          .mockResolvedValue(session);

        const input: PushInput = {
          sessionId: 'test-session',
          registry: 'private-registry.com',
        };

        await pushImageHandler.handler(input, mockContext);

        expect(typedMockHelper.authenticateRegistry).toHaveBeenCalled();
      } finally {
        process.env = originalEnv;
      }
    });
  });

  describe('push operation handling', () => {
    it('should handle successful push with digest and size', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['myapp:v2.1.0'] },
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

      const pushResult = {
        digest: 'sha256:1234567890abcdef',
        size: 150 * 1024 * 1024,
        pushTime: 3500,
      };
      typedMockHelper.pushImage.mockResolvedValue(pushResult);

      const input: PushInput = {
        sessionId: 'test-session',
      };

      const result = await pushImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      const mockUpdateFunction1 = expect.any(Function);
      const updateAtomicSpy = jest.spyOn(
        mockContext.sessionService as jest.Mocked<SessionService>,
        'updateAtomic',
      );
      expect(updateAtomicSpy).toHaveBeenCalledWith('test-session', mockUpdateFunction1);
    });

    it('should handle push failure', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['failing-app:latest'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.pushImage.mockRejectedValue(new Error('Network timeout during push'));

      const input: PushInput = {
        sessionId: 'test-session',
      };

      await expect(pushImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Network timeout during push',
      );
    });

    it('should handle docker service unavailable', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['offline-app:latest'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      mockContext.dockerService = undefined;

      // Helper should fall back to simulation
      typedMockHelper.pushImage.mockResolvedValue({
        digest: 'sha256:simulated123',
        size: 100 * 1024 * 1024,
        pushTime: 1000,
      });

      const input: PushInput = {
        sessionId: 'test-session',
      };

      const result = await pushImageHandler.handler(input, mockContext);
      expect(result.success).toBe(true);
    });
  });

  describe('session management', () => {
    it('should fail when session service is not available', async () => {
      mockContext.sessionService = undefined;

      const input: PushInput = {
        sessionId: 'test-session',
      };

      await expect(pushImageHandler.handler(input, mockContext)).rejects.toThrow(DomainError);
      await expect(pushImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Session service not available',
      );
    });

    it('should fail when session is not found', async () => {
      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(null);

      const input: PushInput = {
        sessionId: 'nonexistent-session',
      };

      await expect(pushImageHandler.handler(input, mockContext)).rejects.toThrow(DomainError);
      await expect(pushImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Session not found',
      );
    });

    it('should fail when no tagged images found in session', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: {
            imageId: 'untagged-image',
            // No tags property
          },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: PushInput = {
        sessionId: 'test-session',
      };

      await expect(pushImageHandler.handler(input, mockContext)).rejects.toThrow(
        'No tagged images found in session',
      );
    });

    it('should fail when build result has empty tags array', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: {
            imageId: 'some-image',
            tags: [], // Empty array
          },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: PushInput = {
        sessionId: 'test-session',
      };

      await expect(pushImageHandler.handler(input, mockContext)).rejects.toThrow(
        'No tagged images found in session',
      );
    });

    it('should update session with push results', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['app:v1.2.3'] },
        },
      });

      const updateAtomicMock = jest.fn();
      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      (mockContext.sessionService as jest.Mocked<SessionService>).updateAtomic = updateAtomicMock;

      const pushResult = {
        digest: 'sha256:updated123',
        size: 75 * 1024 * 1024,
        pushTime: 1800,
      };
      typedMockHelper.pushImage.mockResolvedValue(pushResult);

      const input: PushInput = {
        sessionId: 'test-session',
      };

      await pushImageHandler.handler(input, mockContext);

      const mockUpdateFunction2 = expect.any(Function);
      expect(updateAtomicMock).toHaveBeenCalledWith('test-session', mockUpdateFunction2);

      // Verify the updater function works correctly
      const updaterFunction = (
        updateAtomicMock as jest.MockedFunction<SessionService['updateAtomic']>
      ).mock.calls[0][1];
      const updatedSession = updaterFunction(session);

      expect(updatedSession.workflow_state.pushResult).toMatchObject({
        pushed: [{ tag: 'app:v1.2.3', digest: pushResult.digest }],
        registry: 'docker.io',
        timestamp: expect.any(String),
      });
    });
  });

  describe('progress tracking', () => {
    it('should emit progress events when progress emitter is available', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['progress-app:latest'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: PushInput = {
        sessionId: 'test-session',
      };

      await pushImageHandler.handler(input, mockContext);

      const mockProgressEmitter = mockContext.progressEmitter as jest.Mocked<ProgressEmitter>;
      const mockEmit = jest.spyOn(mockProgressEmitter, 'emit');
      expect(mockEmit).toHaveBeenCalledWith({
        sessionId: 'test-session',
        step: 'push_image',
        status: 'in_progress',
        message: 'Pushing 1 images to docker.io',
        progress: 0.5,
      });

      expect(mockEmit).toHaveBeenCalledWith({
        sessionId: 'test-session',
        step: 'push_image',
        status: 'completed',
        message: 'Successfully pushed image to docker.io',
        progress: 1.0,
      });
    });

    it('should emit failure progress when push fails', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['failure-app:latest'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.pushImage.mockRejectedValue(new Error('Push operation timeout'));

      const input: PushInput = {
        sessionId: 'test-session',
      };

      await expect(pushImageHandler.handler(input, mockContext)).rejects.toThrow();

      const mockProgressEmitter = mockContext.progressEmitter as jest.Mocked<ProgressEmitter>;
      const mockEmit = jest.spyOn(mockProgressEmitter, 'emit');
      expect(mockEmit).toHaveBeenCalledWith({
        sessionId: 'test-session',
        step: 'push_image',
        status: 'failed',
        message: 'Image push failed: Push operation timeout',
      });
    });

    it('should handle missing progress emitter gracefully', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['no-progress:latest'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      mockContext.progressEmitter = undefined;

      const input: PushInput = {
        sessionId: 'test-session',
      };

      const result = await pushImageHandler.handler(input, mockContext);
      expect(result.success).toBe(true);
    });
  });

  describe('tag handling variations', () => {
    it('should handle single tag', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['single:v1.0'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: PushInput = {
        sessionId: 'test-session',
      };

      const result = await pushImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(typedMockHelper.pushImage).toHaveBeenCalledWith(
        'single:v1.0',
        'docker.io',
        {},
        mockContext,
      );
    });

    it('should handle semantic version tags', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: {
            tags: ['app:1.2.3', 'app:1.2', 'app:1', 'app:latest'],
          },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: PushInput = {
        sessionId: 'test-session',
      };

      await pushImageHandler.handler(input, mockContext);

      // Should push first tag (simplified for consolidated schema)
      expect(typedMockHelper.pushImage).toHaveBeenCalledWith(
        'app:1.2.3',
        'docker.io',
        {},
        mockContext,
      );
    });

    it('should handle registry-prefixed tags', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['gcr.io/my-project/app:v2.0.0'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: PushInput = {
        sessionId: 'test-session',
        registry: 'gcr.io/my-project',
      };

      await pushImageHandler.handler(input, mockContext);

      expect(typedMockHelper.pushImage).toHaveBeenCalledWith(
        'gcr.io/my-project/app:v2.0.0',
        'gcr.io/my-project',
        {},
        mockContext,
      );
    });
  });

  describe('error scenarios', () => {
    it('should handle network errors during push', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['network-app:latest'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.pushImage.mockRejectedValue(
        new Error('ECONNRESET: Connection reset by peer'),
      );

      const input: PushInput = {
        sessionId: 'test-session',
      };

      await expect(pushImageHandler.handler(input, mockContext)).rejects.toThrow(
        'ECONNRESET: Connection reset by peer',
      );
    });

    it('should handle authentication errors', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['auth-app:latest'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.pushImage.mockRejectedValue(new Error('401 Unauthorized'));

      const input: PushInput = {
        sessionId: 'test-session',
      };

      await expect(pushImageHandler.handler(input, mockContext)).rejects.toThrow(
        '401 Unauthorized',
      );
    });

    it('should handle quota exceeded errors', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['quota-app:latest'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.pushImage.mockRejectedValue(
        new Error('429 Too Many Requests: quota exceeded'),
      );

      const input: PushInput = {
        sessionId: 'test-session',
      };

      await expect(pushImageHandler.handler(input, mockContext)).rejects.toThrow(
        '429 Too Many Requests: quota exceeded',
      );
    });

    it('should handle invalid registry URLs', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['invalid-registry:latest'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      typedMockHelper.pushImage.mockRejectedValue(new Error('Invalid registry URL'));

      const input: PushInput = {
        sessionId: 'test-session',
        registry: 'invalid-registry-url',
      };

      await expect(pushImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Invalid registry URL',
      );
    });
  });

  describe('logging and monitoring', () => {
    it('should log push start and completion', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['logged-app:latest'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: PushInput = {
        sessionId: 'test-session',
      };

      await pushImageHandler.handler(input, mockContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { sessionId: 'test-session', registry: undefined },
        'Starting image push',
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          tag: 'logged-app:latest',
          registry: 'docker.io',
        },
        'Image push completed',
      );
    });

    it('should log errors appropriately', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['error-app:latest'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);
      const error = new Error('Registry connection failed');
      (mockHelper.pushImage as jest.Mock).mockRejectedValue(error);

      const input: PushInput = {
        sessionId: 'test-session',
      };

      await expect(pushImageHandler.handler(input, mockContext)).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith({ error }, 'Image push failed');
    });
  });

  describe('tool descriptor properties', () => {
    it('should have correct tool metadata', () => {
      expect(pushImageHandler.name).toBe('push_image');
      expect(pushImageHandler.description).toBe('Push Docker images to container registry');
      expect(pushImageHandler.category).toBe('workflow');
      expect(pushImageHandler.inputSchema).toBeDefined();
      expect(pushImageHandler.outputSchema).toBeDefined();
    });

    it('should have correct chain hint for next tool', () => {
      expect(pushImageHandler.chainHint).toMatchObject({
        nextTool: 'generate_k8s_manifests',
        reason: 'Generate Kubernetes manifests for deployment',
        paramMapper: expect.any(Function),
      });
    });

    it('should provide correct parameter mapping for chaining', () => {
      const output: PushOutput = {
        success: true,
        sessionId: 'test-session',
        registry: 'gcr.io/my-project',
      };

      const paramMapper = pushImageHandler.chainHint!.paramMapper as (
        output: PushOutput,
      ) => unknown;
      const mappedParams = paramMapper(output);
      expect(mappedParams).toEqual({
        registry: 'gcr.io/my-project',
      });
    });
  });

  describe('input validation', () => {
    it('should validate required sessionId', () => {
      const input = {} as PushInput; // Missing sessionId

      // Input validation should be handled by the schema
      expect(() => pushImageHandler.inputSchema.parse(input)).toThrow();
    });

    it('should accept optional registry parameter', () => {
      const input: PushInput = {
        sessionId: 'test-session',
        registry: 'custom-registry.com',
      };

      const parsed = pushImageHandler.inputSchema.parse(input);
      expect(parsed.sessionId).toBe('test-session');
      expect(parsed.registry).toBe('custom-registry.com');
    });
  });

  describe('output validation', () => {
    it('should produce schema-compliant output', async () => {
      const session = createMockSession({
        workflow_state: {
          build_result: { tags: ['compliant-app:latest'] },
        },
      });

      (mockContext.sessionService as jest.Mocked<SessionService>).get = jest
        .fn<SessionService['get']>()
        .mockResolvedValue(session);

      const input: PushInput = {
        sessionId: 'test-session',
      };

      const result = await pushImageHandler.handler(input, mockContext);

      // Validate output against schema
      expect(() => pushImageHandler.outputSchema.parse(result)).not.toThrow();
      expect(result).toMatchObject({
        success: true,
        sessionId: 'test-session',
        registry: expect.any(String),
      });
    });
  });
});
