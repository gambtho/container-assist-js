import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createDockerClient } from '../../../src/lib/docker';
import type { Logger } from 'pino';
import type { DockerBuildOptions } from '../../../src/types/docker';

// Mock dockerode
jest.mock('dockerode');
import Docker from 'dockerode';
const MockDocker = Docker as jest.MockedClass<typeof Docker>;

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => mockLogger)
} as any;

describe('Docker Client', () => {
  let dockerClient: any;
  let mockDockerInstance: any;
  let mockImage: any;
  let mockModem: any;

  beforeEach(() => {
    mockImage = {
      inspect: jest.fn(),
      tag: jest.fn(),
      push: jest.fn()
    };

    mockModem = {
      followProgress: jest.fn()
    };

    mockDockerInstance = {
      buildImage: jest.fn(),
      getImage: jest.fn(() => mockImage),
      modem: mockModem
    };

    MockDocker.mockImplementation(() => mockDockerInstance);
    dockerClient = createDockerClient(mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('buildImage', () => {
    it('should successfully build a Docker image', async () => {
      const buildOptions: DockerBuildOptions = {
        context: './test-app',
        dockerfile: 'Dockerfile',
        tags: ['test-image:latest'],
        buildArgs: { NODE_ENV: 'production' }
      };

      const mockStream = {};
      const mockBuildResult = [
        { stream: 'Step 1/5 : FROM node:16' },
        { aux: { ID: 'sha256:abc123def456' } }
      ];

      mockDockerInstance.buildImage.mockResolvedValue(mockStream);
      mockModem.followProgress.mockImplementation((stream, callback, onProgress) => {
        // Simulate progress events
        onProgress({ stream: 'Building...' });
        onProgress({ stream: 'Step 1/5 : FROM node:16' });
        
        // Complete the build
        callback(null, mockBuildResult);
      });

      const result = await dockerClient.buildImage(buildOptions);

      expect(result.ok).toBe(true);
      expect(result.value.imageId).toBe('sha256:abc123def456');
      expect(result.value.tags).toEqual(['test-image:latest']);
      expect(result.value.success).toBe(true);

      expect(mockDockerInstance.buildImage).toHaveBeenCalledWith('./test-app', {
        t: 'test-image:latest',
        dockerfile: 'Dockerfile',
        buildargs: { NODE_ENV: 'production' }
      });
    });

    it('should handle array of tags correctly', async () => {
      const buildOptions: DockerBuildOptions = {
        context: './test-app',
        tags: ['test-image:latest', 'test-image:v1.0.0']
      };

      const mockStream = {};
      const mockBuildResult = [{ aux: { ID: 'sha256:abc123def456' } }];

      mockDockerInstance.buildImage.mockResolvedValue(mockStream);
      mockModem.followProgress.mockImplementation((stream, callback) => {
        callback(null, mockBuildResult);
      });

      const result = await dockerClient.buildImage(buildOptions);

      expect(result.ok).toBe(true);
      expect(mockDockerInstance.buildImage).toHaveBeenCalledWith('./test-app', {
        t: 'test-image:latest', // Should use first tag
        dockerfile: undefined,
        buildargs: undefined
      });
    });

    it('should handle string tag correctly', async () => {
      const buildOptions: DockerBuildOptions = {
        context: './test-app',
        tags: 'test-image:latest'
      };

      const mockStream = {};
      const mockBuildResult = [{ aux: { ID: 'sha256:abc123def456' } }];

      mockDockerInstance.buildImage.mockResolvedValue(mockStream);
      mockModem.followProgress.mockImplementation((stream, callback) => {
        callback(null, mockBuildResult);
      });

      const result = await dockerClient.buildImage(buildOptions);

      expect(result.ok).toBe(true);
      expect(mockDockerInstance.buildImage).toHaveBeenCalledWith('./test-app', {
        t: 'test-image:latest',
        dockerfile: undefined,
        buildargs: undefined
      });
    });

    it('should handle build failures', async () => {
      const buildOptions: DockerBuildOptions = {
        context: './test-app',
        tags: ['test-image:latest']
      };

      const buildError = new Error('Build failed: syntax error in Dockerfile');
      mockDockerInstance.buildImage.mockRejectedValue(buildError);

      const result = await dockerClient.buildImage(buildOptions);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Build failed: Build failed: syntax error in Dockerfile');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Build failed'),
          options: buildOptions
        }),
        'Docker build failed'
      );
    });

    it('should handle follow progress errors', async () => {
      const buildOptions: DockerBuildOptions = {
        context: './test-app',
        tags: ['test-image:latest']
      };

      const mockStream = {};
      const progressError = new Error('Progress tracking failed');

      mockDockerInstance.buildImage.mockResolvedValue(mockStream);
      mockModem.followProgress.mockImplementation((stream, callback) => {
        callback(progressError, null);
      });

      const result = await dockerClient.buildImage(buildOptions);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Build failed: Progress tracking failed');
    });

    it('should handle missing image ID in build result', async () => {
      const buildOptions: DockerBuildOptions = {
        context: './test-app',
        tags: ['test-image:latest']
      };

      const mockStream = {};
      const mockBuildResult = [
        { stream: 'Building...' },
        { stream: 'Completed' }
      ];

      mockDockerInstance.buildImage.mockResolvedValue(mockStream);
      mockModem.followProgress.mockImplementation((stream, callback) => {
        callback(null, mockBuildResult);
      });

      const result = await dockerClient.buildImage(buildOptions);

      expect(result.ok).toBe(true);
      expect(result.value.imageId).toBe(''); // Should handle missing ID gracefully
      expect(result.value.success).toBe(true);
    });
  });

  describe('getImage', () => {
    it('should successfully get image information', async () => {
      const mockInspectResult = {
        Id: 'sha256:abc123def456',
        RepoTags: ['test-image:latest'],
        Size: 1024000,
        Created: '2023-01-01T00:00:00Z',
        Config: {
          Labels: {
            'app.version': '1.0.0',
            'app.name': 'test-app'
          }
        }
      };

      mockImage.inspect.mockResolvedValue(mockInspectResult);

      const result = await dockerClient.getImage('sha256:abc123def456');

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({
        Id: 'sha256:abc123def456',
        repository: 'test-image',
        tag: 'latest',
        size: 1024000,
        created: '2023-01-01T00:00:00Z',
        labels: {
          'app.version': '1.0.0',
          'app.name': 'test-app'
        }
      });

      expect(mockDockerInstance.getImage).toHaveBeenCalledWith('sha256:abc123def456');
      expect(mockImage.inspect).toHaveBeenCalled();
    });

    it('should handle image with no repo tags', async () => {
      const mockInspectResult = {
        Id: 'sha256:abc123def456',
        RepoTags: null,
        Size: 1024000,
        Created: '2023-01-01T00:00:00Z',
        Config: {}
      };

      mockImage.inspect.mockResolvedValue(mockInspectResult);

      const result = await dockerClient.getImage('sha256:abc123def456');

      expect(result.ok).toBe(true);
      expect(result.value.repository).toBe('');
      expect(result.value.tag).toBe('latest');
      expect(result.value.labels).toEqual({});
    });

    it('should handle image with empty repo tags', async () => {
      const mockInspectResult = {
        Id: 'sha256:abc123def456',
        RepoTags: [],
        Size: 1024000,
        Created: '2023-01-01T00:00:00Z',
        Config: {
          Labels: null
        }
      };

      mockImage.inspect.mockResolvedValue(mockInspectResult);

      const result = await dockerClient.getImage('sha256:abc123def456');

      expect(result.ok).toBe(true);
      expect(result.value.repository).toBe('');
      expect(result.value.tag).toBe('latest');
      expect(result.value.labels).toEqual({});
    });

    it('should handle image inspect failures', async () => {
      const inspectError = new Error('Image not found');
      mockImage.inspect.mockRejectedValue(inspectError);

      const result = await dockerClient.getImage('nonexistent-image');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Failed to get image: Image not found');
    });
  });

  describe('tagImage', () => {
    it('should successfully tag an image', async () => {
      mockImage.tag.mockResolvedValue(undefined);

      const result = await dockerClient.tagImage('sha256:abc123def456', 'my-registry/test-image', 'v1.0.0');

      expect(result.ok).toBe(true);
      expect(result.value).toBeUndefined();

      expect(mockDockerInstance.getImage).toHaveBeenCalledWith('sha256:abc123def456');
      expect(mockImage.tag).toHaveBeenCalledWith({
        repo: 'my-registry/test-image',
        tag: 'v1.0.0'
      });

      expect(mockLogger.info).toHaveBeenCalledWith({
        imageId: 'sha256:abc123def456',
        repository: 'my-registry/test-image',
        tag: 'v1.0.0'
      }, 'Image tagged successfully');
    });

    it('should handle tagging failures', async () => {
      const tagError = new Error('Tag operation failed');
      mockImage.tag.mockRejectedValue(tagError);

      const result = await dockerClient.tagImage('sha256:abc123def456', 'my-registry/test-image', 'v1.0.0');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Failed to tag image: Tag operation failed');
    });
  });

  describe('pushImage', () => {
    it('should successfully push an image with digest', async () => {
      const mockStream = {};
      const mockDigest = 'sha256:fedcba098765';

      mockImage.push.mockResolvedValue(mockStream);
      mockModem.followProgress.mockImplementation((stream, callback, onProgress) => {
        // Simulate progress events with digest
        onProgress({
          status: 'Pushing',
          aux: {
            Digest: mockDigest,
            Size: 2048000
          }
        });
        
        callback(null);
      });

      const result = await dockerClient.pushImage('my-registry/test-image', 'v1.0.0');

      expect(result.ok).toBe(true);
      expect(result.value.digest).toBe(mockDigest);
      expect(result.value.size).toBe(2048000);

      expect(mockDockerInstance.getImage).toHaveBeenCalledWith('my-registry/test-image:v1.0.0');
      expect(mockImage.push).toHaveBeenCalledWith({});

      expect(mockLogger.info).toHaveBeenCalledWith({
        repository: 'my-registry/test-image',
        tag: 'v1.0.0',
        digest: mockDigest
      }, 'Image pushed successfully');
    });

    it('should fall back to image inspection for digest', async () => {
      const mockStream = {};
      const mockImageId = 'sha256:abc123def456';

      mockImage.push.mockResolvedValue(mockStream);
      mockModem.followProgress.mockImplementation((stream, callback, onProgress) => {
        // Simulate progress events without digest
        onProgress({ status: 'Pushing' });
        callback(null);
      });

      // Mock inspect for digest fallback
      const mockInspectResult = {
        Id: mockImageId,
        RepoDigests: [`my-registry/test-image@sha256:fedcba098765`]
      };
      mockImage.inspect.mockResolvedValue(mockInspectResult);

      const result = await dockerClient.pushImage('my-registry/test-image', 'v1.0.0');

      expect(result.ok).toBe(true);
      expect(result.value.digest).toBe('sha256:fedcba098765');
      expect(mockImage.inspect).toHaveBeenCalled();
    });

    it('should generate fallback digest when inspection fails', async () => {
      const mockStream = {};

      mockImage.push.mockResolvedValue(mockStream);
      mockModem.followProgress.mockImplementation((stream, callback, onProgress) => {
        onProgress({ status: 'Pushing' });
        callback(null);
      });

      // Mock inspect failure
      mockImage.inspect.mockRejectedValue(new Error('Inspection failed'));

      const result = await dockerClient.pushImage('my-registry/test-image', 'v1.0.0');

      expect(result.ok).toBe(true);
      expect(result.value.digest).toMatch(/^sha256:[0-9a-f]+$/);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error)
        }),
        'Could not get digest from image inspection'
      );
    });

    it('should handle push failures', async () => {
      const pushError = new Error('Push failed: authentication required');
      mockImage.push.mockRejectedValue(pushError);

      const result = await dockerClient.pushImage('my-registry/test-image', 'v1.0.0');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Failed to push image: Push failed: authentication required');
    });

    it('should handle follow progress errors during push', async () => {
      const mockStream = {};
      const progressError = new Error('Push progress tracking failed');

      mockImage.push.mockResolvedValue(mockStream);
      mockModem.followProgress.mockImplementation((stream, callback) => {
        callback(progressError);
      });

      const result = await dockerClient.pushImage('my-registry/test-image', 'v1.0.0');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Failed to push image: Push progress tracking failed');
    });

    it('should handle successful push without size information', async () => {
      const mockStream = {};
      const mockDigest = 'sha256:fedcba098765';

      mockImage.push.mockResolvedValue(mockStream);
      mockModem.followProgress.mockImplementation((stream, callback, onProgress) => {
        onProgress({
          status: 'Pushing',
          aux: {
            Digest: mockDigest
            // No Size field
          }
        });
        
        callback(null);
      });

      const result = await dockerClient.pushImage('my-registry/test-image', 'v1.0.0');

      expect(result.ok).toBe(true);
      expect(result.value.digest).toBe(mockDigest);
      expect(result.value.size).toBeUndefined();
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle unknown errors gracefully', async () => {
      mockDockerInstance.buildImage.mockRejectedValue('Unknown error');

      const buildOptions: DockerBuildOptions = {
        context: './test-app',
        tags: ['test-image:latest']
      };

      const result = await dockerClient.buildImage(buildOptions);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Unknown error');
    });

    it('should handle null or undefined options', async () => {
      const buildOptions: DockerBuildOptions = {
        context: './test-app',
        tags: ['test-image:latest']
      };

      const mockStream = {};
      const mockBuildResult = [{ aux: { ID: 'sha256:abc123def456' } }];

      mockDockerInstance.buildImage.mockResolvedValue(mockStream);
      mockModem.followProgress.mockImplementation((stream, callback) => {
        callback(null, mockBuildResult);
      });

      const result = await dockerClient.buildImage(buildOptions);

      expect(result.ok).toBe(true);
      expect(mockDockerInstance.buildImage).toHaveBeenCalledWith('./test-app', {
        t: 'test-image:latest',
        dockerfile: undefined,
        buildargs: undefined
      });
    });
  });

  describe('logging', () => {
    it('should log build progress events', async () => {
      const buildOptions: DockerBuildOptions = {
        context: './test-app',
        tags: ['test-image:latest']
      };

      const mockStream = {};
      const mockBuildResult = [{ aux: { ID: 'sha256:abc123def456' } }];

      mockDockerInstance.buildImage.mockResolvedValue(mockStream);
      mockModem.followProgress.mockImplementation((stream, callback, onProgress) => {
        const progressEvent = { stream: 'Step 1/5 : FROM node:16' };
        onProgress(progressEvent);
        callback(null, mockBuildResult);
      });

      await dockerClient.buildImage(buildOptions);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { stream: 'Step 1/5 : FROM node:16' },
        'Docker build progress'
      );
    });

    it('should log push progress events', async () => {
      const mockStream = {};
      mockImage.push.mockResolvedValue(mockStream);
      
      mockModem.followProgress.mockImplementation((stream, callback, onProgress) => {
        const progressEvent = { status: 'Pushing layer' };
        onProgress(progressEvent);
        callback(null);
      });

      mockImage.inspect.mockResolvedValue({
        Id: 'sha256:abc123def456',
        RepoDigests: ['my-registry/test-image@sha256:fedcba098765']
      });

      await dockerClient.pushImage('my-registry/test-image', 'v1.0.0');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { status: 'Pushing layer' },
        'Docker push progress'
      );
    });
  });
});