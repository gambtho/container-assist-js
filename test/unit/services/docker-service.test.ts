/**
 * Docker Service Unit Tests
 * Focus on service layer logic while mocking infrastructure dependencies
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import type { Logger } from 'pino';
import { DockerError } from '../../../src/errors/index';

// Mock DockerClient first
const mockDockerClient = {
  initialize: jest.fn(),
  build: jest.fn(),
  scan: jest.fn(),
  tag: jest.fn(),
  push: jest.fn(),
  listImages: jest.fn(),
  removeImage: jest.fn(),
  imageExists: jest.fn(),
  listContainers: jest.fn(),
  health: jest.fn(),
};

jest.unstable_mockModule('../../../src/infrastructure/docker-client', () => ({
  DockerClient: jest.fn().mockImplementation(() => mockDockerClient),
}));

// Mock factories
const mockLogger = {
  child: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const createMockLogger = () => {
  const childLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  mockLogger.child.mockReturnValue(childLogger);
  return mockLogger as unknown as jest.Mocked<Logger>;
};

const createMockScanResult = () => ({
  vulnerabilities: [],
  summary: {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
  },
  scanner: 'trivy',
  scanned_at: new Date().toISOString(),
  image: 'test:latest',
});

// Now import the modules after mocking
const { DockerService, createDockerService } = await import('../../../src/services/docker');
const { ErrorCode } = await import('../../../src/domain/types/errors');

describe('DockerService', () => {
  let dockerService: DockerService;
  let logger: jest.Mocked<Logger>;
  let config: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup DockerClient mock implementations
    mockDockerClient.initialize.mockResolvedValue(undefined);
    mockDockerClient.build.mockResolvedValue({
      imageId: 'sha256:mock-image-id',
      tags: ['test:latest'],
      success: true,
      logs: ['Step 1/5', 'Step 2/5'],
      buildTime: Date.now(),
      digest: 'sha256:mock-image-id',
    });
    mockDockerClient.scan.mockResolvedValue(createMockScanResult());
    mockDockerClient.tag.mockResolvedValue(undefined);
    mockDockerClient.push.mockResolvedValue({ digest: 'sha256:mock-digest' });
    mockDockerClient.listImages.mockResolvedValue([]);
    mockDockerClient.removeImage.mockResolvedValue(undefined);
    mockDockerClient.imageExists.mockResolvedValue(true);
    mockDockerClient.listContainers.mockResolvedValue([]);
    mockDockerClient.health.mockResolvedValue({
      available: true,
      version: '20.10.17',
      trivyAvailable: true,
      systemInfo: {
        os: 'linux',
        arch: 'x86_64',
        containers: 5,
        images: 10,
        serverVersion: '20.10.17',
      },
    });

    logger = createMockLogger();

    config = {
      socketPath: '/var/run/docker.sock',
      host: 'localhost',
      port: 2376,
      protocol: 'http',
      trivy: {
        scannerPath: 'trivy',
        cacheDir: '/tmp/trivy',
        timeout: 30000,
      },
    };

    dockerService = new DockerService(config, logger);
  });

  describe('Constructor and Initialization', () => {
    test('should create service with valid configuration', () => {
      expect(dockerService).toBeInstanceOf(DockerService);
      expect(mockLogger.child).toHaveBeenCalledWith({ service: 'docker' });
    });

    test('should initialize Docker client', async () => {
      await dockerService.initialize();
      expect(mockDockerClient.initialize).toHaveBeenCalled();
    });

    test('should handle initialization failure', async () => {
      const error = new Error('Docker daemon not running');
      mockDockerClient.initialize.mockRejectedValueOnce(error);

      await expect(dockerService.initialize()).rejects.toThrow();
    });
  });

  describe('Image Building', () => {
    test('should build image successfully', async () => {
      const buildOptions = {
        context: '/test/path',
        dockerfile: 'Dockerfile',
        tags: ['test:latest'],
        buildArgs: { NODE_ENV: 'production' },
        target: 'production',
      };

      const result = await dockerService.buildImage(buildOptions);

      expect(mockDockerClient.build).toHaveBeenCalledWith('/test/path', buildOptions);
      expect(result).toBeDefined();
      expect(result.imageId).toBe('sha256:mock-image-id');
    });

    test('should handle build failure', async () => {
      const buildOptions = {
        context: '/test/path',
        dockerfile: 'Dockerfile',
        tags: ['test:latest'],
      };

      const buildError = new Error('Build failed');
      mockDockerClient.build.mockRejectedValueOnce(buildError);

      await expect(dockerService.buildImage(buildOptions)).rejects.toThrow();
    });

    test('should build with minimal options', async () => {
      const buildOptions = {
        context: '/test/path',
      };

      const result = await dockerService.buildImage(buildOptions);

      expect(result).toBeDefined();
      expect(mockDockerClient.build).toHaveBeenCalled();
    });
  });

  describe('Image Scanning', () => {
    test('should scan image successfully', async () => {
      const imageName = 'test:latest';
      const scanOptions = {
        scanner: 'trivy',
        severityThreshold: 'high',
        skipUpdate: true,
      };

      const result = await dockerService.scanImage(imageName, scanOptions);

      expect(mockDockerClient.scan).toHaveBeenCalledWith(imageName, scanOptions);
      expect(result).toBeDefined();
      expect(result.scanner).toBe('trivy');
    });

    test('should scan image with default options', async () => {
      const imageName = 'test:latest';

      const result = await dockerService.scanImage(imageName);

      expect(mockDockerClient.scan).toHaveBeenCalledWith(imageName, undefined);
      expect(result).toBeDefined();
    });

    test('should handle scan failure', async () => {
      const imageName = 'test:latest';
      const scanError = new Error('Scan failed');
      mockDockerClient.scan.mockRejectedValueOnce(scanError);

      await expect(dockerService.scanImage(imageName)).rejects.toThrow();
    });
  });

  describe('Image Tagging', () => {
    test('should tag image with single tag', async () => {
      const imageId = 'sha256:abcdef123456';
      const tags = ['test:v1.0.0'];

      await dockerService.tagImage(imageId, tags);

      expect(mockDockerClient.tag).toHaveBeenCalledWith(imageId, 'test:v1.0.0');
    });

    test('should tag image with multiple tags', async () => {
      const imageId = 'sha256:abcdef123456';
      const tags = ['test:v1.0.0', 'test:latest'];

      await dockerService.tagImage(imageId, tags);

      expect(mockDockerClient.tag).toHaveBeenCalledTimes(2);
      expect(mockDockerClient.tag).toHaveBeenCalledWith(imageId, 'test:v1.0.0');
      expect(mockDockerClient.tag).toHaveBeenCalledWith(imageId, 'test:latest');
    });

    test('should handle empty tags array', async () => {
      const imageId = 'sha256:abcdef123456';
      const tags: string[] = [];

      await dockerService.tagImage(imageId, tags);

      expect(mockDockerClient.tag).not.toHaveBeenCalled();
    });
  });

  describe('Image Push Operations', () => {
    test('should push single image', async () => {
      const imageTag = 'test:latest';

      const result = await dockerService.pushImage(imageTag);

      expect(mockDockerClient.push).toHaveBeenCalledWith(imageTag, undefined);
      expect(result).toBeDefined();
      expect(result.digest).toBe('sha256:mock-digest');
    });

    test('should push image with registry prefix', async () => {
      const imageTag = 'test:latest';
      const registry = 'registry.io';

      const result = await dockerService.pushImage(imageTag, registry);

      expect(mockDockerClient.push).toHaveBeenCalledWith('registry.io/test:latest', registry);
      expect(result).toBeDefined();
      expect(result.digest).toBe('sha256:mock-digest');
    });
  });

  describe('Image Management', () => {
    test('should list images', async () => {
      const mockImages = [
        { Id: 'sha256:abc123', RepoTags: ['test:latest'], Size: 100000, Created: Date.now() / 1000 },
      ];
      mockDockerClient.listImages.mockResolvedValueOnce(mockImages);

      const result = await dockerService.listImages();

      expect(mockDockerClient.listImages).toHaveBeenCalled();
      expect(result).toEqual(mockImages);
    });

    test('should remove image', async () => {
      const imageId = 'sha256:abc123';

      await dockerService.removeImage(imageId);

      expect(mockDockerClient.removeImage).toHaveBeenCalledWith(imageId);
    });

    test('should check if image exists', async () => {
      const imageId = 'sha256:abc123';
      mockDockerClient.imageExists.mockResolvedValueOnce(true);

      const exists = await dockerService.imageExists(imageId);

      expect(exists).toBe(true);
      expect(mockDockerClient.imageExists).toHaveBeenCalledWith(imageId);
    });
  });

  describe('Container Management', () => {
    test('should list containers', async () => {
      const mockContainers = [
        { Id: 'container1', Names: ['/test1'], Image: 'test:latest', State: 'running' },
      ];
      mockDockerClient.listContainers.mockResolvedValueOnce(mockContainers);

      const result = await dockerService.listContainers();

      expect(mockDockerClient.listContainers).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockContainers);
    });

    test('should list containers with options', async () => {
      const options = { all: true };
      const mockContainers = [
        { Id: 'container1', Names: ['/test1'], Image: 'test:latest', State: 'running' },
      ];
      mockDockerClient.listContainers.mockResolvedValueOnce(mockContainers);

      const result = await dockerService.listContainers(options);

      expect(mockDockerClient.listContainers).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockContainers);
    });
  });

  describe('Health Checks', () => {
    test('should return healthy status when Docker is available', async () => {
      const result = await dockerService.health();

      expect(mockDockerClient.health).toHaveBeenCalled();
      expect(result.available).toBe(true);
      expect(result.healthy).toBe(true);
    });

    test('should throw error when Docker is unavailable', async () => {
      mockDockerClient.health.mockResolvedValueOnce({
        available: false,
      });

      await expect(dockerService.health()).rejects.toThrow(DockerError);
    });

    test('should get system information via health check', async () => {
      const result = await dockerService.getSystemInfo();

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });

  describe('Service Lifecycle', () => {
    test('should close service gracefully', async () => {
      await dockerService.close();

      expect(logger.child().info).toHaveBeenCalledWith('Docker service closed');
    });
  });
});

describe('DockerService Factory', () => {
  let logger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = createMockLogger();

    // Setup mocks for factory initialization
    mockDockerClient.initialize.mockResolvedValue(undefined);
  });

  test('should create and initialize service via factory', async () => {
    const config = {
      socketPath: '/var/run/docker.sock',
      trivy: { scannerPath: 'trivy' },
    };

    const service = await createDockerService(config, logger);

    expect(service).toBeInstanceOf(DockerService);
    expect(mockDockerClient.initialize).toHaveBeenCalled();
  });

  test('should handle factory initialization failure', async () => {
    const config = {
      socketPath: '/invalid/path',
    };

    mockDockerClient.initialize.mockRejectedValueOnce(new Error('Connection failed'));

    await expect(createDockerService(config, logger)).rejects.toThrow();
  });
});
