/**
 * Unit Tests: Image Tagging Tool
 * Tests the tag image tool functionality with mock Docker client
 * Following analyze-repo test structure and comprehensive coverage requirements
 */

import { jest } from '@jest/globals';
import { tagImage, type TagImageConfig } from '../../../src/tools/tag-image/tool';
import { createMockLogger, createSuccessResult, createFailureResult } from '../../__support__/utilities/mock-infrastructure';

// Mock lib modules following analyze-repo pattern
const mockSessionManager = {
  create: jest.fn().mockResolvedValue({
    "sessionId": "test-session-123",
    "workflow_state": {},
    "metadata": {},
    "completed_steps": [],
    "errors": {},
    "current_step": null,
    "createdAt": "2025-09-08T11:12:40.362Z",
    "updatedAt": "2025-09-08T11:12:40.362Z"
  }),
  get: jest.fn(),
  update: jest.fn(),
};

const mockDockerClient = {
  tagImage: jest.fn(),
};

const mockTimer = {
  end: jest.fn(),
  error: jest.fn(),
};

jest.mock('@lib/session', () => ({
  createSessionManager: jest.fn(() => mockSessionManager),
}));

jest.mock('@lib/docker', () => ({
  createDockerClient: jest.fn(() => mockDockerClient),
}));

jest.mock('@lib/logger', () => ({
  createTimer: jest.fn(() => mockTimer),
}));

