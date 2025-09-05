/**
 * Unit tests for tag-image tool
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import tagImageHandler from '../index';
import type { TagImageParams } from '../../schemas';
import type { Session } from '../../../../domain/types/session';
import { createMockToolContext } from '../../__tests__/shared/test-utils';
import { createMockDockerService } from '../../__tests__/shared/docker-mocks';

describe('tag-image tool', () => {
  let mockContext: ReturnType<typeof createMockToolContext>;
  let mockDockerService: ReturnType<typeof createMockDockerService>;
  let mockSession: Session;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock context
    mockContext = createMockToolContext();
    mockDockerService = createMockDockerService();

    // Setup Docker service
    mockContext.dockerService = mockDockerService;

    // Create mock session with build result
    mockSession = {
      id: 'test-session-123',
      project_name: 'test-app',
      metadata: {
        projectName: 'test-app',
      },
      workflow_state: {
        build_result: {
          imageId: 'sha256:abc123def456',
          tags: ['test-app:latest'],
          size: 100000000,
        },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Setup session service mock
    mockContext.sessionService = {
      get: jest.fn().mockResolvedValue(mockSession),
      updateAtomic: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Tool descriptor configuration', () => {
    it('should have correct tool configuration', () => {
      expect(tagImageHandler.name).toBe('tag_image');
      expect(tagImageHandler.description).toContain('Tag Docker image');
      expect(tagImageHandler.category).toBe('workflow');
      expect(tagImageHandler.inputSchema).toBeDefined();
      expect(tagImageHandler.outputSchema).toBeDefined();
      expect(tagImageHandler.handler).toBeInstanceOf(Function);
    });

    it('should have correct chain hint configuration', () => {
      expect(tagImageHandler.chainHint).toBeDefined();
      expect(tagImageHandler.chainHint?.nextTool).toBe('push_image');
      expect(tagImageHandler.chainHint?.reason).toContain('Push tagged images');
      expect(tagImageHandler.chainHint?.paramMapper).toBeInstanceOf(Function);
    });

    it('should map output parameters correctly for chain hint', () => {
      const sampleOutput = {
        success: true,
        sessionId: 'test-session-123',
        tags: ['test-app:v1.0.0'],
      };

      const mapped = tagImageHandler.chainHint?.paramMapper?.(sampleOutput);
      expect(mapped).toEqual({
        sessionId: 'test-session-123',
      });
    });
  });

  describe('Input validation', () => {
    it('should validate required session ID', () => {
      const invalidInput = {} as TagImageParams;

      expect(() => {
        tagImageHandler.inputSchema.parse(invalidInput);
      }).toThrow();
    });

    it('should validate required tag', () => {
      const invalidInput = { sessionId: 'test-session-123' } as TagImageParams;

      expect(() => {
        tagImageHandler.inputSchema.parse(invalidInput);
      }).toThrow();
    });

    it('should accept valid input with session ID and tag', () => {
      const validInput: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      const parsed = tagImageHandler.inputSchema.parse(validInput);
      expect(parsed).toEqual(validInput);
    });

    it('should validate tag format', () => {
      const validInput: TagImageParams = {
        sessionId: 'test-session-123',
        tag: '',
      };

      expect(() => {
        tagImageHandler.inputSchema.parse(validInput);
      }).toThrow();
    });
  });

  describe('Session validation', () => {
    it('should fail when session service is not available', async () => {
      mockContext.sessionService = undefined;

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      await expect(tagImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Session service not available',
      );
    });

    it('should fail when session is not found', async () => {
      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(null),
        updateAtomic: jest.fn(),
      };

      const input: TagImageParams = {
        sessionId: 'non-existent-session',
        tag: 'test-app:v1.0.0',
      };

      await expect(tagImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Session not found',
      );
    });

    it('should fail when no build result is available', async () => {
      const sessionWithoutBuild: Session = {
        ...mockSession,
        workflow_state: {},
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(sessionWithoutBuild),
        updateAtomic: jest.fn(),
      };

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      await expect(tagImageHandler.handler(input, mockContext)).rejects.toThrow(
        'No built image found in session',
      );
    });

    it('should fail when build result has no image ID', async () => {
      const sessionWithoutImageId: Session = {
        ...mockSession,
        workflow_state: {
          build_result: {
            tags: ['test-app:latest'],
            size: 100000000,
          },
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(sessionWithoutImageId),
        updateAtomic: jest.fn(),
      };

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      await expect(tagImageHandler.handler(input, mockContext)).rejects.toThrow(
        'No built image found in session',
      );
    });
  });

  describe('Docker tagging execution', () => {
    it('should successfully tag image using Docker service', async () => {
      // Mock successful tag operation
      mockDockerService.tag.mockResolvedValue({
        success: true,
      });

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      const result = await tagImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session-123');
      expect(result.tags).toEqual(['test-app:v1.0.0']);

      expect(mockDockerService.tag).toHaveBeenCalledWith('sha256:abc123def456', 'test-app:v1.0.0');
    });

    it('should handle various tag formats', async () => {
      const tagFormats = [
        'test-app:v1.0.0',
        'registry.example.com/test-app:latest',
        'localhost:5000/test-app:dev',
        'test-app:feature-branch',
        'ghcr.io/org/test-app:pr-123',
      ];

      for (const tag of tagFormats) {
        // Reset mocks for each iteration
        jest.clearAllMocks();
        mockContext.sessionService = {
          get: jest.fn().mockResolvedValue(mockSession),
          updateAtomic: jest.fn().mockResolvedValue(undefined),
        };
        mockDockerService.tag.mockResolvedValue({ success: true });

        const input: TagImageParams = {
          sessionId: 'test-session-123',
          tag,
        };

        const result = await tagImageHandler.handler(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.tags).toEqual([tag]);
        expect(mockDockerService.tag).toHaveBeenCalledWith('sha256:abc123def456', tag);
      }
    });

    it('should fall back to mock when Docker service unavailable', async () => {
      mockContext.dockerService = undefined;

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      const result = await tagImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        'Docker service not available - simulating tag operation',
      );
    });

    it('should fall back to mock when Docker service has no tag method', async () => {
      // Remove tag method from Docker service
      const dockerServiceWithoutTag = {
        build: jest.fn(),
        scan: jest.fn(),
        push: jest.fn(),
        // No tag method
      };
      mockContext.dockerService = dockerServiceWithoutTag;

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      const result = await tagImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        'Docker service not available - simulating tag operation',
      );
    });
  });

  describe('Tag error handling', () => {
    it('should handle Docker tag service failures', async () => {
      mockDockerService.tag.mockResolvedValue({
        success: false,
      });

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      await expect(tagImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Failed to tag image',
      );

      expect(mockContext.logger.error).toHaveBeenCalled();
    });

    it('should handle tag service exceptions', async () => {
      mockDockerService.tag.mockRejectedValue(new Error('Docker daemon unavailable'));

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      await expect(tagImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Docker daemon unavailable',
      );

      expect(mockContext.logger.error).toHaveBeenCalled();
    });

    it('should handle session update failures', async () => {
      mockDockerService.tag.mockResolvedValue({ success: true });
      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(mockSession),
        updateAtomic: jest.fn().mockRejectedValue(new Error('Session update failed')),
      };

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      await expect(tagImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Session update failed',
      );
    });

    it('should handle malformed error objects gracefully', async () => {
      mockDockerService.tag.mockRejectedValue('String error');

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      await expect(tagImageHandler.handler(input, mockContext)).rejects.toThrow('String error');
    });
  });

  describe('Session updates', () => {
    it('should update session with tag information', async () => {
      mockDockerService.tag.mockResolvedValue({ success: true });

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      const _result = await tagImageHandler.handler(input, mockContext);

      const sessionService = mockContext.sessionService as any;
      const updateAtomicMock = sessionService.updateAtomic;
      expect(updateAtomicMock).toHaveBeenCalledWith('test-session-123', expect.any(Function));

      // Verify the session update includes updated tags
      const mockCalls = updateAtomicMock.mock.calls;
      const updateFunction = mockCalls[0]![1] as (session: any) => any;
      const updatedSession = updateFunction(mockSession);

      expect(updatedSession.workflow_state.build_result.tags).toEqual(['test-app:v1.0.0']);
    });

    it('should preserve other build result properties during update', async () => {
      mockDockerService.tag.mockResolvedValue({ success: true });

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v2.0.0',
      };

      await tagImageHandler.handler(input, mockContext);

      const sessionService2 = mockContext.sessionService as any;
      const updateAtomicMock2 = sessionService2.updateAtomic;
      const mockCalls2 = updateAtomicMock2.mock.calls;
      const updateFunction = mockCalls2[0]![1] as (session: any) => any;
      const updatedSession = updateFunction(mockSession);

      const buildResult = updatedSession.workflow_state.build_result;
      expect(buildResult.imageId).toBe('sha256:abc123def456');
      expect(buildResult.size).toBe(100000000);
      expect(buildResult.tags).toEqual(['test-app:v2.0.0']);
    });
  });

  describe('Tag validation', () => {
    it('should handle semantic version tags', async () => {
      const semanticVersions = ['v1.0.0', 'v1.2.3-alpha', 'v2.0.0-beta.1', 'v1.0.0-rc.1+build.123'];

      for (const version of semanticVersions) {
        // Reset mocks for each iteration
        jest.clearAllMocks();
        mockContext.sessionService = {
          get: jest.fn().mockResolvedValue(mockSession),
          updateAtomic: jest.fn().mockResolvedValue(undefined),
        };
        mockDockerService.tag.mockResolvedValue({ success: true });

        const input: TagImageParams = {
          sessionId: 'test-session-123',
          tag: `test-app:${version}`,
        };

        const result = await tagImageHandler.handler(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.tags).toEqual([`test-app:${version}`]);
      }
    });

    it('should handle registry-prefixed tags', async () => {
      const registryTags = [
        'docker.io/library/test-app:latest',
        'gcr.io/project/test-app:v1.0.0',
        'registry.gitlab.com/group/test-app:main',
        'localhost:5000/test-app:dev',
      ];

      for (const tag of registryTags) {
        // Reset mocks for each iteration
        jest.clearAllMocks();
        mockContext.sessionService = {
          get: jest.fn().mockResolvedValue(mockSession),
          updateAtomic: jest.fn().mockResolvedValue(undefined),
        };
        mockDockerService.tag.mockResolvedValue({ success: true });

        const input: TagImageParams = {
          sessionId: 'test-session-123',
          tag,
        };

        const result = await tagImageHandler.handler(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.tags).toEqual([tag]);
      }
    });

    it('should handle special characters in tags', async () => {
      const specialTags = [
        'test-app:feature_branch',
        'test-app:pr-123',
        'test-app:build.456',
        'test-app:sha-abc123def',
      ];

      for (const tag of specialTags) {
        // Reset mocks for each iteration
        jest.clearAllMocks();
        mockContext.sessionService = {
          get: jest.fn().mockResolvedValue(mockSession),
          updateAtomic: jest.fn().mockResolvedValue(undefined),
        };
        mockDockerService.tag.mockResolvedValue({ success: true });

        const input: TagImageParams = {
          sessionId: 'test-session-123',
          tag,
        };

        const result = await tagImageHandler.handler(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.tags).toEqual([tag]);
      }
    });
  });

  describe('Integration with build workflow', () => {
    it('should work with different build result formats', async () => {
      const buildResults = [
        {
          imageId: 'sha256:123abc',
          tags: ['old-tag:latest'],
          size: 50000000,
        },
        {
          imageId: 'image-id-without-sha',
          tags: [],
          size: 200000000,
          layers: 10,
        },
        {
          imageId: 'sha256:defghi',
          tags: ['multi:tag1', 'multi:tag2'],
          size: 150000000,
          buildTime: 30000,
        },
      ];

      for (const buildResult of buildResults) {
        // Reset mocks and setup session with different build result
        jest.clearAllMocks();

        const sessionWithBuild: Session = {
          ...mockSession,
          workflow_state: {
            build_result: buildResult,
          },
        };

        mockContext.sessionService = {
          get: jest.fn().mockResolvedValue(sessionWithBuild),
          updateAtomic: jest.fn().mockResolvedValue(undefined),
        };
        mockDockerService.tag.mockResolvedValue({ success: true });

        const input: TagImageParams = {
          sessionId: 'test-session-123',
          tag: 'new-tag:v1.0.0',
        };

        const result = await tagImageHandler.handler(input, mockContext);

        expect(result.success).toBe(true);
        expect(mockDockerService.tag).toHaveBeenCalledWith(buildResult.imageId, 'new-tag:v1.0.0');
      }
    });

    it('should handle missing optional build result properties', async () => {
      const minimalBuildResult = {
        imageId: 'sha256:minimal',
        // Missing tags, size, etc.
      };

      const sessionWithMinimalBuild: Session = {
        ...mockSession,
        workflow_state: {
          build_result: minimalBuildResult,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(sessionWithMinimalBuild),
        updateAtomic: jest.fn().mockResolvedValue(undefined),
      };
      mockDockerService.tag.mockResolvedValue({ success: true });

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      const result = await tagImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
    });
  });

  describe('Output validation', () => {
    it('should produce output that matches the schema', async () => {
      mockDockerService.tag.mockResolvedValue({ success: true });

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      const result = await tagImageHandler.handler(input, mockContext);

      // Validate against output schema
      expect(() => tagImageHandler.outputSchema.parse(result)).not.toThrow();
    });

    it('should include all required fields', async () => {
      mockDockerService.tag.mockResolvedValue({ success: true });

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      const result = await tagImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session-123');

      // Optional fields
      if (result.tags !== undefined) {
        expect(result.tags).toBeInstanceOf(Array);
        expect(result.tags).toHaveLength(1);
        expect(result.tags[0]).toBe('test-app:v1.0.0');
      }
    });

    it('should handle optional fields correctly', async () => {
      mockDockerService.tag.mockResolvedValue({ success: true });

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      const result = await tagImageHandler.handler(input, mockContext);

      // tags field should be present and populated
      expect(result.tags).toBeDefined();
      expect(result.tags).toEqual(['test-app:v1.0.0']);
    });
  });

  describe('Performance considerations', () => {
    it('should complete tagging within reasonable time', async () => {
      mockDockerService.tag.mockResolvedValue({ success: true });

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      const startTime = Date.now();
      const result = await tagImageHandler.handler(input, mockContext);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should handle concurrent tagging operations', async () => {
      mockDockerService.tag.mockResolvedValue({ success: true });

      const promises = Array.from({ length: 5 }, (_, i) => {
        const input: TagImageParams = {
          sessionId: `test-session-${i}`,
          tag: `test-app:v1.0.${i}`,
        };

        // Each needs its own session mock
        const sessionMock = {
          ...mockSession,
          id: `test-session-${i}`,
        };

        const contextMock = {
          ...mockContext,
          sessionService: {
            get: jest.fn().mockResolvedValue(sessionMock),
            updateAtomic: jest.fn().mockResolvedValue(undefined),
          },
        };

        return tagImageHandler.handler(input, contextMock);
      });

      const results = await Promise.all(promises);

      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.tags).toEqual([`test-app:v1.0.${i}`]);
      });
    });
  });

  describe('Logging', () => {
    it('should log tagging operations', async () => {
      mockDockerService.tag.mockResolvedValue({ success: true });

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      const result = await tagImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        { sessionId: 'test-session-123', tag: 'test-app:v1.0.0' },
        'Starting image tagging',
      );

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        { source: 'sha256:abc123def456', tag: 'test-app:v1.0.0' },
        'Image tagging completed',
      );
    });

    it('should log errors appropriately', async () => {
      mockDockerService.tag.mockRejectedValue(new Error('Test tag error'));

      const input: TagImageParams = {
        sessionId: 'test-session-123',
        tag: 'test-app:v1.0.0',
      };

      try {
        await tagImageHandler.handler(input, mockContext);
      } catch {
        expect(mockContext.logger.error).toHaveBeenCalledWith(
          { error: expect.any(Error) },
          'Image tagging failed',
        );
      }
    });
  });
});