describe('tagImage', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let config: TagImageConfig;

  beforeEach(() => {
    mockLogger = createMockLogger();
    config = {
      sessionId: 'test-session-123',
      tag: 'myapp:v1.0',
    };

    // Reset all mocks
    jest.clearAllMocks();
    mockSessionManager.update.mockResolvedValue(true);
  });

  describe('Successful Tagging Operations', () => {
    beforeEach(() => {
      // Session with built image
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            imageId: 'sha256:mock-image-id',
            context: '/test/repo',
          },
        },
        build_result: {
          imageId: 'sha256:mock-image-id',
          context: '/test/repo',
        },
        repo_path: '/test/repo',
      });

      // Default successful tag result
      mockDockerClient.tagImage.mockResolvedValue(createSuccessResult({}));
    });

    it('should successfully tag image with repository and tag', async () => {
      const result = await tagImage(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.sessionId).toBe('test-session-123');
        expect(result.value.tags).toEqual(['myapp:v1.0']);
        expect(result.value.imageId).toBe('sha256:mock-image-id');
      }

      // Verify Docker client was called with correct parameters
      expect(mockDockerClient.tagImage).toHaveBeenCalledWith('sha256:mock-image-id', 'myapp', 'v1.0');
      
      // Verify session was updated with tag information
      expect(mockSessionManager.update).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          workflow_state: expect.objectContaining({
            build_result: expect.objectContaining({
              imageId: 'sha256:mock-image-id',
              tags: ['myapp:v1.0'],
            }),
          }),
        })
      );

      // Verify timer was used correctly
      expect(mockTimer.end).toHaveBeenCalledWith({
        source: 'sha256:mock-image-id',
        tag: 'myapp:v1.0',
      });
    });

    it('should handle tag without explicit version (defaults to latest)', async () => {
      config.tag = 'myapp';

      const result = await tagImage(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tags).toEqual(['myapp']);
      }

      // Should tag with 'latest' when no tag specified
      expect(mockDockerClient.tagImage).toHaveBeenCalledWith('sha256:mock-image-id', 'myapp', 'latest');
    });

    it('should handle complex repository names', async () => {
      const testCases = [
        { input: 'docker.io/library/myapp:v1.0', expectedRepo: 'docker.io/library/myapp', expectedTag: 'v1.0' },
        { input: 'ghcr.io/myorg/myapp:main', expectedRepo: 'ghcr.io/myorg/myapp', expectedTag: 'main' },
        { input: 'localhost/myapp:dev', expectedRepo: 'localhost/myapp', expectedTag: 'dev' },
        { input: 'my-registry.com/path/to/app:stable', expectedRepo: 'my-registry.com/path/to/app', expectedTag: 'stable' },
      ];

      for (const testCase of testCases) {
        config.tag = testCase.input;

        const result = await tagImage(config, mockLogger);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.tags).toEqual([testCase.input]);
        }

        expect(mockDockerClient.tagImage).toHaveBeenCalledWith(
          'sha256:mock-image-id',
          testCase.expectedRepo,
          testCase.expectedTag
        );

        // Reset mocks for next iteration
        jest.clearAllMocks();
        mockSessionManager.update.mockResolvedValue(true);
        mockDockerClient.tagImage.mockResolvedValue(createSuccessResult({}));
      }
    });

    it('should preserve existing build result data when updating session', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            imageId: 'sha256:mock-image-id',
            context: '/test/repo',
            dockerfile: 'Dockerfile',
            size: 1024000,
          },
        },
        build_result: {
          imageId: 'sha256:mock-image-id',
          context: '/test/repo',
          dockerfile: 'Dockerfile',
          size: 1024000,
        },
        repo_path: '/test/repo',
      });

      const result = await tagImage(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockSessionManager.update).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          workflow_state: expect.objectContaining({
            build_result: expect.objectContaining({
              imageId: 'sha256:mock-image-id',
              context: '/test/repo',
              dockerfile: 'Dockerfile',
              size: 1024000,
              tags: ['myapp:v1.0'], // New tags added
            }),
          }),
        })
      );
    });
  });

  describe('Tag Format Validation', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            imageId: 'sha256:mock-image-id',
          },
        },
        build_result: {
          imageId: 'sha256:mock-image-id',
        },
        repo_path: '/test/repo',
      });

      mockDockerClient.tagImage.mockResolvedValue(createSuccessResult({}));
    });

    it('should handle various valid tag formats', async () => {
      const validTags = [
        'myapp:v1.0.0',
        'myapp:latest',
        'myapp:main',
        'myapp:feature-branch',
        'myapp:build-123',
        'my-app:v2.0',
        'my_app:stable',
        'registry.com/myapp:v1.0',
      ];

      for (const tag of validTags) {
        config.tag = tag;
        const result = await tagImage(config, mockLogger);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.tags).toEqual([tag]);
        }

        // Reset mocks for next iteration
        jest.clearAllMocks();
        mockSessionManager.update.mockResolvedValue(true);
        mockDockerClient.tagImage.mockResolvedValue(createSuccessResult({}));
      }
    });

    it('should correctly parse repository and tag components', async () => {
      const testCases = [
        { tag: 'simple:v1', expectedRepo: 'simple', expectedTag: 'v1' },
        { tag: 'multi/level/repo:tag', expectedRepo: 'multi/level/repo', expectedTag: 'tag' },
        { tag: 'single', expectedRepo: 'single', expectedTag: 'latest' },
        { tag: 'with-dash:with-dash-tag', expectedRepo: 'with-dash', expectedTag: 'with-dash-tag' },
        { tag: 'with_underscore:with_underscore_tag', expectedRepo: 'with_underscore', expectedTag: 'with_underscore_tag' },
      ];

      for (const testCase of testCases) {
        config.tag = testCase.tag;
        
        const result = await tagImage(config, mockLogger);

        expect(result.ok).toBe(true);
        expect(mockDockerClient.tagImage).toHaveBeenCalledWith(
          'sha256:mock-image-id',
          testCase.expectedRepo,
          testCase.expectedTag
        );

        // Reset mocks for next iteration
        jest.clearAllMocks();
        mockSessionManager.update.mockResolvedValue(true);
        mockDockerClient.tagImage.mockResolvedValue(createSuccessResult({}));
      }
    });
  });

  describe('Error Handling', () => {
    it('should auto-create session when not found', async () => {
      mockSessionManager.get.mockResolvedValue(null);
      mockSessionManager.create.mockResolvedValue({
      "sessionId": "test-session-123",
      "workflow_state": {},
      "metadata": {},
      "completed_steps": [],
      "errors": {},
      "current_step": null,
      "createdAt": "2025-09-08T11:12:40.362Z",
      "updatedAt": "2025-09-08T11:12:40.362Z"
});

      const result = await tagImage(config, mockLogger);

      expect(mockSessionManager.get).toHaveBeenCalledWith('test-session-123');
      expect(mockSessionManager.create).toHaveBeenCalledWith('test-session-123');
    });

    it('should return error when no build result exists', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {},
        repo_path: '/test/repo',
      });

      const result = await tagImage(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('No built image found in session - run build_image first');
      }
    });

    it('should return error when build result has no imageId', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            context: '/test/repo',
            // No imageId
          },
        },
        build_result: {
          context: '/test/repo',
          // No imageId
        },
        repo_path: '/test/repo',
      });

      const result = await tagImage(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('No built image found in session - run build_image first');
      }
    });

    it('should return error for invalid tag format', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            imageId: 'sha256:mock-image-id',
          },
        },
        build_result: {
          imageId: 'sha256:mock-image-id',
        },
        repo_path: '/test/repo',
      });

      config.tag = ''; // Empty tag

      const result = await tagImage(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Invalid tag format');
      }
    });

    it('should handle Docker client tagging failures', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            imageId: 'sha256:mock-image-id',
          },
        },
        build_result: {
          imageId: 'sha256:mock-image-id',
        },
        repo_path: '/test/repo',
      });

      mockDockerClient.tagImage.mockResolvedValue(
        createFailureResult('Failed to create tag: image not found')
      );

      const result = await tagImage(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Failed to tag image: Failed to create tag: image not found');
      }
    });

    it('should handle Docker client tagging errors without error message', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            imageId: 'sha256:mock-image-id',
          },
        },
        build_result: {
          imageId: 'sha256:mock-image-id',
        },
        repo_path: '/test/repo',
      });

      mockDockerClient.tagImage.mockResolvedValue(
        createFailureResult(null as any) // No error message
      );

      const result = await tagImage(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Failed to tag image: Unknown error');
      }
    });

    it('should handle exceptions during tagging process', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            imageId: 'sha256:mock-image-id',
          },
        },
        build_result: {
          imageId: 'sha256:mock-image-id',
        },
        repo_path: '/test/repo',
      });

      mockDockerClient.tagImage.mockRejectedValue(new Error('Docker daemon not responding'));

      const result = await tagImage(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Docker daemon not responding');
      }

      expect(mockTimer.end).toHaveBeenCalledWith({ error: expect.any(Error) });
    });

    it('should handle session update failures', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            imageId: 'sha256:mock-image-id',
          },
        },
        build_result: {
          imageId: 'sha256:mock-image-id',
        },
        repo_path: '/test/repo',
      });

      mockDockerClient.tagImage.mockResolvedValue(createSuccessResult({}));
      mockSessionManager.update.mockRejectedValue(new Error('Failed to update session state'));

      const result = await tagImage(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Failed to update session state');
      }
    });
  });

  describe('Session State Management', () => {
    beforeEach(() => {
      mockDockerClient.tagImage.mockResolvedValue(createSuccessResult({}));
    });

    it('should handle workflow state with existing data', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            imageId: 'sha256:mock-image-id',
            context: '/test/repo',
          },
          completed_steps: ['analyze', 'build'],
          metadata: {
            buildTime: '2023-01-01T12:00:00Z',
          },
        },
        build_result: {
          imageId: 'sha256:mock-image-id',
          context: '/test/repo',
        },
        repo_path: '/test/repo',
      });

      const result = await tagImage(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockSessionManager.update).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          workflow_state: expect.objectContaining({
            completed_steps: ['analyze', 'build'], // Preserved
            metadata: expect.objectContaining({
              buildTime: '2023-01-01T12:00:00Z', // Preserved
            }),
            build_result: expect.objectContaining({
              imageId: 'sha256:mock-image-id',
              context: '/test/repo', // Preserved
              tags: ['myapp:v1.0'], // Added
            }),
          }),
        })
      );
    });

    it('should handle session with minimal build result', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            imageId: 'sha256:mock-image-id',
          },
        },
        build_result: {
          imageId: 'sha256:mock-image-id',
        },
        repo_path: '/test/repo',
      });

      const result = await tagImage(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockSessionManager.update).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          workflow_state: expect.objectContaining({
            build_result: expect.objectContaining({
              imageId: 'sha256:mock-image-id',
              tags: ['myapp:v1.0'],
            }),
          }),
        })
      );
    });
  });

  describe('Multiple Tagging Scenarios', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            imageId: 'sha256:mock-image-id',
          },
        },
        build_result: {
          imageId: 'sha256:mock-image-id',
        },
        repo_path: '/test/repo',
      });

      mockDockerClient.tagImage.mockResolvedValue(createSuccessResult({}));
    });

    it('should handle tagging with different configurations', async () => {
      const configurations = [
        { sessionId: 'session-1', tag: 'app:v1.0' },
        { sessionId: 'session-2', tag: 'registry.com/app:latest' },
        { sessionId: 'session-3', tag: 'my-app:development' },
      ];

      for (const testConfig of configurations) {
        const result = await tagImage(testConfig, mockLogger);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.sessionId).toBe(testConfig.sessionId);
          expect(result.value.tags).toEqual([testConfig.tag]);
        }

        // Reset mocks for next iteration
        jest.clearAllMocks();
        mockSessionManager.update.mockResolvedValue(true);
        mockDockerClient.tagImage.mockResolvedValue(createSuccessResult({}));
      }
    });

    it('should handle sequential tagging operations on same session', async () => {
      const tags = ['myapp:v1.0', 'myapp:latest', 'myapp:stable'];

      for (const tag of tags) {
        config.tag = tag;
        const result = await tagImage(config, mockLogger);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.tags).toEqual([tag]);
        }

        // Each operation should tag the same image
        expect(mockDockerClient.tagImage).toHaveBeenCalledWith(
          'sha256:mock-image-id',
          expect.any(String),
          expect.any(String)
        );

        // Reset mocks for next iteration
        jest.clearAllMocks();
        mockSessionManager.update.mockResolvedValue(true);
        mockDockerClient.tagImage.mockResolvedValue(createSuccessResult({}));
      }
    });
  });

  describe('Tool Instance', () => {
    it('should provide correctly configured tool instance', async () => {
      const { tagImageTool } = await import('../../../src/tools/tag-image');

      expect(tagImageTool.name).toBe('tag');
      expect(typeof tagImageTool.execute).toBe('function');

      // Verify tool can be executed through the tool instance interface
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            imageId: 'sha256:mock-image-id',
          },
        },
        build_result: {
          imageId: 'sha256:mock-image-id',
        },
        repo_path: '/test/repo',
      });

      mockDockerClient.tagImage.mockResolvedValue(createSuccessResult({}));

      const result = await tagImageTool.execute(config, mockLogger);
      expect(result.ok).toBe(true);
    });
  });
});